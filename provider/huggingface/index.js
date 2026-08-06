/**
 * provider/huggingface/index.js
 *
 * HuggingFace Inference API via endpoint OpenAI-compatible.
 * Free tier: 6 req/min, hanya model tertentu support tool calling.
 * API key: https://huggingface.co/settings/tokens
 *
 * Support custom dedicated endpoint (HF Inference Endpoints).
 */

import { ChatOpenAI } from "@langchain/openai";

export const PROVIDER_ID    = "huggingface";
export const PROVIDER_LABEL = "HuggingFace";
export const PROVIDER_TIER  = "free";
export const BASE_URL_PUBLIC = "https://api-inference.huggingface.co/v1";
export const KEY_URL         = "https://huggingface.co/settings/tokens";

// Model yang TERBUKTI support tool calling di HF public inference
export const MODELS = [
  { id: "meta-llama/Meta-Llama-3.1-8B-Instruct",    label: "Llama 3.1 8B Instruct   — Gratis, paling stabil untuk tool calling", tier: "free" },
  { id: "mistralai/Mistral-7B-Instruct-v0.3",        label: "Mistral 7B Instruct v0.3 — Gratis, tool calling OK",                  tier: "free" },
  { id: "Qwen/Qwen2.5-72B-Instruct",                 label: "Qwen 2.5 72B Instruct   — Butuh HF Pro",                              tier: "pro"  },
  { id: "meta-llama/Meta-Llama-3.1-70B-Instruct",   label: "Llama 3.1 70B Instruct  — Butuh HF Pro, paling powerful",            tier: "pro"  },
  { id: "microsoft/Phi-3.5-mini-instruct",            label: "Phi-3.5 Mini            — Gratis, ringan",                           tier: "free" },
  { id: "custom",                                     label: "Custom Dedicated Endpoint",                                          tier: "custom" },
];

export const DEFAULT_MODEL = "meta-llama/Meta-Llama-3.1-8B-Instruct";

export function createLLM({ apiKey, model, customEndpoint, tools = [] } = {}) {
  const key = apiKey || process.env.HUGGINGFACE_API_KEY || process.env.MODEL_API;
  if (!key) {
    throw new Error(
      "[provider:huggingface] HUGGINGFACE_API_KEY belum di-set di .env\n" +
      `Dapatkan token gratis di: ${KEY_URL}`
    );
  }

  const dedicated = customEndpoint || process.env.HUGGINGFACE_ENDPOINT_URL;
  let baseURL, modelId;

  if (dedicated) {
    baseURL  = dedicated.endsWith("/v1") ? dedicated : `${dedicated.replace(/\/$/, "")}/v1`;
    modelId  = "tgi"; // dedicated endpoint tidak perlu model ID
  } else {
    baseURL  = BASE_URL_PUBLIC;
    modelId  = model || process.env.MODEL_NAME || DEFAULT_MODEL;
  }

  const llm = new ChatOpenAI({
    apiKey: key,
    model:  modelId,
    configuration: { baseURL },
    temperature:  0.2,
    maxTokens:    2048,
    // HF TIDAK support parallel_tool_calls
    modelKwargs: { parallel_tool_calls: false },
  });

  return tools.length ? llm.bindTools(tools, { toolChoice: "auto" }) : llm;
}
