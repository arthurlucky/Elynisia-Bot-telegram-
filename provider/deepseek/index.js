// provider/deepseek/index.js
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import axios from "axios";
import cheerio from "cheerio";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";

export const PROVIDER_ID    = "deepseek";
export const PROVIDER_LABEL = "DeepSeek (Scrape)";
export const PROVIDER_TIER  = "free";
export const KEY_URL        = null; // tidak perlu API key
export const BASE_URL       = "https://aichat.org";

export const MODELS = [
  {
    id:      "deepseek-chat-v3-0324",
    label:   "DeepSeek V3 (via aichat.org) — gratis, tanpa tool calling",
    context: 65536,
    tier:    "free",
  },
];

export const DEFAULT_MODEL = "deepseek-chat-v3-0324";

// ── Custom Chat Model ──────────────────────────────────────────────────────
class DeepSeekScrapeChatModel extends BaseChatModel {
  constructor(options = {}) {
    super(options);
    this.model = options.model || DEFAULT_MODEL;
    this.sessionFile = options.sessionFile || null; // opsional untuk menyimpan histori
  }

  _llmType() {
    return "deepseek-scrape";
  }

  async _generate(messages, options, runManager) {
    // Ambil prompt terakhir dari user
    const lastUserMsg = messages.filter(m => m._getType() === "human").pop();
    if (!lastUserMsg) {
      throw new Error("Tidak ada pesan user.");
    }
    const prompt = lastUserMsg.content;

    // Jalankan scraping
    const result = await deepseekChat(prompt, this.sessionFile);
    const parsed = JSON.parse(result);
    const content = parsed.content || "";

    return {
      generations: [{ text: content, message: new AIMessage(content) }],
    };
  }
}

// ── Fungsi scraping (diadaptasi dari kode yang diberikan) ──────────────
async function deepseekChat(prompt, sessionFile = null) {
  const jar = new CookieJar();
  const client = wrapper(axios.create({ jar, withCredentials: true }));

  // 1. Ambil CSRF token
  const initialRes = await client.get("https://aichat.org/chat", {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
      "accept": "*/*",
      "accept-language": "en-US,en;q=0.9",
      "referer": "https://aichat.org/chat",
      "origin": "https://aichat.org",
    },
  });
  const $ = cheerio.load(initialRes.data);
  const csrfToken = $('meta[name="csrf-token"]').attr("content");
  if (!csrfToken) throw new Error("Gagal mendapatkan CSRF Token.");

  // 2. Baca session (kalau ada)
  let messages = [];
  if (sessionFile && fs.existsSync(sessionFile)) {
    try {
      const fileData = fs.readFileSync(sessionFile, "utf-8");
      messages = fileData ? JSON.parse(fileData) : [];
    } catch (_) { messages = []; }
  }
  messages.push({ role: "user", content: prompt });

  // 3. Kirim request streaming
  const res = await client.post(
    "https://aichat.org/api/chat",
    {
      model: "deepseek/deepseek-chat-v3-0324",
      messages: messages,
    },
    {
      headers: {
        "user-agent": "Mozilla/5.0...",
        "accept": "*/*",
        "x-csrf-token": csrfToken,
        "content-type": "application/json",
        "accept": "text/event-stream",
      },
      responseType: "stream",
    }
  );

  // 4. Proses stream
  return new Promise((resolve, reject) => {
    let result = "";
    let tokenUsage = null;
    res.data.on("data", chunk => {
      const lines = chunk.toString().split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (trimmed.startsWith("data: ")) {
          const dataStr = trimmed.replace("data: ", "").trim();
          if (dataStr === "[DONE]") {
            if (sessionFile && result.trim()) {
              messages.push({ role: "assistant", content: result.trim() });
              fs.writeFileSync(sessionFile, JSON.stringify(messages, null, 2), "utf-8");
            }
            resolve(JSON.stringify({ content: result.trim(), token_usage: tokenUsage }));
            return;
          }
          try {
            const dataJson = JSON.parse(dataStr);
            if (dataJson.usage) {
              tokenUsage = {
                prompt_tokens: dataJson.usage.prompt_tokens,
                completion_tokens: dataJson.usage.completion_tokens,
                total_tokens: dataJson.usage.total_tokens,
              };
            }
            const delta = dataJson.choices?.[0]?.delta;
            const content = delta?.content || "";
            if (content) result += content;
          } catch (_) {}
        }
      }
    });
    res.data.on("end", () => {
      if (sessionFile && result.trim() && !messages.find(h => h.content === result.trim() && h.role === "assistant")) {
        messages.push({ role: "assistant", content: result.trim() });
        fs.writeFileSync(sessionFile, JSON.stringify(messages, null, 2), "utf-8");
      }
      resolve(JSON.stringify({ content: result.trim(), token_usage: tokenUsage }));
    });
    res.data.on("error", reject);
  });
}

// ── Factory untuk EMORA ──────────────────────────────────────────────────
export function createLLM({ tools = [], ...opts } = {}) {
  // tools tidak didukung, abaikan
  return new DeepSeekScrapeChatModel({
    model: opts.model || process.env.MODEL_NAME || DEFAULT_MODEL,
    sessionFile: opts.sessionFile || null,
  });
}

// Ekspor tambahan
export const KNOWN_MODELS = MODELS;
export default { createLLM, MODELS, DEFAULT_MODEL };