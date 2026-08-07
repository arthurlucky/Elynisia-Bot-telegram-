/**
 * provider/gemini/index.js
 *
 * Google Gemini via endpoint OpenAI-compatible (AI Studio).
 * Free tier: cukup generous, recommended buat development.
 * API key: https://aistudio.google.com/app/apikey
 *
 * Optimasi untuk EMORA agent:
 * - BASE_URL: endpoint /openai/ dari Google — support tool calling native.
 * - streaming: false lebih stabil untuk agent loop (ada edge case streaming
 *   Gemini kadang truncate tool call di tengah jalan).
 * - maxTokens 8192: sweet spot — Gemini 2.0 Flash support 8192 output.
 */

import { ChatOpenAI } from "@langchain/openai";

export const PROVIDER_ID    = "gemini";
export const PROVIDER_LABEL = "Google Gemini";
export const PROVIDER_TIER  = "free";
export const BASE_URL       = "https://generativelanguage.googleapis.com/v1beta/openai/";
export const KEY_URL        = "https://aistudio.google.com/app/apikey";

export const MODELS = [
  {
    id:      "gemini-2.0-flash",
    label:   "gemini-2.0-flash           — Recommended, cepat & pintar",
    context: 1048576,
    tier:    "free",
  },
  {
    id:      "gemini-2.0-flash-lite",
    label:   "gemini-2.0-flash-lite      — Paling hemat kuota",
    context: 1048576,
    tier:    "free",
  },
  {
    id:      "gemini-2.0-flash-thinking-exp",
    label:   "gemini-2.0-flash-thinking  — Reasoning / thinking mode",
    context: 1048576,
    tier:    "free",
  },
  {
    id:      "gemini-1.5-pro",
    label:   "gemini-1.5-pro             — Konteks 2M token, powerful",
    context: 2097152,
    tier:    "free",
  },
  {
    id:      "gemini-1.5-flash",
    label:   "gemini-1.5-flash           — Balance speed/quality",
    context: 1048576,
    tier:    "free",
  },
  {
    id:      "gemini-1.5-flash-8b",
    label:   "gemini-1.5-flash-8b        — Paling ringan",
    context: 1048576,
    tier:    "free",
  },
  {
    id:      "gemini-2.5-pro-preview-06-05",
    label:   "gemini-2.5-pro             — Terbaru & terpintar (preview)",
    context: 2097152,
    tier:    "paid",
  },
];

export const DEFAULT_MODEL = "gemini-2.0-flash";

/**
 * @param {{ apiKey?: string, model?: string, tools?: any[] }} opts
 */
export function createLLM({ apiKey, model, tools = [] } = {}) {
  const llm = new ChatOpenAI({
    apiKey: apiKey || process.env.MODEL_API || process.env.GEMINI_API_KEY,
    model:  model  || process.env.MODEL_NAME || DEFAULT_MODEL,
    configuration: { baseURL: BASE_URL },
    temperature:  0.2,
    maxTokens:    8192,
    // Gemini kadang error kalau streaming + tool call bersamaan
    streaming:    false,
  });

  return tools.length ? llm.bindTools(tools, { toolChoice: "auto" }) : llm;
}
