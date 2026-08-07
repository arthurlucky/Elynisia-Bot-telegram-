import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { getUserDB, getGlobalDB } from "../../client/core/db.js";
import { registry } from "./registry.js";
import { createLLM } from "../provider/index.js";
import { getUserRole, hasPermission } from "../../client/core/permissions.js";
import { getOrCreateUserEconomy, deductTokens } from "../../client/core/economy.js";
import { addMemory, queryMemory } from "./rag_memory.js";
import { aiTokensCounter, messagesProcessedCounter } from "./metrics.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths to identity markdown files
const AGENT_MD_PATH = path.join(__dirname, "..", "AGENT.md");
const SOUL_MD_PATH = path.join(__dirname, "..", "SOUL.md");

/**
 * Load system prompt files
 */
function loadSystemPrompt() {
  let agentMd = "";
  let soulMd = "";

  try {
    if (fs.existsSync(AGENT_MD_PATH)) {
      agentMd = fs.readFileSync(AGENT_MD_PATH, "utf8");
    }
  } catch (err) {}

  try {
    if (fs.existsSync(SOUL_MD_PATH)) {
      soulMd = fs.readFileSync(SOUL_MD_PATH, "utf8");
    }
  } catch (err) {}

  if (!agentMd && !soulMd) {
    return "You are Elynisia, a modular, helpful AI assistant built in Termux/Android. You run tasks and have tools to help the user.";
  }

  return `${soulMd}\n\n${agentMd}`;
}


/**
 * Perform a single chat turn (message and tool loop) for a user on a specific chat session.
 */
