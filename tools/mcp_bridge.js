/**
 * tools/mcp_bridge.js
 *
 * Membaca ./mcp/mcp.config.json, nge-spawn semua MCP server eksternal
 * bertipe "stdio" (mis. autocad-mcp, mcp-server-github, dll), terus
 * convert tool-tool yang mereka expose jadi DynamicStructuredTool biar
 * bisa langsung dipanggil LLM EMORA kayak tool native lainnya.
 *
 * Nama tool hasil bridge diberi prefix "mcp_<server>__<tool>" supaya
 * gak tabrakan dengan tool lokal dan jelas asalnya dari MCP server mana.
 *
 * Server bertipe "sse" belum di-bridge versi ini (baru stdio).
 */

import fs   from "fs";
import path from "path";

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

import { createMCPClient } from "../mcp/mcp_client.js";

const CONFIG_PATH = "./mcp/mcp.config.json";

// Klien aktif disimpan supaya bisa di-close saat EMORA exit.
const activeClients = [];

// ─────────────────────────────────────────────
// JSON Schema (MCP inputSchema) → Zod
// ─────────────────────────────────────────────
function jsonSchemaToZod(schema) {
  if (!schema || schema.type !== "object" || !schema.properties) {
    return z.object({}).passthrough();
  }

  const shape    = {};
  const required = new Set(schema.required || []);

  for (const [key, prop] of Object.entries(schema.properties)) {
    let field;

    if (Array.isArray(prop.enum)) {
      field = z.enum(prop.enum);
    } else {
      switch (prop.type) {
        case "string":  field = z.string(); break;
        case "number":  field = z.number(); break;
        case "integer": field = z.number().int(); break;
        case "boolean": field = z.boolean(); break;
        case "array":   field = z.array(z.any()); break;
        case "object":  field = z.record(z.any()); break;
        default:        field = z.any();
      }
    }

    if (prop.description) field = field.describe(String(prop.description));
    if (!required.has(key)) field = field.optional();

    shape[key] = field;
  }

  return z.object(shape);
}

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return { servers: [] };
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return { servers: [] };
  }
}

/**
 * Spawn semua MCP server stdio yang dikonfigurasi & enabled,
 * lalu kembalikan array DynamicStructuredTool siap pakai.
 *
 * Dipanggil sekali saat startup dari core/tools.js (top-level await).
 */
export async function loadMCPTools({ verbose = true } = {}) {
  const cfg     = readConfig();
  const servers = (cfg.servers || []).filter(
    (s) => s.type === "stdio" && s.enabled !== false
  );

  if (!servers.length) return [];

  const dynamicTools = [];

  for (const srv of servers) {
    try {
      const client = createMCPClient({
        command: srv.command,
        args:    srv.args || [],
        env:     srv.env  || {},
        cwd:     srv.cwd,
      });

      await client.initialize();
      const remoteTools = await client.listTools();
      activeClients.push(client);

      for (const rt of remoteTools) {
        const toolName = `mcp_${srv.name}__${rt.name}`.replace(/[^a-zA-Z0-9_]/g, "_");

        dynamicTools.push(
          new DynamicStructuredTool({
            name: toolName,
            description: `[MCP:${srv.name}] ${rt.description || rt.name}`.slice(0, 1024),
            schema: jsonSchemaToZod(rt.inputSchema),
            func: async (args) => {
              try {
                return await client.callTool(rt.name, args);
              } catch (err) {
                return `❌ MCP "${srv.name}.${rt.name}" error: ${err.message}`;
              }
            },
          })
        );
      }

      if (verbose) {
        console.log(
          `  ✓ MCP server "${srv.name}" tersambung — ${remoteTools.length} tool dimuat`
        );
      }
    } catch (err) {
      if (verbose) {
        console.error(`  ✗ Gagal connect MCP server "${srv.name}": ${err.message}`);
      }
    }
  }

  return dynamicTools;
}

/** Tutup semua child process MCP server. Panggil saat EMORA exit. */
export function closeMCPClients() {
  for (const c of activeClients) {
    try { c.close(); } catch {}
  }
  activeClients.length = 0;
}
