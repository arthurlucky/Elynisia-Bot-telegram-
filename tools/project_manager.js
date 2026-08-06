import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { resolveWorkspacePath } from "../utils/workspace.js";
import { sendStepSequence, sendProgressUpdate } from "../gateway/index.js";

const DB_DIR = resolveWorkspacePath(".emora_projects");

// Helper: baca semua file proyek
async function listProjectFiles() {
  try {
    const entries = await fs.readdir(DB_DIR);
    return entries.filter(f => f.endsWith(".json"));
  } catch {
    return [];
  }
}

// Helper: baca satu proyek
async function readProject(projectName) {
  const filePath = path.join(DB_DIR, `${projectName}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Helper: tulis proyek
async function writeProject(projectName, data) {
  const filePath = path.join(DB_DIR, `${projectName}.json`);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// Helper: hapus proyek
async function deleteProjectFile(projectName) {
  const filePath = path.join(DB_DIR, `${projectName}.json`);
  await fs.unlink(filePath);
}

// Helper: format status ringkas
function summarizeProject(data) {
  const total = data.tasks?.length || 0;
  const done = data.tasks?.filter(t => t.status === "DONE").length || 0;
  return {
    project_name: data.project_name,
    total_tasks: total,
    completed_tasks: done,
    is_complete: total > 0 && done === total,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

export default new DynamicStructuredTool({
  name: "project_manager",
  description:
    "Sistem Manajemen Proyek tingkat lanjut. Mendukung: create_plan, get_status, complete_task, list_projects, delete_project, update_task, add_task, get_project_detail, rename_project. " +
    "Setiap langkah (create_plan, complete_task) otomatis mengirim progress ke WA/Telegram jika session_id diisi.",

  schema: z.object({
    action: z.enum([
      "create_plan",
      "get_status",
      "complete_task",
      "list_projects",
      "delete_project",
      "update_task",
      "add_task",
      "get_project_detail",
      "rename_project",
    ]),
    project_name: z.string().describe("Nama proyek (harus unik)"),
    tasks: z.array(z.object({
      id: z.string().describe("ID unik, misal: 'task_1'"),
      description: z.string(),
      depends_on: z.array(z.string()).optional().describe("ID task lain yang wajib selesai sebelum ini bisa dikerjakan"),
    })).optional().describe("Diperlukan untuk create_plan"),
    task_id: z.string().optional().describe("ID task yang diselesaikan (complete_task) atau diupdate (update_task)"),
    new_description: z.string().optional().describe("Deskripsi baru (untuk update_task)"),
    new_depends_on: z.array(z.string()).optional().describe("Dependensi baru (untuk update_task)"),
    new_task_id: z.string().optional().describe("ID task baru (untuk add_task)"),
    new_task_description: z.string().optional().describe("Deskripsi task baru (untuk add_task)"),
    new_task_depends_on: z.array(z.string()).optional().describe("Dependensi task baru (untuk add_task)"),
    summary_context: z.string().optional().describe("Konteks hasil task (complete_task)"),
    session_id: z.string().optional().describe("Session ID untuk broadcast progress"),
    force: z.boolean().optional().describe("Jika true, timpa proyek yang sudah ada (create_plan) atau hapus tanpa konfirmasi (delete_project)"),
    new_name: z.string().optional().describe("Nama baru (untuk rename_project)"),
  }),

  async func({
    action,
    project_name,
    tasks,
    task_id,
    new_description,
    new_depends_on,
    new_task_id,
    new_task_description,
    new_task_depends_on,
    summary_context,
    session_id,
    force,
    new_name,
  }) {
    await fs.mkdir(DB_DIR, { recursive: true }).catch(() => {});

    try {
      // ─── CREATE PLAN ──────────────────────────────────────────────
      if (action === "create_plan") {
        if (!project_name) return "❌ project_name wajib diisi.";
        if (!tasks || tasks.length === 0) return "❌ tasks tidak boleh kosong.";

        const existing = await readProject(project_name);
        if (existing && !force) {
          return `❌ Proyek "${project_name}" sudah ada. Gunakan force: true untuk menimpa.`;
        }

        const plan = {
          project_name,
          tasks: tasks.map(t => ({ ...t, status: "PENDING", context: "" })),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        await writeProject(project_name, plan);

        if (session_id) {
          sendStepSequence(
            session_id,
            tasks.map((t, i) => `${i+1}. ${t.description}`),
            { delayMs: 1000, prefix: "📋" }
          ).catch(() => {});
        }

        return `✅ Plan "${project_name}" dibuat (${tasks.length} task). Gunakan get_status untuk mulai.`;
      }

      // ─── GET STATUS ──────────────────────────────────────────────
      if (action === "get_status") {
        const plan = await readProject(project_name);
        if (!plan) return `❌ Proyek "${project_name}" tidak ditemukan.`;

        const pending = plan.tasks.filter(t => t.status === "PENDING");
        const completed = plan.tasks.filter(t => t.status === "DONE");

        if (pending.length === 0) {
          return `🎉 SEMUA TUGAS SELESAI (${completed.length}/${plan.tasks.length}). Beritahu pengguna.`;
        }

        const readyTasks = pending.filter(t => {
          if (!t.depends_on || t.depends_on.length === 0) return true;
          return t.depends_on.every(depId => plan.tasks.find(pt => pt.id === depId)?.status === "DONE");
        });

        const summary = completed.map(c => `[${c.id}] ${c.context}`).join("\n");
        const readyList = readyTasks.map(t => `- ${t.id}: ${t.description}`).join("\n");

        return `📊 STATUS: Selesai ${completed.length}/${plan.tasks.length}\n\n🟢 TUGAS SIAP:\n${readyList || "(tidak ada)"}\n\n📝 KONTEKS SEBELUMNYA:\n${summary || "(belum ada)"}`;
      }

      // ─── COMPLETE TASK ──────────────────────────────────────────
      if (action === "complete_task") {
        const plan = await readProject(project_name);
        if (!plan) return `❌ Proyek "${project_name}" tidak ditemukan.`;
        if (!task_id) return "❌ task_id wajib diisi.";

        const taskIdx = plan.tasks.findIndex(t => t.id === task_id);
        if (taskIdx === -1) return `❌ Task "${task_id}" tidak ditemukan.`;

        if (plan.tasks[taskIdx].status === "DONE") {
          return `⚠️ Task "${task_id}" sudah selesai.`;
        }

        plan.tasks[taskIdx].status = "DONE";
        plan.tasks[taskIdx].context = summary_context || "Tidak ada konteks.";
        plan.updated_at = new Date().toISOString();
        await writeProject(project_name, plan);

        if (session_id) {
          const doneCount = plan.tasks.filter(t => t.status === "DONE").length;
          sendProgressUpdate(
            session_id,
            `✅ *${task_id}* selesai (${doneCount}/${plan.tasks.length})\n${plan.tasks[taskIdx].description}`
          ).catch(() => {});
        }

        return `✅ Task "${task_id}" selesai. Cek get_status untuk lanjut.`;
      }

      // ─── LIST PROJECTS ──────────────────────────────────────────
      if (action === "list_projects") {
        const files = await listProjectFiles();
        if (files.length === 0) return "ℹ️ Belum ada proyek tersimpan.";

        const projects = [];
        for (const f of files) {
          const name = f.replace(".json", "");
          const data = await readProject(name);
          if (data) projects.push(summarizeProject(data));
        }

        const output = projects.map(p =>
          `- ${p.project_name} (${p.completed_tasks}/${p.total_tasks} selesai, ${p.is_complete ? "✅" : "⏳"})`
        ).join("\n");
        return `📂 Daftar Proyek:\n${output}`;
      }

      // ─── DELETE PROJECT ────────────────────────────────────────
      if (action === "delete_project") {
        const existing = await readProject(project_name);
        if (!existing) return `❌ Proyek "${project_name}" tidak ditemukan.`;

        if (!force) {
          return `⚠️ Proyek "${project_name}" akan dihapus. Gunakan force: true untuk konfirmasi.`;
        }

        await deleteProjectFile(project_name);
        return `✅ Proyek "${project_name}" berhasil dihapus.`;
      }

      // ─── UPDATE TASK ────────────────────────────────────────────
      if (action === "update_task") {
        const plan = await readProject(project_name);
        if (!plan) return `❌ Proyek "${project_name}" tidak ditemukan.`;
        if (!task_id) return "❌ task_id wajib diisi.";

        const taskIdx = plan.tasks.findIndex(t => t.id === task_id);
        if (taskIdx === -1) return `❌ Task "${task_id}" tidak ditemukan.`;

        if (new_description !== undefined) {
          plan.tasks[taskIdx].description = new_description;
        }
        if (new_depends_on !== undefined) {
          plan.tasks[taskIdx].depends_on = new_depends_on;
        }
        plan.updated_at = new Date().toISOString();
        await writeProject(project_name, plan);

        return `✅ Task "${task_id}" diperbarui.`;
      }

      // ─── ADD TASK ──────────────────────────────────────────────
      if (action === "add_task") {
        const plan = await readProject(project_name);
        if (!plan) return `❌ Proyek "${project_name}" tidak ditemukan.`;
        if (!new_task_id || !new_task_description) {
          return "❌ new_task_id dan new_task_description wajib diisi.";
        }

        // Cek duplikat ID
        if (plan.tasks.some(t => t.id === new_task_id)) {
          return `❌ Task ID "${new_task_id}" sudah ada.`;
        }

        const newTask = {
          id: new_task_id,
          description: new_task_description,
          depends_on: new_task_depends_on || [],
          status: "PENDING",
          context: "",
        };
        plan.tasks.push(newTask);
        plan.updated_at = new Date().toISOString();
        await writeProject(project_name, plan);

        return `✅ Task "${new_task_id}" ditambahkan ke proyek "${project_name}".`;
      }

      // ─── GET PROJECT DETAIL ────────────────────────────────────
      if (action === "get_project_detail") {
        const plan = await readProject(project_name);
        if (!plan) return `❌ Proyek "${project_name}" tidak ditemukan.`;

        const total = plan.tasks.length;
        const done = plan.tasks.filter(t => t.status === "DONE").length;
        const pending = total - done;

        let detail = `📋 Proyek: ${plan.project_name}\n`;
        detail += `Status: ${done}/${total} selesai (${pending} pending)\n`;
        detail += `Dibuat: ${plan.created_at}\n`;
        detail += `Diupdate: ${plan.updated_at}\n\n`;
        detail += "Tugas:\n";
        for (const t of plan.tasks) {
          const statusIcon = t.status === "DONE" ? "✅" : "⏳";
          detail += `  ${statusIcon} ${t.id}: ${t.description}`;
          if (t.depends_on && t.depends_on.length > 0) {
            detail += ` (depends on: ${t.depends_on.join(", ")})`;
          }
          if (t.context) {
            detail += `\n      📝 ${t.context}`;
          }
          detail += "\n";
        }
        return detail;
      }

      // ─── RENAME PROJECT ────────────────────────────────────────
      if (action === "rename_project") {
        if (!new_name) return "❌ new_name wajib diisi.";
        const plan = await readProject(project_name);
        if (!plan) return `❌ Proyek "${project_name}" tidak ditemukan.`;

        // Cek apakah new_name sudah dipakai
        const existing = await readProject(new_name);
        if (existing) return `❌ Proyek dengan nama "${new_name}" sudah ada.`;

        // Rename file
        const oldPath = path.join(DB_DIR, `${project_name}.json`);
        const newPath = path.join(DB_DIR, `${new_name}.json`);
        await fs.rename(oldPath, newPath);

        // Update field project_name di dalam data
        plan.project_name = new_name;
        plan.updated_at = new Date().toISOString();
        await writeProject(new_name, plan);

        return `✅ Proyek berhasil diubah nama dari "${project_name}" menjadi "${new_name}".`;
      }

      return `❌ Action "${action}" tidak dikenal.`;

    } catch (err) {
      return `❌ Error project_manager: ${err.message}`;
    }
  },
});