/**
 * provider/anthropic/index.js
 *
 * Anthropic Claude — native adapter via @langchain/anthropic.
 * WAJIB install dulu: npm install @langchain/anthropic
 * API key: https://console.anthropic.com
 *
 * Kenapa TIDAK pakai endpoint OpenAI-compat Anthropic:
 * Tool calling melalui endpoint compat sering gagal karena format
 * ToolMessage yang diharapkan Anthropic berbeda dengan standar OpenAI.
 * @langchain/anthropic handle konversi ini secara native.
 *
 * Optimasi untuk EMORA agent:
 * - streaming: false → tool call parsing lebih reliable
 * - maxTokens: 8192 → Claude butuh cukup token untuk reasoning + output
 */

export const PROVIDER_ID    = "anthropic";
export const PROVIDER_LABEL = "Anthropic Claude";
export const PROVIDER_TIER  = "paid";
export const BASE_URL       = "https://api.anthropic.com";
export const KEY_URL        = "https://console.anthropic.com";
export const INSTALL_HINT   = "npm install @langchain/anthropic";

export const MODELS = [
  { id: "claude-opus-4-5",            label: "claude-opus-4-5           — Paling cerdas, lambat & mahal",   tier: "paid", context: 200000 },
  { id: "claude-sonnet-4-5",          label: "claude-sonnet-4-5         — Recommended: balance terbaik",    tier: "paid", context: 200000 },
  { id: "claude-haiku-4-5",           label: "claude-haiku-4-5          — Tercepat & termurah",             tier: "paid", context: 200000 },
  { id: "claude-3-5-sonnet-20241022", label: "claude-3-5-sonnet-20241022 — Stable release Sonnet 3.5",     tier: "paid", context: 200000 },
  { id: "claude-3-5-haiku-20241022",  label: "claude-3-5-haiku-20241022 — Stable Haiku 3.5",              tier: "paid", context: 200000 },
  { id: "claude-3-haiku-20240307",    label: "claude-3-haiku-20240307   — Hemat banget (Claude 3)",        tier: "paid", context: 200000 },
];

export const DEFAULT_MODEL = "claude-sonnet-4-5";

let _ChatAnthropic = null;

async function loadAdapter() {
  if (_ChatAnthropic) return _ChatAnthropic;
  try {
    const mod = await import("@langchain/anthropic");
    _ChatAnthropic = mod.ChatAnthropic;
    return _ChatAnthropic;
  } catch {
    throw new Error(
      `[provider:anthropic] @langchain/anthropic belum terinstall.\n` +
      `Jalankan: ${INSTALL_HINT}\n` +
      `Lalu jalankan ulang: emora`
    );
  }
}

export async function createLLM({ apiKey, model, tools = [] } = {}) {
  const Cls = await loadAdapter();

  const llm = new Cls({
    apiKey:    apiKey || process.env.ANTHROPIC_API_KEY || process.env.MODEL_API,
    model:     model  || process.env.MODEL_NAME || DEFAULT_MODEL,
    temperature: 0.2,
    // PERF: default diturunkan dari 8192 -> 2048, override via .env
    // MODEL_MAX_TOKENS jika butuh output panjang.
    maxTokens: Number(process.env.MODEL_MAX_TOKENS) || 2048,
    streaming:   false,
  });

  return tools.length ? llm.bindTools(tools, { toolChoice: "auto" }) : llm;
}
