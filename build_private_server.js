import fs from "fs";
import path from "path";
import archiver from "archiver";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function buildZip() {
  console.log("🛠️ Memulai proses kompilasi Private Server...");
  const distDir = path.join(__dirname, "dist");
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
  }

  const zipPath = path.join(distDir, "server.zip");
  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  output.on("close", () => {
    console.log(`✅ File server.zip berhasil dibuat! Ukuran: ${archive.pointer()} bytes`);
  });

  archive.on("error", (err) => {
    throw err;
  });

  archive.pipe(output);

  const serverDir = path.join(__dirname, "server");
  if (fs.existsSync(serverDir)) {
    // Memasukkan seluruh folder server/ KECUALI node_modules dan .env
    archive.glob('**/*', {
      cwd: serverDir,
      ignore: ['node_modules/**', '.env']
    }, { prefix: 'server' }); // Opsional: Beri prefix folder
  } else {
    console.warn("⚠️ Folder server/ tidak ditemukan, zip mungkin kosong!");
  }

  // ── GENERATE PACKAGE.JSON ──
  const pkgJson = {
    name: "elynisia-private-server",
    version: "5.0.0",
    description: "Private AI Backend for Elynisia",
    type: "module",
    scripts: {
      "start": "node index.js"
    },
    dependencies: {
      "express": "^4.18.2",
      "dotenv": "^16.3.1",
      "inquirer": "^9.2.10",
      "ora": "^7.0.1",
      "@langchain/google-genai": "^0.0.32",
      "@langchain/core": "^0.1.62"
    }
  };
  archive.append(JSON.stringify(pkgJson, null, 2), { name: "package.json" });

  // Tambahkan setup wizard global (index.js/server.js khusus private server)
  const serverJsContent = `
import express from "express";
import readline from "readline";
import fs from "fs";
import inquirer from "inquirer";
import ora from "ora";

const app = express();
app.use(express.json());

const envPath = ".env";
let config = {};
if (fs.existsSync(envPath)) {
  const envRaw = fs.readFileSync(envPath, "utf8");
  envRaw.split(/\\r?\\n/).forEach(line => {
    const parts = line.split("=");
    if (parts.length >= 2) config[parts[0].trim()] = parts.slice(1).join("=").trim();
  });
}

const printBanner = () => {
  console.clear();
  console.log("\\x1b[35m====================================================\\x1b[0m");
  console.log("\\x1b[1m🚀 ELYNISIA PRIVATE SERVER - SETUP WIZARD\\x1b[0m");
  console.log("\\x1b[35m====================================================\\x1b[0m\\n");
};

async function runWizard() {
  if (config.PORT && config.API_KEY && config.MODEL_PROVIDER && config.MODEL_NAME) return;
  
  printBanner();
  
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "port",
      message: "🔌 Tentukan Port untuk Web Server (Default: 3005):",
      default: "3005",
      validate: (input) => !isNaN(input) || "Port harus berupa angka!"
    },
    {
      type: "password",
      name: "apiKey",
      message: "🔑 Buat Password Rahasia Server (Untuk \`/server connect\`):",
      mask: "*"
    },
    {
      type: "select",
      name: "provider",
      message: "🧠 Pilih Provider AI Utama:",
      choices: ["gemini", "openai", "anthropic", "groq", "deepseek", "ollama", "openrouter", "customEndpoint"]
    },
    {
      type: "input",
      name: "modelName",
      message: "🤖 Masukkan Nama Model AI (Misal: gemini-2.5-flash):",
      default: "gemini-2.5-flash"
    },
    {
      type: "input",
      name: "modelUrl",
      message: "🌐 Masukkan Base URL Endpoint AI (Biarkan kosong jika bawaan Provider):",
      default: ""
    },
    {
      type: "password",
      name: "modelApi",
      message: "🔑 Masukkan API Key Provider AI (Biarkan kosong jika Ollama/Local):",
      mask: "*"
    }
  ]);
  
  const spinner = ora("Menyimpan rahasia server...").start();
  
  const envContent = \`PORT=\${answers.port}
API_KEY=\${answers.apiKey}
MODEL_PROVIDER=\${answers.provider}
MODEL_NAME=\${answers.modelName}
MODEL_URL=\${answers.modelUrl}
MODEL_API=\${answers.modelApi}
\`;
  fs.writeFileSync(envPath, envContent, "utf8");
  
  setTimeout(() => {
    spinner.succeed("Konfigurasi disimpan! Silakan restart server dengan 'npm start'");
    process.exit(0);
  }, 1500);
}

app.post("/v5/chat", async (req, res) => {
  // Disini akan memanggil logika dari folder server/ (RAG, dll)
  return res.json({ success: true, reply: "Pesan diterima oleh Private Server (Tahap Pengembangan)" });
});

async function main() {
  await runWizard();
  app.listen(config.PORT, () => {
    console.log(\`\\n🌐 Private Server aktif di: http://localhost:\${config.PORT}\`);
  });
}
main();
`;
  archive.append(serverJsContent, { name: "index.js" });

  await archive.finalize();
}

buildZip().catch(console.error);
