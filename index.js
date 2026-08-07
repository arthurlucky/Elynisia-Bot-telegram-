import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import inquirer from "inquirer";
import ora from "ora";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.join(__dirname, ".env");

// Custom Banner
const printBanner = () => {
  console.clear();
  console.log(`\x1b[36m
  ███████╗██╗     ██╗   ██╗███╗   ██╗██╗███████╗██╗ █████╗ 
  ██╔════╝██║     ╚██╗ ██╔╝████╗  ██║██║██╔════╝██║██╔══██╗
  █████╗  ██║      ╚████╔╝ ██╔██╗ ██║██║███████╗██║███████║
  ██╔══╝  ██║       ╚██╔╝  ██║╚██╗██║██║╚════██║██║██╔══██║
  ███████╗███████╗   ██║   ██║ ╚████║██║███████║██║██║  ██║
  ╚══════╝╚══════╝   ╚═╝   ╚═╝  ╚═══╝╚═╝╚══════╝╚═╝╚═╝  ╚═╝
  \x1b[35mEnterprise Autonomous Microservices Framework\x1b[0m
  `);
};

function readEnv() {
  let config = {};
  if (fs.existsSync(ENV_PATH)) {
    const envRaw = fs.readFileSync(ENV_PATH, "utf8");
    envRaw.split(/\r?\n/).forEach(line => {
      const parts = line.split("=");
      if (parts.length >= 2) config[parts[0].trim()] = parts.slice(1).join("=").trim();
    });
  }
  return config;
}

function writeEnv(config) {
  let envStr = "";
  for (const [k, v] of Object.entries(config)) {
    envStr += `${k}=${v}\n`;
  }
  fs.writeFileSync(ENV_PATH, envStr, "utf8");
}

async function askSetupWizard() {
  const currentConfig = readEnv();
  
  // Periksa kelengkapan konfigurasi saat ini
  const hasBase = currentConfig.APP_MODE && currentConfig.PORT;
  const hasGlobal = hasBase && currentConfig.TELEGRAM_TOKEN_BOT && currentConfig.MODEL_API;
  const hasServer = hasBase && currentConfig.MODEL_API;
  const hasClient = hasBase && currentConfig.TELEGRAM_TOKEN_BOT;
  
  if ((currentConfig.APP_MODE === "global" && hasGlobal) ||
      (currentConfig.APP_MODE === "server" && hasServer) ||
      (currentConfig.APP_MODE === "client" && hasClient)) {
    return currentConfig;
  }
  
  printBanner();
  
  const baseAnswers = await inquirer.prompt([
    {
      type: "select",
      name: "mode",
      message: "🚀 Pilih arsitektur sistem yang ingin dijalankan:",
      when: () => !currentConfig.APP_MODE,
      choices: [
        { name: "🌍 Global Mode (Jalankan Client + Server bersamaan)", value: "global" },
        { name: "🖥️  Server Only (Private AI Backend murni)", value: "server" },
        { name: "📱 Client Only (Gateway Telegram murni)", value: "client" }
      ]
    },
    {
      type: "input",
      name: "port",
      message: "🔌 Tentukan Port untuk REST API (Default 3000):",
      default: currentConfig.PORT || "3000",
      validate: (input) => !isNaN(input) || "Port harus berupa angka!"
    }
  ]);
  
  const mode = currentConfig.APP_MODE || baseAnswers.mode;
  currentConfig.APP_MODE = mode;
  currentConfig.PORT = baseAnswers.port;

  const credentialsPrompt = [];

  // Jika Server / Global, butuh Model API
  if (mode === "global" || mode === "server") {
    if (!currentConfig.MODEL_PROVIDER) {
      credentialsPrompt.push({
        type: "select",
        name: "provider",
        message: "🧠 Pilih Provider AI Utama:",
        choices: ["gemini", "openai", "anthropic", "groq", "deepseek", "ollama", "openrouter"]
      });
    }
    if (!currentConfig.MODEL_API) {
      credentialsPrompt.push({
        type: "password",
        name: "modelApi",
        message: "🔑 Masukkan API Key Provider AI (Disembunyikan):",
        mask: "*"
      });
    }
  }

  // Jika Client / Global, butuh Telegram Token
  if (mode === "global" || mode === "client") {
    if (!currentConfig.TELEGRAM_TOKEN_BOT) {
      credentialsPrompt.push({
        type: "password",
        name: "botToken",
        message: "🤖 Masukkan Token Bot Telegram (dari @BotFather):",
        mask: "*"
      });
    }
    if (!currentConfig.OWNER_ID) {
      credentialsPrompt.push({
        type: "input",
        name: "ownerId",
        message: "👑 Masukkan Telegram ID Kamu (Sebagai CEO/Owner):",
        validate: (input) => !isNaN(input) || "ID harus berupa angka!"
      });
    }
  }

  if (credentialsPrompt.length > 0) {
    const credAnswers = await inquirer.prompt(credentialsPrompt);
    if (credAnswers.provider) currentConfig.MODEL_PROVIDER = credAnswers.provider;
    if (credAnswers.modelApi) currentConfig.MODEL_API = credAnswers.modelApi;
    if (credAnswers.botToken) currentConfig.TELEGRAM_TOKEN_BOT = credAnswers.botToken;
    if (credAnswers.ownerId) {
      currentConfig.OWNER_ID = credAnswers.ownerId;
      currentConfig.TELEGRAM_ALLOWED_IDS = credAnswers.ownerId; // Default allowed ID
    }
  }
  
  const spinner = ora("Menyimpan konfigurasi server...").start();
  writeEnv(currentConfig);
  
  setTimeout(() => {
    spinner.succeed("Konfigurasi berhasil disimpan ke .env!");
  }, 1000);
  
  // Karena setTimeout asinkron dan return langsung jalan,
  // lebih baik kita Promise-kan delay ini agar rapih (meski sebelumnya tak masalah)
  await new Promise(r => setTimeout(r, 1200));
  
  return currentConfig;
}

