/**
 * provider/openai/index.js
 * API key: https://platform.openai.com/api-keys
 */

import { ChatOpenAI } from "@langchain/openai";

export const PROVIDER_ID    = "openai";
export const PROVIDER_LABEL = "OpenAI";
export const PROVIDER_TIER  = "paid";
export const BASE_URL       = "https://api.openai.com/v1";
export const KEY_URL        = "https://platform.openai.com/api-keys";

export const MODELS = [
  { id: "gpt-4o-mini",          label: "gpt-4o-mini            — Recommended, hemat & pintar", context: 128000, tier: "paid" },
  { id: "gpt-4o",               label: "gpt-4o                 — Flagship, paling powerful",   context: 128000, tier: "paid" },
  { id: "gpt-4-turbo",          label: "gpt-4-turbo            — Konteks 128K",                context: 128000, tier: "paid" },
  { id: "gpt-3.5-turbo",        label: "gpt-3.5-turbo          — Termurah",                    context: 16385,  tier: "paid" },
  { id: "o1-mini",              label: "o1-mini                — Reasoning ringan",            context: 128000, tier: "paid" },
  { id: "o3-mini",              label: "o3-mini                — Reasoning terbaru",           context: 200000, tier: "paid" },
];

export const DEFAULT_MODEL = "gpt-4o-mini";

export function createLLM({ apiKey, model, tools = [] } = {}) {
  const llm = new ChatOpenAI({
    apiKey: apiKey || process.env.MODEL_API || process.env.OPENAI_API_KEY,
    model:  model  || process.env.MODEL_NAME || DEFAULT_MODEL,
    configuration: { baseURL: BASE_URL },
    temperature: 0.2,
    // PERF: default diturunkan dari 4096 -> 2048, override via .env
    // MODEL_MAX_TOKENS jika butuh output panjang.
    maxTokens: Number(process.env.MODEL_MAX_TOKENS) || 2048,
  });
  return tools.length ? llm.bindTools(tools, { toolChoice: "auto" }) : llm;
}
