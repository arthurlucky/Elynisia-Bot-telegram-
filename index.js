import "dotenv/config";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { getGlobalDB } from "./core/db.js";
import { registry } from "./core/registry.js";
import tools from "./core/tools.js";
import { skillManager } from "./core/skills.js";
import { knowledgeLibrary } from "./core/knowledge.js";
import { mcpBridge } from "./core/mcp.js";
import { pluginManager } from "./core/pluginManager.js";
import { scheduler } from "./core/scheduler.js";
import { bot, startBot } from "./gateway/telegram.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.join(__dirname, ".env");

// ANSI Color Tokens untuk Tampilan EMORA CLI
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  bgCyan: "\x1b[46m\x1b[30m",
  bgMagenta: "\x1b[45m\x1b[37m"
};

/**
 * Display Banner & Dashboard System ala EMORA CLI
 */
function printEmoraHeader() {
  console.clear();
  console.log(`${C.cyan}${C.bold}`);
  console.log(` ╔═════════════════════════════════════════════════════════════════════════╗`);
  console.log(` ║                                                                         ║`);
  console.log(` ║    ███████╗██╗     ██╗   ██╗███╗   ██╗██╗███████╗██╗ █████╗             ║`);
  console.log(` ║    ██╔════╝██║     ╚██╗ ██╔╝████╗  ██║██║██╔════╝██║██╔══██╗            ║`);
  console.log(` ║    █████╗  ██║      ╚████╔╝ ██╔██╗ ██║██║███████╗██║███████║            ║`);
  console.log(` ║    ██╔══╝  ██║       ╚██╔╝  ██║╚██╗██║██║╚════██║██║██╔══██║            ║`);
  console.log(` ║    ███████╗███████╗   ██║   ██║ ╚████║██║███████║██║██║  ██║            ║`);
  console.log(` ║    ╚══════╝╚══════╝   ╚═╝   ╚═╝  ╚═══╝╚═╝╚══════╝╚═╝╚═╝  ╚═╝            ║`);
  console.log(` ║                                                                         ║`);
  console.log(` ║                ⚡ EMORA-POWERED AGENTIC AI CORE ENGINE ⚡               ║`);
  console.log(` ╚═════════════════════════════════════════════════════════════════════════╝${C.reset}\n`);

  const memUsed = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  const memTotal = Math.round(os.totalmem() / 1024 / 1024);
  const modelProvider = (process.env.MODEL_PROVIDER || "gemini").toUpperCase();

  console.log(`${C.bold}════════════════════ SYSTEM DASHBOARD STATUS ════════════════════${C.reset}`);
  console.log(`  🖥️  ${C.bold}OS Platform:${C.reset}    ${os.platform()} (${os.arch()})`);
  console.log(`  🟢 ${C.bold}Node.js:${C.reset}        ${process.version}`);
  console.log(`  🧠 ${C.bold}AI Provider:${C.reset}    ${C.magenta}${modelProvider}${C.reset} (${process.env.MODEL_NAME || "default"})`);
  console.log(`  💾 ${C.bold}RAM Usage:${C.reset}      ${memUsed} MB / ${memTotal} MB`);
  console.log(`  📂 ${C.bold}Workspace:${C.reset}      ${process.cwd()}`);
  console.log(`${C.bold}═════════════════════════════════════════════════════════════════${C.reset}\n`);
}

function ensureEnvFile() {
  if (!fs.existsSync(ENV_PATH)) {
    console.log(`${C.yellow}⚠️  .env file tidak ditemukan. Membuat template .env baru...${C.reset}`);
    const template = `# Elynisia Bot Environment Configuration

TELEGRAM_TOKEN_BOT=
OWNER_ID=
TELEGRAM_ALLOWED_IDS=

MODEL_PROVIDER=gemini
MODEL_API=
MODEL_NAME=gemini-2.5-flash
`;
    fs.writeFileSync(ENV_PATH, template, "utf8");
    console.log(`${C.green}👉 Template .env telah dibuat. Silakan isi kredensial Anda!${C.reset}`);
  }
}

async function main() {
  printEmoraHeader();
  ensureEnvFile();

  try {
    console.log(`${C.cyan}[1/7] ⚡ Inisialisasi Global SQLite Database...${C.reset}`);
    await getGlobalDB();

    console.log(`${C.cyan}[2/7] 🛠️ Mendaftarkan Core Tools (${tools.length} Tools)...${C.reset}`);
    for (const tool of tools) {
      registry.registerTool(tool);
    }

    console.log(`${C.cyan}[3/7] 🎓 Memuat Skills Engine...${C.reset}`);
    await skillManager.init();

    console.log(`${C.cyan}[4/7] 📚 Memuat Knowledge Library & Embeddings...${C.reset}`);
    await knowledgeLibrary.init();

    console.log(`${C.cyan}[5/7] 🔌 Menghubungkan MCP (Model Context Protocol) Bridge...${C.reset}`);
    await mcpBridge.start();

    console.log(`${C.cyan}[6/7] 🧩 Memuat AI Capability Package (Plugin System)...${C.reset}`);
    await pluginManager.init();

    console.log(`${C.cyan}[7/7] ⏰ Mengaktifkan Background Scheduler Engine...${C.reset}`);
    await scheduler.start(bot);

    console.log(`\n${C.green}${C.bold}🚀 ELYNISIA CORE EMORA SYSTEM SIAP & APRESIATIF!${C.reset}`);
    
    if (bot) {
      console.log(`${C.blue}🌐 Menghubungkan ke Telegram Bot Gateway...${C.reset}`);
      await startBot();
    } else {
      console.log(`${C.yellow}⚠️  TELEGRAM_TOKEN_BOT belum diisi di .env. Telegram Gateway dinonaktifkan.${C.reset}`);
    }

  } catch (err) {
    console.error(`\n${C.red}${C.bold}❌ KRITIS: Gagal memulai Elynisia Engine: ${err.message}${C.reset}`);
    process.exit(1);
  }
}

// Graceful Shutdown
process.on("SIGINT", () => {
  console.log(`\n${C.yellow}[Core] Menghentikan Elynisia Engine secara bersih...${C.reset}`);
  mcpBridge.closeAll();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log(`\n${C.yellow}[Core] Terminated. Membersihkan resource...${C.reset}`);
  mcpBridge.closeAll();
  process.exit(0);
});

main();
