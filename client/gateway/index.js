import { bot } from "./telegram.js";

// Emulate active gateways structure for tools compatibility
export const activeGateways = [];

export async function initGateways() {
  if (bot && activeGateways.length === 0) {
    activeGateways.push({
      name: "telegram",
      module: {
        bot,
        sessions: {}, // populated on demand
        sendFile: async (botInst, chatId, filePath, caption) => {
          await botInst.telegram.sendDocument(chatId, { source: filePath }, { caption });
          return "File sent successfully";
        }
      }
    });
  }
  return activeGateways;
}

// Ensure it initializes activeGateways list
initGateways();

export async function sendFileToUser(sessionId, filePath, caption = "") {
  try {
    // In Elynisia, sessionId maps directly to the Telegram chatId or userId
    if (!bot) throw new Error("Bot not initialized");
    await bot.telegram.sendDocument(sessionId, { source: filePath }, { caption });
    return [`[TELEGRAM] Sent file successfully`];
  } catch (err) {
    console.error("[Gateway index] Error sending file:", err.message);
    return [`[TELEGRAM] ERROR: ${err.message}`];
  }
}

export async function sendProgressUpdate(sessionId, message) {
  try {
    if (!bot) return false;
    // Format message to ensure it matches Telegram markdown specifications
    const formattedMessage = message
      .replace(/_/g, "\\_")
      .replace(/\*/g, "\\*"); // Simple escape to avoid parse issues, or keep raw if formatted

    await bot.telegram.sendMessage(sessionId, message, { parse_mode: "Markdown" });
    return true;
  } catch (err) {
    console.error("[Gateway index] Error sending progress update:", err.message);
    return false;
  }
}

export async function sendStepSequence(sessionId, steps, { delayMs = 1000, prefix = "🔧" } = {}) {
  if (!Array.isArray(steps) || steps.length === 0) return;
  for (let i = 0; i < steps.length; i++) {
    const stepText = `${prefix} *Langkah ${i + 1}/${steps.length}*\n${steps[i]}`;
    await sendProgressUpdate(sessionId, stepText);
    if (i < steps.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

export async function handleGroupCommand(sessionId, command) {
  return "❌ Group command not supported.";
}
