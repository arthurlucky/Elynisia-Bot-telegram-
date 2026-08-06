import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";

import {
  getPatterns,
  getPatternByKey,
  markSkillCreated,
  deletePattern,
  resetPatternCount,
  SKILL_THRESHOLD,
} from "../utils/patternTracker.js";
import { resolveWorkspacePath } from "../utils/workspace.js";
import { invalidateSystemPromptCache } from "../core/chat.js";

const SKILL_DIR = "./skill";
const FACTORY_DIR = "./skill_factory";
// Folder yang sama dipakai oleh project_manager.js untuk menyimpan plan/project
const PROJECTS_DIR = resolveWorkspacePath(".emora_projects");

// ==========================================
// HELPERS
// ==========================================

async function ensureDirs() {
  await fs.mkdir(SKILL_DIR, { recursive: true });
  await fs.mkdir(FACTORY_DIR, { recursive: true });
}

function toSafeName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_\-]/g, "");
}

async function readFileSafe(filePath) {
  try {
    return await fs.readFile(path.resolve(filePath), "utf8");
  } catch {
    return null;
  }
}

/**
 * Mencari file skill.md dalam berbagai variasi kapitalisasi
 * @param {string} dirPath - Path ke direktori skill
 * @returns {Promise<string|null>} - Nama file yang ditemukan atau null
 */
async function findSkillMdFile(dirPath) {
  try {
    const files = await fs.readdir(dirPath);
    const skillMdFile = files.find(file => {
      if (file.toLowerCase() !== "skill.md") return false;
      // Verifikasi bahwa ini adalah file, bukan direktori
      const fullPath = path.join(dirPath, file);
      return fs.stat(fullPath).then(stat => stat.isFile()).catch(() => false);
    });
    
    return skillMdFile || null;
  } catch {
    return null;
  }
}

/**
 * Membaca file skill.md dari direktori skill (case-insensitive)
 * @param {string} skillDir - Path ke direktori skill
 * @returns {Promise<string|null>} - Konten file skill.md atau null
 */
async function readSkillMdContent(skillDir) {
  try {
    const fileName = await findSkillMdFile(skillDir);
    if (!fileName) return null;
    return await fs.readFile(path.join(skillDir, fileName), "utf8");
  } catch {
    return null;
  }
}

/**
 * Menulis file skill.md ke direktori skill (selalu gunakan lowercase)
 * @param {string} skillDir - Path ke direktori skill
 * @param {string} content - Konten yang akan ditulis
 */
async function writeSkillMd(skillDir, content) {
  // Selalu tulis dengan nama lowercase untuk konsistensi
  await fs.writeFile(path.join(skillDir, "skill.md"), content, "utf8");
}

