import { z } from "zod";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { eventBus } from "../utils/eventBus.js";

const activeJobs = {};

export const schedulerTool = new DynamicStructuredTool({
  name: "scheduler",
  description: "Menjalankan tugas AI di latar belakang secara berulang (interval timer). Sangat cocok untuk monitoring file atau peringatan. WAJIB gunakan DETIK. Memiliki batas eksekusi (count) agar tidak spam.",
  schema: z.object({
    action: z.enum(["start_job", "stop_job"]),
    job_id: z.string().describe("ID unik tanpa spasi, misal: 'monitor_workspaces'"),
    session_id: z.string().describe("Session ID milik user"),
    interval_seconds: z.number().optional().describe("Berapa detik sekali tugas dieksekusi? (Minimal 10 detik agar aman)"),
    count: z.number().optional().describe("Jumlah maksimal tugas dieksekusi. Default: 1. Jika mencapai 0, job otomatis dihapus."),
    prompt: z.string().optional().describe("Instruksi tugas. Akhiri dengan: 'Jika kondisi tidak terpenuhi, balas HANYA dengan kata SILENT_ABORT'")
  }),
  async func({ action, job_id, session_id, interval_seconds, count = 1, prompt }) {
    if (action === "stop_job") {
      if (!activeJobs[job_id]) return `❌ Job '${job_id}' tidak ditemukan atau sudah mati.`;
      
      clearInterval(activeJobs[job_id].interval);
      delete activeJobs[job_id];
      return `✅ Job '${job_id}' berhasil dimatikan secara manual.`;
    }

    if (activeJobs[job_id]) return `❌ Job '${job_id}' sudah berjalan. Matikan dulu jika ingin mengganti.`;

    // Pengaman: Batasi minimal 10 detik agar LLM punya waktu mikir
    const sec = Math.max(interval_seconds || 10, 10); 
    let remainingCount = count;

    // Simpan referensi interval
    const intervalTimer = setInterval(() => {
      // Panggil AI untuk mengeksekusi tugas
      eventBus.emit("execute_bg_task", { job_id, session_id, prompt });

      // Kurangi nyawa (count)
      remainingCount--;

      // Jika nyawa habis, hentikan interval dan hapus dari memori
      if (remainingCount <= 0) {
        clearInterval(intervalTimer);
        delete activeJobs[job_id];
        console.log(`[SCHEDULER] Job '${job_id}' otomatis berhenti (Count habis).`);
      }
    }, sec * 1000);

    // Simpan ke database sementara
    activeJobs[job_id] = { 
      interval: intervalTimer, 
      remainingCount 
    };

    return `✅ Job monitoring '${job_id}' berjalan tiap ${sec} detik. (Maksimal eksekusi: ${count} kali). Tugas akan otomatis hancur setelah batas tercapai.`;
  }
});
