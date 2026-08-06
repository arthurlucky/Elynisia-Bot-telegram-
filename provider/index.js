/**
 * provider/index.js
 *
 * Registry terpusat. Import dari masing-masing subfolder provider.
 * Satu-satunya file yang perlu dipakai dari luar (main.js, gateway, webui).
 *
 * Cara pakai:
 *   import { createLLM, getProviderMeta, PROVIDERS } from "./provider/index.js";
 *   const llm = await createLLM(tools);   // auto-detect dari .env
 */

// ── Lazy imports — setiap provider di-import saat dibutuhkan ──────────────────
// Ini mencegah crash kalau salah satu provider butuh npm install tambahan
// (mis. anthropic) tapi user pakai provider lain.

export const PROVIDERS = {
  groq:           { label: "Groq",              tier: "free",   type: "standard" },
  gemini:         { label: "Google Gemini",     tier: "free",   type: "standard" },
  openrouter:     { label: "OpenRouter",        tier: "free",   type: "standard" },
  nvidia:         { label: "NVIDIA NIM",        tier: "free",   type: "standard" },
  openai:         { label: "OpenAI",            tier: "paid",   type: "standard" },
  ollama:         { label: "Ollama (Local)",    tier: "free",   type: "standard" },
  anthropic:      { label: "Anthropic Claude",  tier: "paid",   type: "async",   installHint: "npm install @langchain/anthropic" },
  huggingface:    { label: "HuggingFace",       tier: "free",   type: "standard" },
  custom:         { label: "Custom Endpoint",   tier: "custom", type: "standard" },
};

// ── Provider module paths (relative ke file ini) ─────────────────────────────
const PROVIDER_PATHS = {
  groq:       "./groq/index.js",
  gemini:     "./gemini/index.js",
  openrouter: "./openrouter/index.js",
  nvidia:     "./nvidia/index.js",
  openai:     "./openai/index.js",
  ollama:     "./ollama/index.js",
  anthropic:  "./anthropic/index.js",
  huggingface:"./huggingface/index.js",
  custom:     "./customEndpoint/index.js",
};

/**
 * Deteksi provider aktif dari .env.
 * Priority: MODEL_PROVIDER > URL pattern matching > fallback ollama
 */
export function detectProvider() {
  if (process.env.MODEL_PROVIDER) {
    return process.env.MODEL_PROVIDER.toLowerCase().trim();
  }

  const url = (process.env.MODEL_URL || "").toLowerCase();
  if (!url) return "ollama";

  if (url.includes("groq.com"))                  return "groq";
  if (url.includes("googleapis.com"))            return "gemini";
  if (url.includes("openrouter.ai"))             return "openrouter";
  if (url.includes("nvidia.com"))                return "nvidia";
  if (url.includes("openai.com"))                return "openai";
  if (url.includes("anthropic.com"))             return "anthropic";
  if (url.includes("huggingface.co"))            return "huggingface";
  if (url.includes("localhost") ||
      url.includes("127.0.0.1") ||
      url.includes(":11434"))                     return "ollama";

  // URL ada tapi tidak cocok dengan yang dikenal → anggap custom
  return "custom";
}

/**
 * Kembalikan metadata provider. Untuk status display, banner, dll.
 */
export function getProviderMeta(providerKey) {
  const key = providerKey || detectProvider();
  const meta = PROVIDERS[key] || { label: key, tier: "unknown", type: "standard" };
  return { key, ...meta };
}

/**
 * Import provider module secara dinamis.
 */
async function loadProviderModule(key) {
  const modPath = PROVIDER_PATHS[key];
  if (!modPath) {
    throw new Error(
      `[provider] Provider tidak dikenal: "${key}"\n` +
      `Provider yang tersedia: ${Object.keys(PROVIDERS).join(", ")}`
    );
  }
  return import(modPath);
}

/**
 * Factory utama — buat LLM instance yang siap dipakai, dengan tools ter-bind.
 *
 * @param {Array}   tools       LangChain tools array
 * @param {string}  [provider]  Override provider key (default: auto-detect)
 * @param {object}  [opts]      Override tambahan { apiKey, model, url, ... }
 * @returns {Promise<BaseChatModel>}
 */
export async function createLLM(tools = [], provider, opts = {}) {
  const key = (provider || detectProvider()).toLowerCase();
  const mod = await loadProviderModule(key);

  // Anthropic butuh async factory
  if (typeof mod.createLLM === "function") {
    const result = mod.createLLM({ tools, ...opts });
    // Handle both sync and async factories
    return result instanceof Promise ? await result : result;
  }

  throw new Error(`[provider:${key}] Tidak ada fungsi createLLM yang diekspor`);
}

/**
 * Ambil daftar model untuk provider tertentu.
 * Dipakai oleh `emora model` dan `emora setup`.
 */
export async function getProviderModels(providerKey) {
  try {
    const mod = await loadProviderModule(providerKey);
    return mod.MODELS || mod.KNOWN_MODELS || [];
  } catch {
    return [];
  }
}

/**
 * Ambil default model untuk provider.
 */
export async function getDefaultModel(providerKey) {
  try {
    const mod = await loadProviderModule(providerKey);
    return mod.DEFAULT_MODEL || "";
  } catch {
    return "";
  }
}

/**
 * Ambil URL untuk mendapatkan API key provider.
 */
export async function getKeyUrl(providerKey) {
  try {
    const mod = await loadProviderModule(providerKey);
    return mod.KEY_URL || null;
  } catch {
    return null;
  }
}

export default { createLLM, detectProvider, getProviderMeta, getProviderModels, PROVIDERS };
