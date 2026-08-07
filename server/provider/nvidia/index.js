/**
 * provider/nvidia/index.js
 *
 * NVIDIA NIM — inference enterprise-grade, free tier 1000 req/month.
 * API key: https://build.nvidia.com (login pakai akun NVIDIA)
 *
 * Optimasi untuk EMORA agent:
 * - maxTokens 4096: NIM cenderung lambat di output panjang, 4096 sweet spot.
 * - parallel_tool_calls: false → beberapa model NIM bermasalah dengan parallel.
 * - temperature 0.2: deterministik tapi tidak kaku.
 */

import { ChatOpenAI } from "@langchain/openai";

export const PROVIDER_ID    = "nvidia";
export const PROVIDER_LABEL = "NVIDIA NIM";
export const PROVIDER_TIER  = "free";
export const BASE_URL       = "https://integrate.api.nvidia.com/v1";
export const KEY_URL        = "https://build.nvidia.com";

export const MODELS = [
  {
    id:      "meta/llama-3.1-70b-instruct",
    label:   "Llama 3.1 70B Instruct     — Default, terbaik untuk agent",
    context: 128000,
    tier:    "free",
  },
  {
    id:      "meta/llama-3.1-8b-instruct",
    label:   "Llama 3.1 8B Instruct      — Cepat, ringan",
    context: 128000,
    tier:    "free",
  },
  {
    id:      "meta/llama-3.3-70b-instruct",
    label:   "Llama 3.3 70B Instruct     — Terbaru dari Meta",
    context: 128000,
    tier:    "free",
  },
  {
    id:      "meta/llama-3.2-3b-instruct",
    label:   "Llama 3.2 3B Instruct      — Paling ringan",
    context: 128000,
    tier:    "free",
  },
  {
    id:      "mistralai/mixtral-8x7b-instruct-v0.1",
    label:   "Mixtral 8x7B Instruct      — MoE, bagus untuk coding",
    context: 32768,
    tier:    "free",
  },
  {
    id:      "mistralai/mistral-7b-instruct-v0.3",
    label:   "Mistral 7B Instruct v0.3   — Tool calling support",
    context: 32768,
    tier:    "free",
  },
  {
    id:      "microsoft/phi-3-medium-128k-instruct",
    label:   "Phi-3 Medium 128K          — Microsoft, konteks panjang",
    context: 128000,
    tier:    "free",
  },
  {
    id:      "google/gemma-7b",
    label:   "Gemma 7B                   — Google open model",
    context: 8192,
    tier:    "free",
  },
  {
    id:      "nvidia/llama-3.1-nemotron-70b-instruct",
    label:   "Nemotron 70B               — NVIDIA fine-tune, kuat",
    context: 128000,
    tier:    "free",
  },
  {
    id:      "deepseek-ai/deepseek-r1",
    label:   "DeepSeek R1                — Reasoning model",
    context: 163840,
    tier:    "free",
  },
];

export const DEFAULT_MODEL = "meta/llama-3.1-70b-instruct";

/**
 * @param {{ apiKey?: string, model?: string, tools?: any[] }} opts
 */
export function createLLM({ apiKey, model, tools = [] } = {}) {
  const llm = new ChatOpenAI({
    apiKey: apiKey || process.env.MODEL_API || process.env.NVIDIA_API_KEY,
    model:  model  || process.env.MODEL_NAME || DEFAULT_MODEL,
    configuration: { baseURL: BASE_URL },
    temperature: 0.2,
    maxTokens:   4096,
    modelKwargs: { parallel_tool_calls: false },
  });

  return tools.length ? llm.bindTools(tools, { toolChoice: "auto" }) : llm;
}
