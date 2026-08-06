import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { registry } from "./registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MCP_CONFIG_PATH = path.join(__dirname, "..", "mcp", "mcp.config.json");

class MCPBridgeManager {
  constructor() {
    this.clients = new Map(); // serverName -> Client process
    this.messageIds = new Map(); // serverName -> currentId
  }

  /**
   * Initialize and start all MCP servers from config
   */
  async start() {
    console.log("[MCP Bridge] Starting MCP bridge...");
    
    // Create mcp directory if not exists
    const mcpDir = path.dirname(MCP_CONFIG_PATH);
    if (!fs.existsSync(mcpDir)) {
      fs.mkdirSync(mcpDir, { recursive: true });
    }

    if (!fs.existsSync(MCP_CONFIG_PATH)) {
      // Create empty config
      fs.writeFileSync(
        MCP_CONFIG_PATH,
        JSON.stringify({ mcpServers: {} }, null, 2),
        "utf8"
      );
      return;
    }

    try {
      const config = JSON.parse(fs.readFileSync(MCP_CONFIG_PATH, "utf8"));
      const servers = config.mcpServers || {};

      for (const [name, serverConfig] of Object.entries(servers)) {
        await this.connectServer(name, serverConfig);
      }
    } catch (err) {
      console.error("[MCP Bridge] Error initializing MCP config:", err.message);
    }
  }

  /**
   * Connect to a single MCP stdio server
   */
  async connectServer(name, config) {
    console.log(`[MCP Bridge] Connecting to server "${name}"...`);
    try {
      const { command, args = [], env = {} } = config;
      
      const processEnv = { ...process.env, ...env };
      const child = spawn(command, args, {
        env: processEnv,
        stdio: ["pipe", "pipe", "inherit"],
      });

      child.on("error", (err) => {
        console.error(`[MCP Bridge] Server "${name}" process error:`, err.message);
      });

      child.on("exit", (code) => {
        console.warn(`[MCP Bridge] Server "${name}" exited with code:`, code);
        this.clients.delete(name);
      });

      const client = {
        process: child,
        buffer: "",
        callbacks: new Map(), // id -> { resolve, reject }
      };

      child.stdout.on("data", (chunk) => {
        client.buffer += chunk.toString("utf8");
        this.processStdoutBuffer(name, client);
      });

      this.clients.set(name, client);
      this.messageIds.set(name, 1);

      // Perform MCP initialization
      await this.initializeMcp(name);

      // Fetch and register tools
      await this.registerServerTools(name);

      registry.registerMCP(name, config);
    } catch (err) {
      console.error(`[MCP Bridge] Failed to connect to server "${name}":`, err.message);
    }
  }

  /**
   * Process stdio line-by-line JSON-RPC output
   */
  processStdoutBuffer(serverName, client) {
    let newlineIdx;
    while ((newlineIdx = client.buffer.indexOf("\n")) !== -1) {
      const line = client.buffer.substring(0, newlineIdx).trim();
      client.buffer = client.buffer.substring(newlineIdx + 1);

      if (!line) continue;

      try {
        const message = JSON.parse(line);
        if (message.id !== undefined) {
          const cb = client.callbacks.get(message.id);
          if (cb) {
            client.callbacks.delete(message.id);
            if (message.error) {
              cb.reject(new Error(message.error.message || "Unknown JSON-RPC error"));
            } else {
              cb.resolve(message.result);
            }
          }
        }
      } catch (err) {
        // Not a JSON-RPC line or parsing error, ignore
      }
    }
  }

  /**
   * Send JSON-RPC request to server
   */
  async sendRequest(serverName, method, params = {}) {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP Server "${serverName}" is not connected.`);
    }

    const nextId = this.messageIds.get(serverName);
    this.messageIds.set(serverName, nextId + 1);

    const payload = {
      jsonrpc: "2.0",
      id: nextId,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      client.callbacks.set(nextId, { resolve, reject });
      client.process.stdin.write(JSON.stringify(payload) + "\n");
    });
  }

  /**
   * Initialize MCP Protocol handshake
   */
  async initializeMcp(serverName) {
    return this.sendRequest(serverName, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "elynisia-bridge",
        version: "1.0.0",
      },
    });
  }

  /**
   * Query tools from the MCP server and register them in registry
   */
  async registerServerTools(serverName) {
    try {
      const result = await this.sendRequest(serverName, "tools/list", {});
      const tools = result.tools || [];

      console.log(`[MCP Bridge] Registering ${tools.length} tools from server "${serverName}"`);

      for (const tool of tools) {
        const coreToolName = `mcp_${serverName}__${tool.name}`;
        
        // Define tool schema
        const schema = {
          name: coreToolName,
          description: `[MCP:${serverName}] ${tool.description}`,
          parameters: tool.inputSchema || { type: "object", properties: {} },
        };

        // Register in core tool registry
        registry.registerTool(coreToolName, schema, async (args) => {
          console.log(`[MCP Bridge] Calling MCP tool: ${serverName}/${tool.name}`);
          const callResult = await this.sendRequest(serverName, "tools/call", {
            name: tool.name,
            arguments: args,
          });
          
          if (callResult.isError) {
            throw new Error(callResult.content?.[0]?.text || "MCP Tool invocation error");
          }
          
          return callResult.content?.[0]?.text || "";
        });
      }
    } catch (err) {
      console.error(`[MCP Bridge] Error registering tools for server "${serverName}":`, err.message);
    }
  }

  /**
   * Close all active client processes
   */
  closeAll() {
    console.log("[MCP Bridge] Closing MCP servers...");
    for (const [name, client] of this.clients.entries()) {
      try {
        client.process.kill();
      } catch (err) {}
    }
    this.clients.clear();
  }
}

export const mcpBridge = new MCPBridgeManager();
export default mcpBridge;
