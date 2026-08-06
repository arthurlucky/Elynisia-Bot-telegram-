import { ask } from "./agent.js";

class TaskManager {
  constructor() {
    this.queues = new Map();
    this.processing = new Set();
    this.activeTasks = new Map(); // taskId -> { userId, type, prompt, status, startedAt }
    this.taskCounter = 0;
  }

  enqueueUserMessage(userId, text, ctx, chatId) {
    if (!this.queues.has(userId)) {
      this.queues.set(userId, []);
    }
    
    const taskId = ++this.taskCounter;
    this.queues.get(userId).push({ taskId, text, ctx, chatId });
    
    this.activeTasks.set(taskId, {
      userId,
      type: "Main Agent",
      prompt: text,
      status: "Queued",
      startedAt: Date.now()
    });

    this.processQueue(userId);
    return taskId;
  }

  async processQueue(userId) {
    if (this.processing.has(userId)) return;
    
    const queue = this.queues.get(userId);
    if (!queue || queue.length === 0) return;

    this.processing.add(userId);
    const task = queue.shift();
    
    const activeTask = this.activeTasks.get(task.taskId);
    if (activeTask) activeTask.status = "Thinking...";

    try {
      await this.executeUserTask(userId, task);
    } catch (err) {
      console.error(`Error executing task for user ${userId}:`, err);
    } finally {
      this.activeTasks.delete(task.taskId);
      this.processing.delete(userId);
      this.processQueue(userId);
    }
  }

  async executeUserTask(userId, task) {
    // Moved from telegram.js text handler
    const { text, ctx, taskId, chatId } = task;
    let isTyping = true;
    const sendTyping = () => { if (isTyping) ctx.sendChatAction("typing").catch(() => {}); };
    sendTyping();
    const typingInterval = setInterval(sendTyping, 4000);

    try {
      const toolLogs = [];

      const result = await ask(userId, chatId, text, (ev) => {
        if (ev.type === "tool_use") {
          toolLogs.push(`🔧 *Tool:* \`${ev.name}\``);
          const activeTask = this.activeTasks.get(taskId);
          if (activeTask) activeTask.status = `Using tool: ${ev.name}`;
        }
      });

      isTyping = false;
      clearInterval(typingInterval);

      let finalMsg = "";
      if (toolLogs.length > 0) {
        finalMsg += `⚙️ *LOG EKSEKUSI TUGAS:*\n${toolLogs.join("\n")}\n\n`;
      }
      finalMsg += result;

      if (finalMsg.length > 4000) {
        const chunks = finalMsg.match(/[\s\S]{1,4000}/g) || [finalMsg];
        for (const chunk of chunks) {
          await ctx.reply(chunk, { parse_mode: "Markdown" });
        }
      } else {
        await ctx.reply(finalMsg, { parse_mode: "Markdown" });
      }
    } catch (err) {
      isTyping = false;
      clearInterval(typingInterval);
      await ctx.reply(`❌ *Error:* ${err.message}`, { parse_mode: "Markdown" });
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
