import { eventBus } from "./eventBus.js";
import { zodToJsonSchema } from "zod-to-json-schema";

class Registry {
  constructor() {
    this.commands = new Map();     // cmdName -> { handler, desc }
    this.tools = new Map();        // toolName -> { schema, func }
    this.skills = new Map();       // skillName -> { systemPrompt, description }
    this.hooks = new Map();        // hookName -> Array of functions
    this.providers = new Map();    // providerName -> createLLM factory
    this.knowledge = new Map();    // topicName -> Array of documents
    this.mcpServers = new Map();   // serverName -> config
    this.rawTools = new Map();     // toolName -> LangChain tool instance
  }

  // Commands
  registerCommand(userId, name, handler, desc = "", promptTemplate = null) {
    const cleanName = name.startsWith("/") ? name.slice(1) : name;
    // If userId is null, it's a global command
    const key = userId ? `${userId}:${cleanName.toLowerCase()}` : cleanName.toLowerCase();
    this.commands.set(key, { handler, desc, promptTemplate });
  }

  unregisterCommand(userId, name) {
    const cleanName = name.startsWith("/") ? name.slice(1) : name;
    const key = userId ? `${userId}:${cleanName.toLowerCase()}` : cleanName.toLowerCase();
    this.commands.delete(key);
  }

  getCommand(userId, name) {
    const cleanName = name.startsWith("/") ? name.slice(1) : name;
    const userKey = `${userId}:${cleanName.toLowerCase()}`;
    if (this.commands.has(userKey)) return this.commands.get(userKey);
    return this.commands.get(cleanName.toLowerCase());
  }
  
  getUserCommands(userId) {
    const cmds = [];
    for (const [key, val] of this.commands.entries()) {
       if (key.startsWith(`${userId}:`)) {
          cmds.push({ name: key.split(":")[1], ...val });
       }
    }
    return cmds;
  }

  // Tools
  registerTool(userId, nameOrTool, schema, func) {
    let name, toolSchema, toolFunc;

    if (nameOrTool && typeof nameOrTool === "object" && nameOrTool.name && nameOrTool.schema) {
      const tool = nameOrTool;
      name = tool.name;
      try {
        const jsonSchema = zodToJsonSchema(tool.schema);
        toolSchema = {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: jsonSchema.type || "object",
            properties: jsonSchema.properties || {},
            required: jsonSchema.required || []
          }
        };
      } catch (err) {
        toolSchema = { name: tool.name, description: tool.description, parameters: { type: "object", properties: {} } };
      }
      toolFunc = tool.func ? tool.func.bind(tool) : (tool.call ? tool.call.bind(tool) : tool._call.bind(tool));
      const key = userId ? `${userId}:${name}` : name;
      this.rawTools.set(key, tool);
    } else {
      name = nameOrTool;
      toolSchema = schema;
      toolFunc = func;
    }

    const key = userId ? `${userId}:${name}` : name;
    this.tools.set(key, { schema: toolSchema, func: toolFunc });
    eventBus.emitEvent("tool_registered", { name, schema: toolSchema, userId });
  }

  unregisterTool(userId, name) {
    const key = userId ? `${userId}:${name}` : name;
    this.tools.delete(key);
    this.rawTools.delete(key);
    eventBus.emitEvent("tool_unregistered", { name, userId });
  }

  getTool(userId, name) {
    const key = `${userId}:${name}`;
    if (this.tools.has(key)) return this.tools.get(key);
    return this.tools.get(name);
  }

  getUserRawToolsList(userId) {
    const list = [];
    for (const [key, tool] of this.rawTools.entries()) {
      if (!key.includes(":") || key.startsWith(`${userId}:`)) {
        list.push(tool);
      }
    }
    return list;
  }

  // Skills
  registerSkill(userId, name, systemPrompt, description = "") {
    const key = userId ? `${userId}:${name}` : name;
    this.skills.set(key, { systemPrompt, description, originalName: name });
  }

  unregisterSkill(userId, name) {
    const key = userId ? `${userId}:${name}` : name;
    this.skills.delete(key);
  }

  getUserSkills(userId) {
    const list = new Map();
    for (const [key, val] of this.skills.entries()) {
      if (!key.includes(":") || key.startsWith(`${userId}:`)) {
        list.set(val.originalName, val);
      }
    }
    return list;
  }

  // Hooks
  registerHook(name, func) {
    if (!this.hooks.has(name)) {
      this.hooks.set(name, []);
    }
    this.hooks.get(name).push(func);
  }

  unregisterHook(name, func) {
    if (this.hooks.has(name)) {
      const list = this.hooks.get(name);
      const index = list.indexOf(func);
      if (index !== -1) {
        list.splice(index, 1);
      }
    }
  }

  async runHook(name, data) {
    const hooks = this.hooks.get(name) || [];
    let currentData = data;
    for (const hook of hooks) {
      try {
        const result = await hook(currentData);
        if (result !== undefined) {
          currentData = result;
        }
      } catch (err) {
        console.error(`[Hook Error] Error running hook ${name}:`, err.message);
      }
    }
    return currentData;
  }

  // Providers
  registerProvider(name, factory) {
    this.providers.set(name.toLowerCase(), factory);
  }

  unregisterProvider(name) {
    this.providers.delete(name.toLowerCase());
  }

  getProvider(name) {
    return this.providers.get(name.toLowerCase());
  }

  // MCP Servers
  registerMCP(name, config) {
    this.mcpServers.set(name, config);
  }

  unregisterMCP(name) {
    this.mcpServers.delete(name);
  }

  // Knowledge
  registerKnowledge(topic, document) {
    if (!this.knowledge.has(topic)) {
      this.knowledge.set(topic, []);
    }
    this.knowledge.get(topic).push(document);
  }

  unregisterKnowledge(topic) {
    this.knowledge.delete(topic);
  }

  getKnowledge(topic) {
    return this.knowledge.get(topic) || [];
  }
}

export const registry = new Registry();
export default registry;
