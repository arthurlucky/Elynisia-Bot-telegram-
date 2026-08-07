/**
 * provider/groq/index.js
 *
 * Groq Cloud — inference ultra-cepat berbasis chip LPU.
 * Free tier: 14,400 req/day, max 6000 token/min per model.
 * API key: https://console.groq.com
 *
 * Optimasi untuk EMORA agent:
 * - parallel_tool_calls: false → Groq kadang kirim dua tool call parallel
 *   yang bikin LangChain bingung urutan ToolMessage-nya → dimatiin.
 * - temperature 0.2 → cukup kreatif tapi tetap deterministik untuk tool use.
 * - maxTokens 8192 → Groq support sampai 8192 untuk semua model di bawah.
 */

import { ChatOpenAI } from "@langchain/openai";

export const PROVIDER_ID   = "groq";
export const PROVIDER_LABEL = "Groq";
export const PROVIDER_TIER  = "free";
export const BASE_URL       = "https://api.groq.com/openai/v1";
export const KEY_URL        = "https://console.groq.com";

export const MODELS = [
  {
    id:      "llama-3.3-70b-versatile",
    label:   "llama-3.3-70b-versatile    — Terbaik untuk agent, recommended",
    context: 128000,
    tier:    "free",
  },
  {
    id:      "llama-3.1-8b-instant",
    label:   "llama-3.1-8b-instant       — Tercepat, respons <1 detik",
    context: 128000,
    tier:    "free",
  },
  {
    id:      "llama-3.3-70b-specdec",
    label:   "llama-3.3-70b-specdec      — Speculative decoding, lebih cepat",
    context: 8192,
    tier:    "free",
  },
  {
    id:      "gemma2-9b-it",
    label:   "gemma2-9b-it               — Google Gemma 2, ringan",
    context: 8192,
    tier:    "free",
  },
  {
    id:      "mixtral-8x7b-32768",
    label:   "mixtral-8x7b-32768         — Konteks 32K, bagus untuk dokumen panjang",
    context: 32768,
    tier:    "free",
  },
  {
    id:      "llama-3.2-90b-vision-preview",
    label:   "llama-3.2-90b-vision       — Support vision (gambar)",
    context: 8192,
    tier:    "free",
    vision:  true,
  },
  {
    id:      "llama-3.2-11b-vision-preview",
    label:   "llama-3.2-11b-vision       — Vision ringan",
    context: 8192,
    tier:    "free",
    vision:  true,
  },
  {
    id:      "deepseek-r1-distill-llama-70b",
    label:   "deepseek-r1-distill-70b    — Reasoning model (thinking)",
    context: 128000,
    tier:    "free",
  },
  {
    id:      "qwen-qwq-32b",
    label:   "qwen-qwq-32b               — Qwen reasoning, kuat di math/code",
    context: 32768,
    tier:    "free",
  },
];

export const DEFAULT_MODEL = "llama-3.3-70b-versatile";

/**
 * @param {{ apiKey?: string, model?: string, tools?: any[] }} opts
 */
export function createLLM({ apiKey, model, tools = [] } = {}) {
  const llm = new ChatOpenAI({
    apiKey: apiKey || process.env.MODEL_API || process.env.GROQ_API_KEY,
    model:  model  || process.env.MODEL_NAME || DEFAULT_MODEL,
    configuration: { baseURL: BASE_URL },
    temperature: 0.2,
    // PERF: default diturunkan dari 8192 -> 2048. Jawaban chat biasa
    // jarang butuh >2048 token; ceiling yang lebih rendah memangkas
    // waktu generasi worst-case tanpa memotong jawaban normal.
    // Override lewat .env MODEL_MAX_TOKENS kalau memang butuh output
    // panjang (laporan, kode besar, dll).
    maxTokens: Number(process.env.MODEL_MAX_TOKENS) || 2048,
    // KRITIS: Groq tidak support parallel tool calls dengan reliable
    modelKwargs: { parallel_tool_calls: false },
  });

  return tools.length ? llm.bindTools(tools, { toolChoice: "auto" }) : llm;
}
