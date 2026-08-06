import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { bot } from "../gateway/telegram.js";
import path from "path";
import fs from "fs";
import { getUserWorkspaceRoot, getUserCwd } from "../utils/workspace.js";
import * as crypto from "crypto";

export const sendMediaTool = new DynamicStructuredTool({
  name: "send_media",
  description: "Send media (images, documents, audio, or text-to-speech) to the user via Telegram.",
  schema: z.object({
    type: z.enum(["image", "document", "audio", "tts"]),
    url_or_path: z.string().optional().describe("Absolute URL or relative path in workspace to the file (Not needed for TTS)"),
    caption: z.string().optional().describe("Caption for image or document (max 1024 chars)"),
    tts_text: z.string().optional().describe("Text to convert to speech (if type is tts)")
  }),
  func: async ({ type, url_or_path, caption, tts_text }, runManager, config) => {
    try {
      if (!bot) return "Bot instance not found. Cannot send media.";
      
      const { chatId, userId } = config.configurable || {};
      if (!chatId) return "No chatId provided in config.";

      // Resolve file source
      let source = url_or_path;
      if (type !== "tts" && source) {
        if (!source.startsWith("http://") && !source.startsWith("https://")) {
           // Handle as local workspace file
           const cwd = getUserCwd(userId);
           const root = getUserWorkspaceRoot(userId);
           const absolutePath = path.resolve(cwd, source);
           if (!absolutePath.startsWith(root)) {
             return "Access denied: Path must be inside your workspace.";
           }
           if (!fs.existsSync(absolutePath)) {
             return `File not found: ${source}`;
           }
           source = { source: absolutePath };
        }
      }

      if (type === "image") {
        await bot.telegram.sendPhoto(chatId, source, { caption, parse_mode: "Markdown" });
        return "Image sent successfully.";
      } 
      else if (type === "document") {
        await bot.telegram.sendDocument(chatId, source, { caption, parse_mode: "Markdown" });
        return "Document sent successfully.";
      }
      else if (type === "audio") {
        await bot.telegram.sendAudio(chatId, source, { caption, parse_mode: "Markdown" });
        return "Audio sent successfully.";
      }
      else if (type === "tts") {
        if (!tts_text) return "tts_text is required for TTS.";
        
        // Use Google Translate TTS API as a simple TTS engine
        // Limit is roughly 200 chars per request, we truncate if needed
        const encodedText = encodeURIComponent(tts_text.substring(0, 200));
        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodedText}&tl=id&client=tw-ob`;
        
        await bot.telegram.sendVoice(chatId, ttsUrl, { caption: "🔊 Voice Message" });
        return "Text-to-Speech sent successfully.";
      }
      
      return "Invalid type provided.";
    } catch (err) {
      return `Failed to send media: ${err.message}`;
    }
  },
});
