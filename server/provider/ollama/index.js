/**
 * provider/ollama/index.js
 *
 * Ollama — jalankan LLM lokal di device sendiri. Tidak perlu API key.
 * Install: https://ollama.com  (Windows/Mac/Linux/Termux)
 *
 * Optimasi untuk EMORA agent:
 * - temperature 0.1 → lokal bisa lebih deterministik (inferensi lebih lambat)
 * - maxTokens 4096 → aman di semua model populer Ollama
 * - keepAlive "5m" → model tetap di-load selama 5 menit setelah request,
 *   supaya request berikutnya langsung cepat (tidak perlu load ulang)
 */

import { ChatOpenAI } from "@langchain/openai";

export const PROVIDER_ID    = "ollama";
export const PROVIDER_LABEL = "Ollama (Local)";
export const PROVIDER_TIER  = "free";
export const KEY_URL        = "https://ollama.com";

// Model populer yang support tool calling di Ollama
export const KNOWN_MODELS = [
  { id: "llama3.2:3b",           label: "llama3.2:3b            — Paling ringan, tool calling OK", context: 128000 },
  { id: "llama3.2:1b",           label: "llama3.2:1b            — Ultra ringan",                   context: 128000 },
  { id: "llama3.1:8b",           label: "llama3.1:8b            — Balance terbaik",                context: 128000 },
  { id: "llama3.1:70b",          label: "llama3.1:70b           — Butuh GPU kuat / RAM 48GB+",     context: 128000 },
  { id: "qwen2.5:7b",            label: "qwen2.5:7b             — Bagus untuk coding",             context: 128000 },
  { id: "qwen2.5:14b",           label: "qwen2.5:14b            — Lebih powerful",                 context: 128000 },
  { id: "mistral:7b",            label: "mistral:7b             — Stabil, tool calling support",   context: 32768  },
  { id: "mistral-nemo:12b",      label: "mistral-nemo:12b       — Nemo, context 128K",            context: 128000 },
  { id: "deepseek-r1:7b",        label: "deepseek-r1:7b         — Reasoning lokal",               context: 128000 },
  { id: "gemma2:9b",             label: "gemma2:9b              — Google Gemma 2",                 context: 8192   },
  { id: "phi4:14b",              label: "phi4:14b               — Microsoft Phi-4",               context: 16384  },
];

export const DEFAULT_MODEL = "llama3.2:3b";

function getHost() {
  const raw = process.env.OLLAMA_HOST || process.env.MODEL_URL || "http://localhost:11434";
  return raw.replace(/\/v1\/?$/, "").replace(/\/$/, "");
}

export function getBaseURL() {
  return `${getHost()}/v1`;
}

/**
 * Scan model yang tersedia di Ollama secara live.
 * @returns {Promise<string[]>} array nama model
 */
export async function scanModels() {
  const host = getHost();
  try {
    const res  = await fetch(`${host}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    return (data.models || []).map(m => m.name);
  } catch {
    return [];
  }
}

export function createLLM({ apiKey, model, tools = [], ollamaHost } = {}) {
  const host    = ollamaHost ? ollamaHost.replace(/\/$/, "") : getHost();
  const baseURL = `${host}/v1`;

  const llm = new ChatOpenAI({
    apiKey: "ollama",           // Ollama tidak perlu key asli, tapi field wajib ada
    model:  model || process.env.MODEL_NAME || DEFAULT_MODEL,
    configuration: {
      baseURL,
      defaultHeaders: { "X-Keep-Alive": "5m" },
    },
    temperature: 0.1,
    maxTokens:   4096,
    modelKwargs: { keep_alive: "5m" },
  });

  return tools.length ? llm.bindTools(tools, { toolChoice: "auto" }) : llm;
}