async function main() {
  const config = await askSetupWizard();
  const mode = config.APP_MODE;
  const port = config.PORT;
  
  console.log("\n\x1b[36m⚡ Memulai Inisialisasi Sistem...\x1b[0m");
  const hasClient = fs.existsSync(path.join(__dirname, "client"));
  const hasServer = fs.existsSync(path.join(__dirname, "server"));

  if (!hasClient && !hasServer) {
    ora().fail("Struktur client/ dan server/ tidak ditemukan. Pastikan Anda mengunduh versi lengkap.");
    process.exit(1);
  }
  
  // Masukkan PORT ke process.env secara dinamis agar module metrics/server membacanya
  process.env.PORT = port;

  if (mode === "global" || mode === "server") {
    if (hasServer) {
      const s = ora("Menghidupkan AI Backend (Server)...").start();
      const serverIndex = path.join(__dirname, "server", "index.js");
      if (fs.existsSync(serverIndex)) {
        await import("file://" + serverIndex);
        s.succeed("AI Backend berhasil menyala di Port " + port);
      } else {
        s.warn("server/index.js tidak ditemukan, mengabaikan.");
      }
    }
  }

  if (mode === "global" || mode === "client") {
    if (hasClient) {
      const s = ora("Mengaktifkan Telegram Gateway (Client)...").start();
      const clientIndex = path.join(__dirname, "client", "index.js");
      if (fs.existsSync(clientIndex)) {
        await import("file://" + clientIndex);
        s.succeed("Telegram Gateway berhasil menyala!");
      } else {
        s.warn("client/index.js tidak ditemukan, mengabaikan.");
      }
    }
  }
}

main().catch(err => {
  ora().fail(`Kesalahan Sistem Kritis: ${err.message}`);
  console.error(err);
});
