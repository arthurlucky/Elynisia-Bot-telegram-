import { registry } from "./core/registry.js";
import tools from "./core/tools.js";
import { skillManager } from "./core/skills.js";
import { knowledgeLibrary } from "./core/knowledge.js";
import { mcpBridge } from "./core/mcp.js";
import { pluginManager } from "./core/pluginManager.js";
import { scheduler } from "./core/scheduler.js";
import { startMetricsServer } from "./core/metrics.js";

// ANSI Color Tokens
const C = { reset: "\x1b[0m", bold: "\x1b[1m", cyan: "\x1b[36m", green: "\x1b[32m" };

export async function initServer() {
  try {
    console.log(`${C.cyan}[1/6] 🛠️ Mendaftarkan Core Tools (${tools.length} Tools)...${C.reset}`);
    for (const tool of tools) {
      registry.registerTool(null, tool);
    }

    console.log(`${C.cyan}[2/6] 🎓 Memuat Skills Engine...${C.reset}`);
    await skillManager.init();

    console.log(`${C.cyan}[3/6] 📚 Memuat Knowledge Library & Embeddings...${C.reset}`);
    await knowledgeLibrary.init();

    console.log(`${C.cyan}[4/6] 🔌 Menghubungkan MCP (Model Context Protocol) Bridge...${C.reset}`);
    await mcpBridge.start();

    console.log(`${C.cyan}[5/6] 🧩 Memuat AI Capability Package (Plugin System)...${C.reset}`);
    await pluginManager.init();

    console.log(`${C.cyan}[6/6] 📊 Mengaktifkan Observability & Server API...${C.reset}`);
    // Metrics server juga menangani POST /v5/chat
    startMetricsServer(3000);
    
    // Scheduler engine di start tanpa bot karena bot ada di client
    // Jika berjalan di mode global, client/index.js akan meng-override bot-nya
    await scheduler.start(null);

    console.log(`\n${C.green}${C.bold}✅ [SERVER MODULE] AI Backend Engine siap melayani!${C.reset}`);
  } catch (err) {
    console.error(`❌ [SERVER MODULE] Error: ${err.message}`);
    console.error(err);
  }
}

initServer();
