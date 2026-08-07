import { taskManager } from "../core/taskManager.js";
import { ask } from "../core/agent.js";

export const swarmDelegateTool = {
  name: "spawn_subagent",
  description: "Delegasikan tugas kepada Subagent (misal: untuk riset mendalam, pencarian web ekstensif, koding, atau analisis data). Subagent bekerja secara asinkron di belakang layar tanpa memblokir chat utama.",
  parameters: {
    type: "object",
    properties: {
      role: {
        type: "string",
        description: "Peran subagent, misal: 'Web Researcher', 'Data Analyst'."
      },
      task: {
        type: "string",
        description: "Tugas spesifik dan sangat detail yang harus diselesaikan oleh subagent."
      }
    },
    required: ["role", "task"]
  },
  func: async ({ role, task }, context) => {
    const userId = context.userId;
    const chatId = context.chatId;

    const taskId = taskManager.registerSubagentTask(userId, `[${role}] ${task}`);

    // Asynchronously run subagent
    (async () => {
      try {
        const subagentPrompt = `[SUBAGENT INSTRUCTION: ROLE = ${role}]\nKamu ditugaskan oleh Agent Utama untuk menyelesaikan tugas berikut:\n\n${task}\n\nBerikan laporan hasil yang detail dan komprehensif agar Agent Utama bisa menggunakannya.`;
        
        const result = await ask(userId, chatId, subagentPrompt, (ev) => {
          if (ev.type === "tool_use") {
            taskManager.updateTaskStatus(taskId, `Memakai tool: ${ev.name}`);
          }
        });

        const { bot } = await import("../../client/gateway/telegram.js");
        const report = `🤖 *LAPORAN SUBAGENT [${role}]*\n━━━━━━━━━━━━━━━━━━━━\n${result}`;
        
        // Split if too long
        if (report.length > 4000) {
          const chunks = report.match(/[\s\S]{1,4000}/g) || [report];
          for (const chunk of chunks) {
            await bot.telegram.sendMessage(userId, chunk, { parse_mode: "Markdown" });
          }
        } else {
          await bot.telegram.sendMessage(userId, report, { parse_mode: "Markdown" });
        }
      } catch (err) {
        console.error("Subagent Error:", err);
        try {
          const { bot } = await import("../../client/gateway/telegram.js");
          await bot.telegram.sendMessage(userId, `❌ *Subagent Error:* ${err.message}`, { parse_mode: "Markdown" });
        } catch(e) {}
      } finally {
        taskManager.finishTask(taskId);
      }
    })();

    return `Tugas berhasil didelegasikan ke Subagent [${role}]. Subagent sedang bekerja di latar belakang (paralel) dan akan mengirimkan hasil laporannya ke chat ini saat selesai. Anda dapat melanjutkan obrolan atau mengecek statusnya via perintah /btw.`;
  }
};