export async function ask(userId, chatId, userMessage, onEvent = () => {}) {
  const db = await getUserDB(userId);

  // Determine active chat ID
  let activeChatId = chatId;
  if (!activeChatId) {
    const lastChat = await db.get("SELECT id FROM chats ORDER BY id DESC LIMIT 1");
    if (lastChat) {
      activeChatId = lastChat.id;
    } else {
      const res = await db.run("INSERT INTO chats (title, created_at) VALUES (?, ?)", [
        "Chat Default",
        Date.now(),
      ]);
      activeChatId = res.lastID;
    }
  }

  // 1. Verify user economy & token limits
  const role = await getUserRole(userId);
  const isStaff = role === "owner" || role === "admin";
  const economy = await getOrCreateUserEconomy(userId);
  
  if (!isStaff && (economy.tokens ?? 10000) <= 0) {
    throw new Error("Token Anda habis! Silakan isi ulang token Anda di `/shop` menggunakan Gems atau Gold.");
  }

  // 2. Trigger BeforeMessage hook
  const processedMessage = await registry.runHook("BeforeMessage", {
    userId,
    chatId: activeChatId,
    content: userMessage,
  });
  
  // Track metric
  messagesProcessedCounter.inc(1);

  // 3. Load chat history (bounded window — full history makes requests huge and slow)
  const HISTORY_LIMIT = 20;
  const allHistory = await db.all(
    "SELECT role, content_json FROM messages WHERE chat_id = ? ORDER BY id ASC",
    [activeChatId]
  );
  const history = allHistory.slice(-HISTORY_LIMIT);
  
  const messages = [];

  // 4. Construct prompt context (System, Soul, and Active Skills)
  const facts = await db.all("SELECT val FROM profile_memory WHERE key LIKE 'fact_%'");
  let extraPrompt = "";
  if (facts && facts.length > 0) {
    extraPrompt += "\n\n[USER PROFILE FACTS]\n" + facts.map(f => `- ${f.val}`).join("\n");
  }
  
  // RAG: Query Vector Database for long-term memory
  const relevantMemories = await queryMemory(userId, processedMessage.content, 5);
  if (relevantMemories && relevantMemories.length > 0) {
    extraPrompt += "\n\n[LONG-TERM RECALLED MEMORIES]\n(Gunakan ini jika relevan dengan pertanyaan/topik saat ini)\n";
    extraPrompt += relevantMemories.map(m => `- ${m}`).join("\n");
  }

  let systemPrompt = loadSystemPrompt() + extraPrompt;
  // Format active skills in registry
  let skillsDesc = "";
  const userSkills = registry.getUserSkills(userId);
  if (userSkills.size > 0) {
    const globalDb = await getGlobalDB();
    const disabledSkillsRows = await globalDb.all("SELECT skill_name FROM user_skills WHERE user_id = ? AND enabled = 0", [String(userId)]);
    const disabledSkills = new Set(disabledSkillsRows.map(row => row.skill_name));

    skillsDesc = "\n\nAvailable specialized skills you can use:\n";
    for (const [name, sk] of userSkills.entries()) {
      if (disabledSkills.has(name)) continue;
      skillsDesc += `- ${name}: ${sk.description}\n`;
    }
  }

  // Push System Message first
  messages.push(new SystemMessage(`${systemPrompt}${skillsDesc}\n\nAlways reply directly. Use markdown where applicable.`));

  // Map history to LangChain message formats
  history.forEach((h) => {
    const content = JSON.parse(h.content_json);
    if (h.role === "user") {
      messages.push(new HumanMessage(content));
    } else if (h.role === "assistant") {
      messages.push(new AIMessage(content));
    }
  });

  // Push current user message
  messages.push(new HumanMessage(processedMessage.content));

  // 5. Tool Loop (up to 10 iterations)
  const rawTools = registry.getUserRawToolsList(userId);
  const canUseMcp = await hasPermission(userId, "can_use_mcp");
  const allowedTools = canUseMcp 
    ? rawTools 
    : rawTools.filter(t => !t.name.startsWith("mcp_"));

  // Create the LLM using EMORA's dynamic provider system
  const llm = await createLLM(allowedTools);

  // Model call wrapper: retries transient network/connection failures with a
  // fresh LLM instance (fresh connection pool), since the endpoint is
  // intermittently slow/flaky.
  let activeLlm = llm;
  const callModel = async (msgs) => {
    let attempt = 0;
    for (;;) {
      attempt++;
      try {
        return await activeLlm.invoke(msgs);
      } catch (err) {
        const msg = String(err?.message || err);
        const retriable = /connection|socket hang|ECONNRESET|ETIMEDOUT|timeout|network|fetch failed/i.test(msg);
        if (!retriable || attempt >= 3) throw err;
        console.warn(`[agent] model call attempt ${attempt} failed (${msg}); retrying with fresh connection...`);
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        activeLlm = await createLLM(allowedTools);
      }
    }
  };

  let loopCount = 0;
  
  const agentModeRow = await db.get("SELECT val FROM profile_memory WHERE key = 'agent_mode'");
  const agentMode = agentModeRow ? agentModeRow.val : "normal";
  
  let maxIterations = 10; // normal
  if (agentMode === "fast") maxIterations = 3;
  if (agentMode === "deep") maxIterations = 30;

  let assistantMessage = null;

  while (loopCount < maxIterations) {
    loopCount++;

    const response = await callModel(messages);
    assistantMessage = response;

    // Push the assistant response to messages array
    messages.push(response);

    if (response.tool_calls && response.tool_calls.length > 0) {
      // Model wishes to call tools
      for (const call of response.tool_calls) {
        const { name, args, id } = call;

        onEvent({ type: "tool_use", name, args });

        // Run hook BeforeToolCall
        const hookData = await registry.runHook("BeforeToolCall", { name, args, userId, chatId: activeChatId });

        let resultStr = "";
        try {
          const registered = registry.getTool(userId, name);
          if (registered && typeof registered.func === "function") {
            const output = await registered.func(hookData.args, { userId, chatId: activeChatId });
            resultStr = typeof output === "object" ? JSON.stringify(output) : String(output);
          } else {
            resultStr = `Error: Tool "${name}" is not registered in the system.`;
          }
        } catch (err) {
          resultStr = `Error executing tool "${name}": ${err.message}`;
        }

        // Run hook AfterToolCall
        const resultHook = await registry.runHook("AfterToolCall", { name, result: resultStr, userId, chatId: activeChatId });
        
        onEvent({ type: "tool_result", name, result: resultHook.result });

        // Add tool response as ToolMessage to messages array
        messages.push(new ToolMessage({
          content: resultHook.result,
          tool_call_id: id
        }));
      }
    } else {
      // No tool calls, response is complete!
      break;
    }
  }

  // 6. Save messages to SQLite database and Vector Database (RAG)
  const saveUserMsg = await db.run(
    "INSERT INTO messages (chat_id, role, content_json, created_at) VALUES (?, ?, ?, ?)",
    [activeChatId, "user", JSON.stringify(processedMessage.content), Date.now()]
  );
  
  // Save to Long-Term Memory (RAG Vector Database)
  if (typeof processedMessage.content === "string" && processedMessage.content.length > 10) {
    // Hanya simpan pesan yang cukup panjang (bukan sekadar "halo" atau "ok")
    addMemory(userId, processedMessage.content, { role: "user", chatId: activeChatId }).catch(e => console.error("RAG Error:", e));
  }

  const rawContent = assistantMessage.content;
  const finalResponse = Array.isArray(rawContent)
    ? rawContent.map((b) => (typeof b === "string" ? b : b && b.type === "text" ? b.text : "")).join("")
    : (rawContent || "");

  // Trigger AfterMessage hook
  const afterMsgData = await registry.runHook("AfterMessage", {
    userId,
    chatId: activeChatId,
    content: finalResponse,
  });

  await db.run(
    "INSERT INTO messages (chat_id, role, content_json, created_at) VALUES (?, ?, ?, ?)",
    [activeChatId, "assistant", JSON.stringify(afterMsgData.content), Date.now()]
  );

  // Deduct tokens
  const usage = assistantMessage.usage_metadata;
  const totalTokens = usage ? (usage.input_tokens + usage.output_tokens) : 0;
  if (usage && totalTokens > 0) {
    aiTokensCounter.inc(totalTokens);
  }
  let levelUpMsg = "";
  if (!isStaff && totalTokens > 0) {
    const res = await deductTokens(userId, totalTokens);
    if (res.levelUpMsg) {
      levelUpMsg = res.levelUpMsg;
    }
  }

  let finalOutput = afterMsgData.content;
  if (levelUpMsg) {
    finalOutput += `\n\n${levelUpMsg}`;
  }

  return finalOutput;
}
