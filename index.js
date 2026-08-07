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
  if (currentConfig.APP_MODE && currentConfig.PORT) {
    return { mode: currentConfig.APP_MODE, port: currentConfig.PORT };
  }
  
  printBanner();
  
  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "mode",
      message: "🚀 Pilih arsitektur sistem yang ingin dijalankan:",
      choices: [
        { name: "🌍 Global Mode (Jalankan Client + Server bersaman)", value: "global" },
        { name: "🖥️  Server Only (Private AI Backend murni)", value: "server" },
        { name: "📱 Client Only (Gateway Telegram murni)", value: "client" }
      ]
    },
    {
      type: "input",
      name: "port",
      message: "🔌 Tentukan Port untuk REST API (Default 3000):",
      default: "3000",
      validate: (input) => !isNaN(input) || "Port harus berupa angka!"
    }
  ]);
  
  const spinner = ora("Menyimpan konfigurasi server...").start();
  
  currentConfig.APP_MODE = answers.mode;
  currentConfig.PORT = answers.port;
  writeEnv(currentConfig);
  
  setTimeout(() => {
    spinner.succeed("Konfigurasi berhasil disimpan ke .env!");
  }, 1000);
  
  return { mode: answers.mode, port: answers.port };
}

async function main() {
  const { mode, port } = await askSetupWizard();
  
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
