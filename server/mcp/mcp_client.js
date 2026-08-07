/**
 * mcp/mcp_client.js
 *
 * MCP (Model Context Protocol) stdio CLIENT untuk EMORA.
 *
 * Beda dengan cli/cmd-mcp.js `runAsServer()` yang bikin EMORA jadi MCP
 * *server*, file ini bikin EMORA jadi MCP *client* — yaitu yang
 * nge-spawn proses server eksternal (mis. autocad-mcp, mcp-server-github,
 * dll), kirim JSON-RPC 2.0 lewat stdin/stdout, terus expose tool-tool
 * yang dipunyai server itu supaya bisa dipanggil dari agent loop EMORA.
 *
 * Protokol: JSON-RPC 2.0, newline-delimited (NDJSON) — standar MCP stdio
 * transport (sama seperti yang dipakai Claude Desktop / Claude Code).
 */

import { spawn } from "child_process";

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * @param {object} opts
 * @param {string} opts.command   - executable, mis. "python" / "C:\\...\\python.exe"
 * @param {string[]} [opts.args]  - argumen, mis. ["-m", "autocad_mcp"]
 * @param {object} [opts.env]     - env var tambahan
 * @param {string} [opts.cwd]     - working directory proses
 */
export function createMCPClient({ command, args = [], env = {}, cwd } = {}) {
  if (!command) throw new Error("MCP client: 'command' wajib diisi");

  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let buffer   = "";
  let nextId   = 1;
  let alive    = true;
  const pending = new Map(); // id -> { resolve, reject }
  const stderrTail = [];

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let msg;
      try { msg = JSON.parse(trimmed); } catch { continue; }
      if (msg.id != null && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
      // notifications (no id) are ignored for now
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderrTail.push(chunk);
    if (stderrTail.length > 50) stderrTail.shift();
  });

  child.on("exit", (code, signal) => {
    alive = false;
    const reason = `MCP server process exited (code=${code}, signal=${signal || "-"})`;
    for (const { reject } of pending.values()) reject(new Error(reason));
    pending.clear();
  });

  child.on("error", (err) => {
    alive = false;
    for (const { reject } of pending.values()) reject(err);
    pending.clear();
  });

  function send(method, params, { isNotification = false } = {}) {
    if (!alive) return Promise.reject(new Error("MCP server tidak berjalan"));

    if (isNotification) {
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const id = nextId++;

      const timeout = setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`MCP timeout: "${method}" tidak respon dalam ${DEFAULT_TIMEOUT_MS / 1000}s`));
        }
      }, DEFAULT_TIMEOUT_MS);

      pending.set(id, {
        resolve: (v) => { clearTimeout(timeout); resolve(v); },
        reject:  (e) => { clearTimeout(timeout); reject(e); },
      });

      try {
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      } catch (err) {
        clearTimeout(timeout);
        pending.delete(id);
        reject(err);
      }
    });
  }

  async function initialize() {
    await send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "emora-agent", version: "1.0.0" },
    });
    // Required notification per MCP spec — tells the server the handshake is done
    await send("notifications/initialized", {}, { isNotification: true });
  }

  async function listTools() {
    const result = await send("tools/list", {});
    return result?.tools || [];
  }

  async function callTool(name, toolArgs) {
    const result = await send("tools/call", { name, arguments: toolArgs || {} });
    const parts = Array.isArray(result?.content) ? result.content : [];
    const text  = parts.map(p => (p.type === "text" ? p.text : JSON.stringify(p))).join("\n");
    if (result?.isError) throw new Error(text || `MCP tool "${name}" returned an error`);
    return text || "(no output)";
  }

  function getStderr() {
    return stderrTail.join("");
  }

  function close() {
    alive = false;
    try { child.stdin.end(); } catch {}
    try { child.kill(); } catch {}
  }

  return { initialize, listTools, callTool, getStderr, close, child, get alive() { return alive; } };
}
