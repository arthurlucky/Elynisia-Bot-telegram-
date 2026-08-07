/**
 * core/chat.js
 * Emulates the EMORA chat ask and cache invalidation hooks for tools compatibility.
 */

import { ask as agentAsk } from "./agent.js";

export function invalidateSystemPromptCache() {
  // Elynisia loads system prompt and soul dynamic on every message turn,
  // so no prompt caching invalidation is needed here.
}

export async function ask(llm, tools, sessionId, input, opts) {
  // In EMORA, the ask signature is ask(llm, tools, sessionId, input, opts)
  // In Elynisia, sessionId is equivalent to the Telegram userId/chatId.
  return agentAsk(sessionId, undefined, input, opts?.onEvent);
}
