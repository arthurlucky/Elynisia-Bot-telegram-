// tools/swarm_delegate.js
// Tool for delegating tasks from the main agent to specialized swarm containers

import path from "path";
import { fileURLToPath } from "url";
import { createLLM } from "../provider/index.js";
import { ask, invalidateSystemPromptCache } from "../core/chat.js";
import { getContainerConfig } from "../swarm/manager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const CONTAINERS_DIR = path.join(ROOT_DIR, ".emora", "containers");

export const swarmDelegateTool = {
  name: "delegate_to_subagent",
  description: "Delegasikan tugas riset, analisis, atau pemrosesan lainnya ke subagent/container yang terisolasi dengan kepribadian/soul khusus. Kembalikan hasil kerjanya ke agen utama.",
  parameters: {
    type: "object",
    properties: {
      subagentId: {
        type: "string",
        description: "Nama/ID container subagent (mis. agent-sales, bot-riset)."
      },
      task: {
        type: "string",
        description: "Instruksi/tugas spesifik yang ingin diberikan kepada subagent."
      }
    },
    required: ["subagentId", "task"]
  },
  execute: async ({ subagentId, task }) => {
    // Backup process.env
    const backup = {
      EMORA_MEMORY_DIR: process.env.EMORA_MEMORY_DIR,
      EMORA_AGENT_PATH: process.env.EMORA_AGENT_PATH,
      EMORA_SOUL_PATH: process.env.EMORA_SOUL_PATH,
      MODEL_PROVIDER: process.env.MODEL_PROVIDER,
      MODEL_NAME: process.env.MODEL_NAME,
      MODEL_URL: process.env.MODEL_URL,
      MODEL_API: process.env.MODEL_API,
      NAME: process.env.NAME
    };

    try {
      const dir = path.join(CONTAINERS_DIR, subagentId);
      const config = await getContainerConfig(subagentId);

      // Apply overrides
      process.env.EMORA_MEMORY_DIR = path.join(dir, "memory");
      process.env.EMORA_AGENT_PATH = path.join(dir, "AGENT.md");
      process.env.EMORA_SOUL_PATH = path.join(dir, "SOUL.md");
      process.env.NAME = `Emora-${subagentId}`;
      if (config.model_provider) process.env.MODEL_PROVIDER = config.model_provider;
      if (config.model_name) process.env.MODEL_NAME = config.model_name;
      if (config.model_url) process.env.MODEL_URL = config.model_url;
      if (config.model_api) process.env.MODEL_API = config.model_api;

      invalidateSystemPromptCache();

      const opts = {
        apiKey: config.model_api,
        model: config.model_name,
        url: config.model_url
      };
      
      // We pass empty tools to the subagent to prevent infinite recursion loop
      const subagentLLM = await createLLM([], config.model_provider || "gemini", opts);
      const sessionId = `swarm_${subagentId}`;

      const result = await ask(subagentLLM, [], sessionId, task);
      return { success: true, subagentId, result };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      // Restore process.env
      Object.assign(process.env, backup);
      invalidateSystemPromptCache();
    }
  }
};
