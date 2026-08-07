import "dotenv/config";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import axios from "axios";
import FormData from "form-data";
import path from "path";
import fs from "fs";
import { getUserWorkspaceRoot, getUserCwd } from "../../client/utils/container.js";

const token = process.env.TELEGRAM_TOKEN_BOT;
const API_ROOT = `https://api.telegram.org/bot${token}`;

// Max file size that Telegram accepts for sendPhoto is 10MB; set a generous cap.
const MAX_FILE_BYTES = 10 * 1024 * 1024;

// Upload media via direct multipart request.
// NOTE: we deliberately bypass bot.telegram.* (Telegraf's node-fetch based
// multipart path) which can hang indefinitely on this network and time out.
// Direct axios + form-data uploads complete reliably (~1-4s).
async function uploadMedia(method, fields) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value && typeof value === "object" && value.source !== undefined) {
      // Supported file fields
      form.append(key, value.source, { filename: value.filename });
    } else if (value !== undefined && value !== null) {
      form.append(key, String(value));
    }
  }

  const res = await axios.post(`${API_ROOT}/${method}`, form, {
    headers: form.getHeaders(),
    timeout: 60000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  if (!res.data || !res.data.ok) {
    throw new Error(res.data?.description || `Telegram API error on ${method}`);
  }
  return res.data.result;
}

// Resolve a local path in the user's workspace into a validated { source, filename }.
function resolveLocalFile(userId, source) {
  const cwd = getUserCwd(userId);
  const root = getUserWorkspaceRoot(userId);
  const absolutePath = path.resolve(cwd, source);
  if (!absolutePath.startsWith(root)) {
    throw new Error("Access denied: Path must be inside your workspace.");
  }
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${source}`);
  }
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${source}`);
  }
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`File too large: ${(stat.size / 1024 / 1024).toFixed(1)}MB (max 10MB)`);
  }
  return { source: fs.createReadStream(absolutePath), filename: path.basename(absolutePath) };
}

// Download a remote URL into memory and return it as an uploadable file.
async function resolveRemoteFile(url, defaultFilename) {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 60000,
    maxContentLength: Infinity,
  });
  if (!res.data || res.data.byteLength === 0) {
    throw new Error(`Could not download file: ${url}`);
  }
  if (res.data.byteLength > MAX_FILE_BYTES) {
    throw new Error(`File too large: ${(res.data.byteLength / 1024 / 1024).toFixed(1)}MB (max 10MB)`);
  }
  let filename = defaultFilename;
  try {
    const u = new URL(url);
    const base = path.basename(u.pathname);
    if (base && base.includes(".")) filename = base;
  } catch {}
  return { source: Buffer.from(res.data), filename };
}

export const sendMediaTool = new DynamicStructuredTool({
  name: "send_media",
  description: "Send media (images, documents, audio, or text-to-speech) to the user via Telegram.",
  schema: z.object({
    type: z.enum(["image", "document", "audio", "tts"]),
    url_or_path: z.string().optional().describe("Absolute URL or relative path in workspace to the file (Not needed for TTS)"),
    caption: z.string().optional().describe("Caption for image or document (max 1024 chars)"),
    tts_text: z.string().optional().describe("Text to convert to speech (if type is tts)")
  }),
  func: async ({ type, url_or_path, caption, tts_text }, ctx) => {
    try {
      if (!token) return "TELEGRAM_TOKEN_BOT is not configured. Cannot send media.";

      const { chatId } = ctx || {};
      if (!chatId) return "No chatId provided in config.";

      const safeCaption = (caption || "").substring(0, 1024);

      if (type === "image") {
        if (!url_or_path) return "url_or_path is required for image.";
        const file = /^https?:\/\//.test(url_or_path)
          ? await resolveRemoteFile(url_or_path, "image.jpg")
          : resolveLocalFile(ctx?.userId, url_or_path);
        await uploadMedia("sendPhoto", { chat_id: chatId, photo: file, caption: safeCaption });
        return "Image sent successfully.";
      }

      if (type === "document") {
        if (!url_or_path) return "url_or_path is required for document.";
        const file = /^https?:\/\//.test(url_or_path)
          ? await resolveRemoteFile(url_or_path, "document")
          : resolveLocalFile(ctx?.userId, url_or_path);
        await uploadMedia("sendDocument", { chat_id: chatId, document: file, caption: safeCaption });
        return "Document sent successfully.";
      }

      if (type === "audio") {
        if (!url_or_path) return "url_or_path is required for audio.";
        const file = /^https?:\/\//.test(url_or_path)
          ? await resolveRemoteFile(url_or_path, "audio")
          : resolveLocalFile(ctx?.userId, url_or_path);
        await uploadMedia("sendAudio", { chat_id: chatId, audio: file, caption: safeCaption });
        return "Audio sent successfully.";
      }

      if (type === "tts") {
        if (!tts_text) return "tts_text is required for TTS.";

        const encoded = encodeURIComponent(tts_text.substring(0, 200));
        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=id&client=tw-ob`;

        // Download the audio bytes (axios, not Telegraf's stream path) and re-upload as voice.
        const audio = await axios.get(ttsUrl, {
          responseType: "arraybuffer",
          timeout: 60000,
          maxContentLength: Infinity,
        });
        if (!audio.data || audio.data.byteLength === 0) {
          return "TTS failed: could not generate audio.";
        }

        const voice = { source: Buffer.from(audio.data), filename: "voice.ogg" };
        await uploadMedia("sendVoice", { chat_id: chatId, voice });
        return "Text-to-Speech sent successfully.";
      }

      return "Invalid type provided.";
    } catch (err) {
      return `Failed to send media: ${err.message}`;
    }
  },
});