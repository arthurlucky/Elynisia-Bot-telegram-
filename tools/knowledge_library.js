/**
 * tools/knowledge_library.js
 *
 * Tool utama untuk Knowledge Library System.
 *
 * Actions:
 *
 *  check    — Cari apakah ada knowledge relevan di library/ untuk topik/query ini.
 *             TANPA membaca isi file. Return daftar file yang ditemukan + metadata.
 *             Ini selalu langkah pertama sebelum collect atau write.
 *
 *  read     — Baca isi satu file dari library. Dipanggil setelah 'check' menemukan
 *             file yang relevan. Gunakan relPath dari hasil check.
 *
 *  read_latest — Baca file terbaru untuk topik+subtopik tertentu secara otomatis.
 *                Berguna kalau agent ingin langsung dapat versi terkini.
 *
 *  collect  — Kumpulkan knowledge baru dari web search untuk topik yang TIDAK ditemukan
 *             di library. Hasilnya dikembalikan ke agent untuk diverifikasi & diformat,
 *             BELUM langsung ditulis (agent perlu konfirmasi format & isi dulu).
 *
 *  write    — Simpan knowledge ke library setelah agent memformat kontennya.
 *             Menjalankan pipeline validasi non-LLM sebelum menulis.
 *             Jika confidence rendah, agent diberitahu dan bisa putuskan lanjut/batalkan.
 *
 *  list_topics — Daftar semua topik & subtopik yang ada di library sekarang.
 *
 *  rebuild_index — Paksa rebuild index (kalau baru tambah file manual via git).
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z }                     from "zod";
import fs                        from "fs";
import path                      from "path";

import {
  searchIndex,
  listTopics,
  readEntry,
  readEntries,
  writeEntry,
  rebuildIndex,
  loadIndex,
} from "../library/index.js";

import {
  validateKnowledge,
  formatValidationResult,
} from "../library/validator.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSearchResults(results) {
  if (!results.length) return "Tidak ada knowledge ditemukan di library untuk query ini.";
  return results.map((r, i) =>
    `[${i + 1}] ${r.topic}/${r.subtopic}/${r.date}/${r.filename}\n` +
    `    relPath: ${r.relPath} | ukuran: ${Math.round(r.sizeBytes / 1024 * 10) / 10} KB | skor: ${r.score}`
  ).join("\n");
}

// ─── Tool ─────────────────────────────────────────────────────────────────────

export const knowledgeLibraryTool = new DynamicStructuredTool({
  name: "knowledge_library",

  description:
    "Pusat pengetahuan EMORA (Knowledge Library). " +
    "Berisi dokumen dari berbagai topik (pertanian, medis, astronomi, dll) yang " +
    "terorganisir per tanggal sehingga selalu relevan dengan waktu. " +
    "WORKFLOW WAJIB: (1) Selalu 'check' dulu sebelum menjawab pertanyaan factual. " +
    "(2) Kalau ditemukan → 'read' file yang paling relevan. " +
    "(3) Kalau tidak ditemukan → 'collect' untuk kumpulkan info baru → " +
    "format konten → 'write' setelah user konfirmasi. " +
    "JANGAN baca isi library secara massal — muat HANYA file yang relevan.",

  schema: z.object({
    action: z.enum(["check", "read", "read_latest", "collect", "write", "list_topics", "rebuild_index"]),

    // check
    query:    z.string().optional().describe("Query pencarian bebas, mis. 'pengolahan padi organik'"),
    topic:    z.string().optional().describe("Filter topik eksplisit, mis. 'pertanian'"),
    subtopic: z.string().optional().describe("Filter subtopik, mis. 'pengolahan'"),
    max_results: z.number().optional().describe("Maksimum hasil (default 8)"),

    // read
    rel_path: z.string().optional().describe("Path relatif file yang akan dibaca, dari hasil 'check'"),
    rel_paths: z.array(z.string()).optional().describe("Baca beberapa file sekaligus (max 5)"),

    // write
    filename: z.string().optional().describe("Nama file, mis. 'tata_cara_pengolahan_organik.txt'"),
    content:  z.string().optional().describe("Isi dokumen yang akan disimpan"),
    date_override: z.string().optional().describe("Tanggal override format DD_MM_YYYY (default: hari ini)"),
    skip_validation: z.boolean().optional().describe("Lewati validasi (untuk konten yang sudah diverifikasi manual)"),

    // collect
    search_query: z.string().optional().describe("Query untuk web search saat collect"),
  }),

  async func({
    action,
    query       = "",
    topic       = "",
    subtopic    = "",
    max_results = 8,
    rel_path    = "",
    rel_paths   = [],
    filename    = "",
    content     = "",
    date_override,
    skip_validation = false,
    search_query    = "",
  }) {
    try {

      // ── check ──────────────────────────────────────────────────────────────
      if (action === "check") {
        if (!query && !topic && !subtopic) {
          return "Berikan minimal salah satu dari: query, topic, atau subtopic untuk mencari.";
        }
        const results = searchIndex(query || `${topic} ${subtopic}`, {
          maxResults: max_results,
          topic:     topic || "",
          subtopic:  subtopic || "",
        });

        if (!results.length) {
          const topics = listTopics();
          const topicHint = Object.keys(topics).length
            ? `\n\nTopik yang tersedia di library: ${Object.keys(topics).join(", ")}`
            : "\n\nLibrary masih kosong.";
          return (
            `Tidak ditemukan knowledge untuk query "${query || topic + "/" + subtopic}" di library.` +
            topicHint +
            `\n\nGunakan action 'collect' untuk mengumpulkan informasi baru dari web, ` +
            `atau action 'list_topics' untuk melihat isi library secara lengkap.`
          );
        }

        const catalog = loadIndex();
        return (
          `Ditemukan ${results.length} file relevan (library memiliki ${catalog.count} total entri):\n\n` +
          formatSearchResults(results) +
          `\n\nGunakan action 'read' dengan rel_path salah satu di atas untuk membaca isinya.`
        );
      }

      // ── read ───────────────────────────────────────────────────────────────
      if (action === "read") {
        if (!rel_path && !rel_paths.length) {
          return "Berikan rel_path (dari hasil 'check') untuk file yang ingin dibaca.";
        }
        if (rel_paths.length) {
          const files = readEntries(rel_paths, 5);
          return files.map(f => `=== ${f.path} ===\n${f.content}`).join("\n\n---\n\n");
        }
        const text = readEntry(rel_path);
        return `=== ${rel_path} ===\n\n${text}`;
      }

      // ── read_latest ────────────────────────────────────────────────────────
      if (action === "read_latest") {
        if (!topic || !subtopic) {
          return "Berikan topic dan subtopic untuk read_latest.";
        }
        const results = searchIndex("", { topic, subtopic, maxResults: 1 });
        if (!results.length) {
          return `Tidak ada file untuk ${topic}/${subtopic} di library.`;
        }
        const latest = results[0];
        const text   = readEntry(latest.absPath);
        return `=== ${latest.relPath} (${latest.date}) ===\n\n${text}`;
      }

      // ── collect ────────────────────────────────────────────────────────────
      if (action === "collect") {
        const tavilyKey = process.env.TAVILY_API_KEY;
        if (!tavilyKey) {
          return (
            "TAVILY_API_KEY tidak dikonfigurasi. Tidak bisa melakukan web search otomatis.\n" +
            "Opsi: (1) Isi TAVILY_API_KEY di .env, atau (2) Tulis knowledge secara manual " +
            "dan gunakan action 'write' dengan konten yang sudah disiapkan."
          );
        }

        const q = search_query || query || `${topic} ${subtopic}`.replace(/_/g, " ");
        if (!q.trim()) {
          return "Berikan search_query, query, atau kombinasi topic+subtopic untuk collect.";
        }

        // Gunakan search_web yang sudah ada di tools, tapi di sini kita
        // langsung panggil Tavily karena tool harus mandiri
        const { validateKnowledge: vk } = await import("../library/validator.js");

        // Collect: kirimkan hasil search ke agent untuk diformat
        const { default: fetch } = await import("node-fetch").catch(() => ({ default: globalThis.fetch }));

        const tavilyRes = await globalThis.fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key:      tavilyKey,
            query:        q,
            max_results:  8,
            search_depth: "advanced",
            include_answer: true,
          }),
        });

        const tavilyData = await tavilyRes.json();
        const answer     = tavilyData.answer || "";
        const sources    = (tavilyData.results || []).slice(0, 6).map(r => ({
          title:   r.title,
          url:     r.url,
          snippet: (r.content || "").slice(0, 400),
        }));

        if (!sources.length) {
          return `Tidak ada hasil web search untuk "${q}". Coba query yang lebih spesifik.`;
        }

        return (
          `[COLLECT RESULT] Query: "${q}"\n\n` +
          (answer ? `Ringkasan otomatis:\n${answer}\n\n` : "") +
          `Sumber ditemukan (${sources.length}):\n` +
          sources.map((s, i) =>
            `[${i + 1}] ${s.title}\n    URL: ${s.url}\n    Snippet: ${s.snippet}\n`
          ).join("\n") +
          `\n---\n` +
          `Langkah selanjutnya:\n` +
          `1. Analisis dan format konten dari sumber di atas menjadi dokumen knowledge yang akurat.\n` +
          `2. Tentukan topic="${topic || "?"}", subtopic="${subtopic || "?"}", filename="<nama_file>.txt"\n` +
          `3. Konfirmasi dengan user apakah konten sudah benar.\n` +
          `4. Gunakan action 'write' untuk menyimpannya ke library setelah dikonfirmasi.`
        );
      }

      // ── write ──────────────────────────────────────────────────────────────
      if (action === "write") {
        if (!topic || !subtopic || !filename || !content) {
          return "Wajib isi: topic, subtopic, filename, dan content untuk menyimpan knowledge.";
        }
        if (content.trim().length < 50) {
          return "Konten terlalu pendek (min 50 karakter). Pastikan isinya informatif.";
        }

        // Tentukan tanggal
        let date = new Date();
        if (date_override) {
          const m = date_override.match(/^(\d{2})_(\d{2})_(\d{4})$/);
          if (m) date = new Date(`${m[3]}-${m[2]}-${m[1]}`);
        }

        // Validasi non-LLM
        let validationNote = "";
        if (!skip_validation) {
          const validation = await validateKnowledge({
            topic, subtopic, content,
            query: `${topic} ${subtopic}`.replace(/_/g, " "),
          });
          validationNote = "\n\n" + formatValidationResult(validation);

          // Block jika unverified DAN bukan karena tidak ada internet
          if (validation.level === "unverified" && !validation.warnings.some(w => w.includes("tidak ada akses"))) {
            return (
              `Penulisan DIBATALKAN — confidence terlalu rendah (${validation.confidence}%).\n` +
              validationNote +
              `\n\nSaran: Perbaiki konten, tambah referensi, atau gunakan skip_validation=true ` +
              `jika konten sudah diverifikasi manual.`
            );
          }
        } else {
          validationNote = "\n\n⚠ Validasi dilewati (skip_validation=true). Konten disimpan tanpa verifikasi otomatis.";
        }

        const { relPath, absPath } = writeEntry({ topic, subtopic, filename, content, date });

        return (
          `✅ Knowledge berhasil disimpan:\n` +
          `  Path: ${relPath}\n` +
          `  Topik: ${topic} → ${subtopic}\n` +
          `  Tanggal: ${date.toLocaleDateString("id-ID")}\n` +
          `  Ukuran: ${content.length} karakter` +
          validationNote
        );
      }

      // ── list_topics ────────────────────────────────────────────────────────
      if (action === "list_topics") {
        const topics  = listTopics();
        const catalog = loadIndex();
        if (!Object.keys(topics).length) {
          return "Library masih kosong. Gunakan action 'write' untuk menambah knowledge pertama.";
        }
        return (
          `Library memiliki ${catalog.count} file di ${Object.keys(topics).length} topik:\n\n` +
          Object.entries(topics).map(([t, subs]) =>
            `📁 ${t}/\n${subs.map(s => `   └─ ${s}/`).join("\n")}`
          ).join("\n\n")
        );
      }

      // ── rebuild_index ──────────────────────────────────────────────────────
      if (action === "rebuild_index") {
        const catalog = rebuildIndex();
        return `Index dibangun ulang. Ditemukan ${catalog.count} file di library.`;
      }

      return `Action tidak dikenal: ${action}`;

    } catch (err) {
      return `❌ knowledge_library error: ${err.message}`;
    }
  },
});

export default knowledgeLibraryTool;
