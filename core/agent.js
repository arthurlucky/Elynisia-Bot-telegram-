import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { getUserDB, getGlobalDB } from "./db.js";
import { registry } from "./registry.js";
import { createLLM } from "../provider/index.js";
import { getUserRole, hasPermission } from "./permissions.js";
import { getOrCreateUserEconomy, deductTokens } from "./economy.js";

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

  // 3. Load chat history
  const history = await db.all(
    "SELECT role, content_json FROM messages WHERE chat_id = ? ORDER BY id ASC",
    [activeChatId]
  );
  
  const messages = [];

  // 4. Construct prompt context (System, Soul, and Active Skills)
  const systemPrompt = loadSystemPrompt();
  
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

  let loopCount = 0;
  const maxIterations = 10;
  let assistantMessage = null;

  while (loopCount < maxIterations) {
    loopCount++;

    const response = await llm.invoke(messages);
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

  // 6. Save messages to SQLite database
  const saveUserMsg = await db.run(
    "INSERT INTO messages (chat_id, role, content_json, created_at) VALUES (?, ?, ?, ?)",
    [activeChatId, "user", JSON.stringify(processedMessage.content), Date.now()]
  );

  const finalResponse = assistantMessage.content || "";

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
