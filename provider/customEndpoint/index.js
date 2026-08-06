/**
 * provider/customEndpoint/index.js
 *
 * Custom endpoint — semua server yang kompatibel dengan OpenAI API.
 * Contoh: LM Studio, LocalAI, vLLM, Together AI, Perplexity, Fireworks AI,
 *         self-hosted Ollama di server lain, KoboldCpp dengan OpenAI mode, dsb.
 *
 * Konfigurasi di .env:
 *   MODEL_PROVIDER=custom
 *   MODEL_URL=http://your-server:1234/v1
 *   MODEL_API=your-api-key-or-any-string
 *   MODEL_NAME=model-name-as-shown-by-server
 *
 * Opsional:
 *   CUSTOM_PROVIDER_NAME=LM Studio   (nama tampilan di status/banner)
 *   CUSTOM_NO_PARALLEL_TOOLS=true    (matikan parallel tool calls)
 *   CUSTOM_MAX_TOKENS=4096
 *   CUSTOM_TEMPERATURE=0.2
 */

import { ChatOpenAI } from "@langchain/openai";

export const PROVIDER_ID    = "custom";
export const PROVIDER_LABEL = process.env.CUSTOM_PROVIDER_NAME || "Custom Endpoint";
export const PROVIDER_TIER  = "custom";
export const KEY_URL        = null;

// Preset untuk server yang umum dipakai
export const PRESETS = [
  {
    id:      "lmstudio",
    label:   "LM Studio              — localhost:1234",
    url:     "http://localhost:1234/v1",
    apiKey:  "lm-studio",
    noParallel: true,
  },
  {
    id:      "localai",
    label:   "LocalAI                — localhost:8080",
    url:     "http://localhost:8080/v1",
    apiKey:  "localai",
    noParallel: true,
  },
  {
    id:      "vllm",
    label:   "vLLM                   — localhost:8000",
    url:     "http://localhost:8000/v1",
    apiKey:  "vllm",
    noParallel: false,
  },
  {
    id:      "togetherai",
    label:   "Together AI            — api.together.xyz",
    url:     "https://api.together.xyz/v1",
    apiKey:  "",
    noParallel: false,
    keyUrl:  "https://www.together.ai",
  },
  {
    id:      "fireworks",
    label:   "Fireworks AI           — api.fireworks.ai",
    url:     "https://api.fireworks.ai/inference/v1",
    apiKey:  "",
    noParallel: false,
    keyUrl:  "https://fireworks.ai",
  },
  {
    id:      "perplexity",
    label:   "Perplexity             — api.perplexity.ai",
    url:     "https://api.perplexity.ai",
    apiKey:  "",
    noParallel: true,
    keyUrl:  "https://www.perplexity.ai/settings/api",
  },
  {
    id:      "manual",
    label:   "Manual                 — isi URL sendiri",
    url:     "",
    apiKey:  "",
  },
];

export const DEFAULT_MODEL = process.env.MODEL_NAME || "default";

export function createLLM({ apiKey, model, url, tools = [] } = {}) {
  const baseURL = url || process.env.MODEL_URL;
  if (!baseURL) {
    throw new Error(
      "[provider:custom] MODEL_URL belum di-set di .env\n" +
      "Isi dengan URL endpoint OpenAI-compatible server kamu.\n" +
      "Contoh: MODEL_URL=http://localhost:1234/v1"
    );
  }

  const noParallel = process.env.CUSTOM_NO_PARALLEL_TOOLS === "true";
  const maxTokens  = parseInt(process.env.CUSTOM_MAX_TOKENS || "4096");
  const temp       = parseFloat(process.env.CUSTOM_TEMPERATURE || "0.2");

  const llm = new ChatOpenAI({
    apiKey: apiKey || process.env.MODEL_API || "custom",
    model:  model  || process.env.MODEL_NAME || DEFAULT_MODEL,
    configuration: { baseURL },
    temperature: temp,
    maxTokens,
    ...(noParallel ? { modelKwargs: { parallel_tool_calls: false } } : {}),
  });

  return tools.length ? llm.bindTools(tools, { toolChoice: "auto" }) : llm;
}