// ── Project helpers (jembatan ke hasil kerja project_manager) ──
async function listProjectFiles() {
  try {
    const entries = await fs.readdir(PROJECTS_DIR);
    return entries.filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
}

async function readProject(projectName) {
  try {
    const raw = await fs.readFile(
      path.join(PROJECTS_DIR, `${projectName}.json`),
      "utf8"
    );
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeProject(projectName, data) {
  await fs.writeFile(
    path.join(PROJECTS_DIR, `${projectName}.json`),
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

function summarizeProject(data) {
  const total = data.tasks?.length || 0;
  const done = data.tasks?.filter((t) => t.status === "DONE").length || 0;
  return {
    project_name: data.project_name,
    total_tasks: total,
    completed_tasks: done,
    is_complete: total > 0 && done === total,
    skill_generated: !!data.skill_generated,
    skill_name: data.skill_name || null,
    skipped: !!data.skill_skipped,
    skip_reason: data.skill_skip_reason || null,
    ready_for_evaluation:
      total > 0 && done === total && !data.skill_generated && !data.skill_skipped,
  };
}

// Append skill ke index utama skill/SKILL.md
async function appendToSkillIndex(safeName, description) {
  const indexPath = path.join(SKILL_DIR, "SKILL.md");
  try {
    let index = await fs.readFile(indexPath, "utf8");
    if (!index.includes(safeName)) {
      index += `\n- **${safeName}**: ${description}`;
      await fs.writeFile(indexPath, index, "utf8");
    }
  } catch {
    // SKILL.md belum ada, biarkan saja
  }
}

// ==========================================
// SKILL FACTORY TOOL
// ==========================================

export const skillFactoryTool = new DynamicStructuredTool({
  name: "skill_factory",
  description:
    "Mengelola Skill Factory EMORA: lihat pola tool yang terdeteksi, evaluasi hasil project yang sudah selesai dari project_manager, buat skill otomatis dari pola atau dari project yang hasilnya bagus, dan kelola skill yang sudah ada. Actions: list_patterns, list_projects, read_project, skip_project, create_skill, list_skills, read_skill, delete_pattern, reset_pattern.",
  schema: z.object({
    action: z
      .enum([
        "list_patterns",
        "list_projects",
        "read_project",
        "skip_project",
        "create_skill",
        "list_skills",
        "read_skill",
        "delete_pattern",
        "reset_pattern",
      ])
      .describe("Aksi yang akan dilakukan"),

    // Untuk create_skill
    pattern_key: z
      .string()
      .optional()
      .describe(
        "Key pola dari list_patterns yang akan dijadikan dasar skill (opsional jika membuat skill manual)"
      ),
    source_project: z
      .string()
      .optional()
      .describe(
        "project_name (dari project_manager) yang hasilnya dievaluasi bagus dan dijadikan dasar skill ini. Mengisi field ini akan menandai project tersebut sebagai sudah dikonversi jadi skill."
      ),
    skill_name: z
      .string()
      .optional()
      .describe("Nama skill (huruf kecil, tanpa spasi). Contoh: web_research"),
    skill_description: z
      .string()
      .optional()
      .describe("Deskripsi singkat satu kalimat tentang fungsi skill ini"),
    skill_content: z
      .string()
      .optional()
      .describe(
        "Isi dokumen skill dalam format Markdown. Wajib mengikuti template: name, deskripsi, versi, trigger, langkah-langkah, contoh, catatan."
      ),
    skill_script: z
      .string()
      .optional()
      .describe(
        "Script shell opsional (.sh) yang bisa dijadikan template otomasi untuk skill ini"
      ),

    // Untuk read/delete skill & pattern
    skill_name_target: z
      .string()
      .optional()
      .describe("Nama skill yang ingin dibaca atau dihapus dari list_skills"),

    // Untuk read_project / skip_project
    project_name: z
      .string()
      .optional()
      .describe(
        "project_name dari project_manager yang ingin dibaca detailnya (read_project) atau dilewati (skip_project)"
      ),
    skip_reason: z
      .string()
      .optional()
      .describe(
        "Alasan kenapa project ini tidak layak dijadikan skill (saat action = skip_project)"
      ),
  }),

  async func({
    action,
    pattern_key,
    source_project,
    skill_name,
    skill_description,
    skill_content,
    skill_script,
    skill_name_target,
    project_name,
    skip_reason,
  }) {
    try {
      await ensureDirs();

      switch (action) {
        // ──────────────────────────────────────────
        // LIST PATTERNS - Tampilkan semua pola terdeteksi
        // ──────────────────────────────────────────
        case "list_patterns": {
          const patterns = await getPatterns();
          const keys = Object.keys(patterns);

          if (keys.length === 0) {
            return JSON.stringify({
              success: true,
              message:
                "Belum ada pola terdeteksi. Pola akan muncul setelah rangkaian tool yang sama digunakan berulang kali.",
              patterns: [],
            });
          }

          const list = keys.map((key) => {
            const p = patterns[key];
            const progress = Math.min(p.count, SKILL_THRESHOLD);
            const bar =
              "█".repeat(progress) +
              "░".repeat(SKILL_THRESHOLD - progress) +
              ` ${p.count}/${SKILL_THRESHOLD}`;
            return {
              key,
              sequence: p.sequence,
              count: p.count,
              threshold: SKILL_THRESHOLD,
              progress_bar: bar,
              sessions_count: p.sessions.length,
              skill_created: p.skill_created,
              skill_name: p.skill_name || null,
              ready_for_skill: p.count >= SKILL_THRESHOLD && !p.skill_created,
              last_seen: p.last_seen
                ? new Date(p.last_seen).toLocaleString("id-ID")
                : null,
            };
          });

          // Sort: yang siap dijadikan skill dulu
          list.sort((a, b) => {
            if (a.ready_for_skill && !b.ready_for_skill) return -1;
            if (!a.ready_for_skill && b.ready_for_skill) return 1;
            return b.count - a.count;
          });

          return JSON.stringify({ success: true, patterns: list });
        }

        // ──────────────────────────────────────────
        // LIST PROJECTS - Tampilkan semua project dari project_manager
        // beserta status kelayakannya untuk dievaluasi jadi skill
        // ──────────────────────────────────────────
        case "list_projects": {
          const files = await listProjectFiles();
          if (files.length === 0) {
            return JSON.stringify({
              success: true,
              message:
                "Belum ada project tersimpan dari project_manager.",
              projects: [],
            });
          }

          const projects = [];
          for (const file of files) {
            const raw = await readFileSafe(path.join(PROJECTS_DIR, file));
            if (!raw) continue;
            let data;
            try {
              data = JSON.parse(raw);
            } catch {
              continue;
            }
            projects.push(summarizeProject(data));
          }

          // Sort: yang siap dievaluasi (selesai & belum jadi skill) duluan
          projects.sort((a, b) => {
            if (a.ready_for_evaluation && !b.ready_for_evaluation) return -1;
            if (!a.ready_for_evaluation && b.ready_for_evaluation) return 1;
            return b.completed_tasks - a.completed_tasks;
          });

          return JSON.stringify({ success: true, projects });
        }

        // ──────────────────────────────────────────
        // READ PROJECT - Baca detail lengkap satu project (semua task +
        // summary_context-nya) agar bisa dinilai kualitasnya
        // ──────────────────────────────────────────
        case "read_project": {
          if (!project_name) {
            return JSON.stringify({
              success: false,
              error: "project_name wajib diisi",
            });
          }
          const data = await readProject(project_name);
          if (!data) {
            return JSON.stringify({
              success: false,
              error: `Project '${project_name}' tidak ditemukan`,
            });
          }

          return JSON.stringify({
            success: true,
            ...summarizeProject(data),
            tasks: data.tasks,
          });
        }

        // ──────────────────────────────────────────
        // SKIP PROJECT - Tandai project sudah dievaluasi tapi hasilnya
        // tidak layak/tidak perlu dijadikan skill
        // ──────────────────────────────────────────
        case "skip_project": {
          if (!project_name) {
            return JSON.stringify({
              success: false,
              error: "project_name wajib diisi",
            });
          }
          const data = await readProject(project_name);
          if (!data) {
            return JSON.stringify({
              success: false,
              error: `Project '${project_name}' tidak ditemukan`,
            });
          }
          data.skill_skipped = true;
          data.skill_skip_reason = skip_reason || "Tidak dijelaskan";
          await writeProject(project_name, data);

          return JSON.stringify({
            success: true,
            message: `Project '${project_name}' ditandai dilewati (tidak dijadikan skill).`,
          });
        }

        // ──────────────────────────────────────────
        // CREATE SKILL - Buat skill dari pola, dari project, atau manual
        // ──────────────────────────────────────────
        case "create_skill": {
          if (!skill_name || !skill_content) {
            return JSON.stringify({
              success: false,
              error: "skill_name dan skill_content wajib diisi",
            });
          }

          const safeName = toSafeName(skill_name);
          if (!safeName) {
            return JSON.stringify({
              success: false,
              error: "skill_name tidak valid",
            });
          }

          const skillDir = path.join(SKILL_DIR, safeName);
          await fs.mkdir(skillDir, { recursive: true });

          // Simpan dokumen skill utama (selalu gunakan lowercase)
          await writeSkillMd(skillDir, skill_content);

          // Simpan script otomasi jika ada
          if (skill_script) {
            const scriptPath = path.join(skillDir, "run.sh");
            await fs.writeFile(scriptPath, skill_script, "utf8");
            // Buat executable
            await fs.chmod(scriptPath, 0o755).catch(() => {});
          }

          // Simpan metadata skill
          const meta = {
            name: safeName,
            description: skill_description || "(no description)",
            source_pattern: pattern_key || null,
            source_project: source_project || null,
            created_at: new Date().toISOString(),
            has_script: !!skill_script,
            version: "1.0.0",
          };
          await fs.writeFile(
            path.join(skillDir, "meta.json"),
            JSON.stringify(meta, null, 2),
            "utf8"
          );

          // Tandai pola sudah jadi skill
          if (pattern_key) {
            await markSkillCreated(pattern_key, safeName);
          }

          // Tandai project (hasil project_manager) sudah jadi skill,
          // supaya tidak dievaluasi/dibuatkan skill duplikat lagi
          if (source_project) {
            const projectData = await readProject(source_project);
            if (projectData) {
              projectData.skill_generated = true;
              projectData.skill_name = safeName;
              await writeProject(source_project, projectData);
            }
          }

          // Update index
          await appendToSkillIndex(
            safeName,
            skill_description || "Auto-generated skill"
          );

          // BUGFIX: tanpa ini, skill yang baru dibuat gak akan muncul di
          // katalog [AVAILABLE SKILLS] (lihat core/chat.js) sampai proses
          // EMORA di-restart manual, karena system prompt di-cache.
          invalidateSystemPromptCache();

          return JSON.stringify({
            success: true,
            message: `✅ Skill '${safeName}' berhasil dibuat!`,
            path: skillDir,
            files: [
              "skill.md",
              ...(skill_script ? ["run.sh"] : []),
              "meta.json",
            ],
            pattern_linked: !!pattern_key,
            project_linked: !!source_project,
          });
        }

        // ──────────────────────────────────────────
        // LIST SKILLS - Tampilkan semua skill yang ada
        // ──────────────────────────────────────────
        case "list_skills": {
          const entries = await fs.readdir(SKILL_DIR, {
            withFileTypes: true,
          }).catch(() => []);

          const skills = [];
          for (const e of entries) {
            if (!e.isDirectory()) continue;

            const metaRaw = await readFileSafe(
              path.join(SKILL_DIR, e.name, "meta.json")
            );
            
            // Baca skill.md secara case-insensitive
            const contentFirst = await readSkillMdContent(
              path.join(SKILL_DIR, e.name)
            );

            let meta = {};
            try {
              meta = metaRaw ? JSON.parse(metaRaw) : {};
            } catch {}

            const firstLine = contentFirst
              ? contentFirst
                  .split("\n")
                  .find((l) => l.trim())
                  ?.replace(/^#+\s*/, "") || e.name
              : e.name;

            skills.push({
              name: e.name,
              description: meta.description || firstLine,
              version: meta.version || "?",
              has_script: meta.has_script || false,
              source_pattern: meta.source_pattern || null,
              created_at: meta.created_at || null,
            });
          }

          return JSON.stringify({
            success: true,
            total: skills.length,
            skills,
          });
        }

        // ──────────────────────────────────────────
        // READ SKILL - Baca isi skill tertentu
        // ──────────────────────────────────────────
        case "read_skill": {
          if (!skill_name_target) {
            return JSON.stringify({
              success: false,
              error: "skill_name_target wajib diisi",
            });
          }
          const safeName = toSafeName(skill_name_target);
          
          // Baca skill.md secara case-insensitive
          const content = await readSkillMdContent(
            path.join(SKILL_DIR, safeName)
          );

          if (!content) {
            return JSON.stringify({
              success: false,
              error: `Skill '${safeName}' tidak ditemukan`,
            });
          }

          const script = await readFileSafe(
            path.join(SKILL_DIR, safeName, "run.sh")
          );

          return JSON.stringify({ 
            success: true, 
            skill_name: safeName, 
            content, 
            script: script || null 
          });
        }

        // ──────────────────────────────────────────
        // DELETE PATTERN - Hapus pola dari tracker
        // ──────────────────────────────────────────
        case "delete_pattern": {
          if (!pattern_key) {
            return JSON.stringify({
              success: false,
              error: "pattern_key wajib diisi",
            });
          }
          await deletePattern(pattern_key);
          return JSON.stringify({
            success: true,
            message: `Pola '${pattern_key}' dihapus dari tracker`,
          });
        }

        // ──────────────────────────────────────────
        // RESET PATTERN - Reset counter pola (mulai hitung ulang)
        // ──────────────────────────────────────────
        case "reset_pattern": {
          if (!pattern_key) {
            return JSON.stringify({
              success: false,
              error: "pattern_key wajib diisi",
            });
          }
          await resetPatternCount(pattern_key);
          return JSON.stringify({
            success: true,
            message: `Counter pola '${pattern_key}' direset ke 0`,
          });
        }

        default:
          return JSON.stringify({
            success: false,
            error: `Action '${action}' tidak dikenal`,
          });
      }
    } catch (err) {
      return JSON.stringify({ success: false, error: err.message });
    }
  },
});