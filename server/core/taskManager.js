import { ask } from "./agent.js";
import { getUserDB } from "../../client/core/db.js";

class TaskManager {
  constructor() {
    this.queues = new Map();
    this.processing = new Set();
    this.activeTasks = new Map(); // taskId -> { userId, type, prompt, status, startedAt }
    this.taskCounter = 0;
  }

  enqueueUserMessage(userId, text, ctx, chatId) {
    const taskId = ++this.taskCounter;
    const taskObj = { taskId, text, ctx, chatId };
    
    this.activeTasks.set(taskId, {
      userId,
      type: "Main Agent",
      prompt: text,
      status: "Thinking...",
      startedAt: Date.now()
    });

    // Eksekusi secara paralel tanpa queue/block
    this.executeUserTask(userId, taskObj)
      .catch((err) => console.error(`Error executing task for user ${userId}:`, err))
      .finally(() => {
        this.activeTasks.delete(taskId);
      });
      
    return taskId;
  }

  async executeUserTask(userId, task) {
    // Moved from telegram.js text handler
    const { text, ctx, taskId, chatId } = task;
    let isTyping = true;
    const sendTyping = () => { if (isTyping) ctx.sendChatAction("typing").catch(() => {}); };
    sendTyping();
    const typingInterval = setInterval(sendTyping, 4000);

    // ── Per-tool log & streaming reply ────────────────────────────────────
    let logHeaderSent = false;
    let logMessageId = null;
    let logContent = "⚙️ LOG EKSEKUSI TUGAS:";

    const sendInChunks = async (msg) => {
      if (msg.length <= 4000) {
        await ctx.reply(msg, { parse_mode: "Markdown" });
        return;
      }
      const chunks = msg.match(/[\s\S]{1,4000}/g) || [msg];
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: "Markdown" });
      }
    };

    // Animasikan jawaban akhir seperti "chat streaming" (ketik bertahap).
    // Setelah teks lengkap masuk, pesan diperbarui satu kali lagi dengan Markdown.
    const streamAnimate = async (fullText) => {
      if (!fullText || fullText.length > 4000) return false;

      const step = Math.max(3, Math.round(fullText.length / 20));
      const partials = [];
      for (let i = step; i < fullText.length; i += step) partials.push(fullText.slice(0, i));
      partials.push(fullText);

      const sent = await ctx.reply(partials[0] || "…").catch(() => null);
      if (!sent || !sent.message_id) return false;

      let last = partials[0];
      for (let i = 1; i < partials.length; i++) {
        await new Promise((r) => setTimeout(r, 110));
        if (partials[i] === last) continue;
        last = partials[i];
        try {
          await ctx.telegram.editMessageText(ctx.chat.id, sent.message_id, undefined, partials[i]);
        } catch (e) {
          // "message is not modified" atau transient — abaikan
        }
      }

      // Edit terakhir dengan Markdown agar format akhir tampil rapi
      try {
        await ctx.telegram.editMessageText(ctx.chat.id, sent.message_id, undefined, fullText, { parse_mode: "Markdown" });
      } catch (e) {
        // Markdown gagal di-parse → biarkan versi plain yang sudah tampil
      }
      return true;
    };

    try {
      const db = await getUserDB(userId);
      const modeRow = await db.get("SELECT val FROM profile_memory WHERE key = 'chat_mode'");
      const chatMode = modeRow ? modeRow.val : "streaming"; // default

      const result = await ask(userId, chatId, text, async (ev) => {
        if (ev.type === "tool_use") {
          // Log setiap tool yang dipakai dalam satu pesan
          const activeTask = this.activeTasks.get(taskId);
          if (activeTask) activeTask.status = `Using tool: ${ev.name}`;

          logContent += `\n🔧 Tool: ${ev.name}`;

          if (!logHeaderSent) {
            logHeaderSent = true;
            const msg = await ctx.reply(logContent).catch(() => null);
            if (msg) logMessageId = msg.message_id;
          } else if (logMessageId) {
            await ctx.telegram.editMessageText(chatId, logMessageId, undefined, logContent).catch(() => null);
          }
        }
      });

      isTyping = false;
      clearInterval(typingInterval);

      const finalResult = result || "";
      if (chatMode === "streaming") {
        const animated = await streamAnimate(finalResult);
        if (!animated) {
          await sendInChunks(finalResult);
        }
      } else {
        await sendInChunks(finalResult);
      }
    } catch (err) {
      isTyping = false;
      clearInterval(typingInterval);
      await ctx.reply(`❌ *Error:* ${err.message}`, { parse_mode: "Markdown" }).catch(() => {});
    }
  }

  registerSubagentTask(userId, prompt) {
    const taskId = ++this.taskCounter;
    this.activeTasks.set(taskId, {
      userId,
      type: "Subagent (Research)",
      prompt: prompt,
      status: "Working...",
      startedAt: Date.now()
    });
    return taskId;
  }

  updateTaskStatus(taskId, status) {
    if (this.activeTasks.has(taskId)) {
      this.activeTasks.get(taskId).status = status;
    }
  }

  finishTask(taskId) {
    this.activeTasks.delete(taskId);
  }

  getUserActiveTasks(userId) {
    const tasks = [];
    for (const [taskId, task] of this.activeTasks.entries()) {
      if (task.userId === userId) {
        tasks.push({ taskId, ...task });
      }
    }
    return tasks;
  }
}

export const taskManager = new TaskManager();
