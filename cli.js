#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";
import { getGlobalDB } from "./client/core/db.js";
import { getUserRole, setUserRole } from "./client/core/permissions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to format milliseconds to human-readable duration
function formatDuration(ms) {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(" ");
}

// Draw ASCII text-based table
function drawTable(headers, rows) {
  const colWidths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i] || "").length)));
  const separator = "+" + colWidths.map(w => "-".repeat(w + 2)).join("+") + "+";
  
  let out = separator + "\n";
  out += "| " + headers.map((h, i) => h.padEnd(colWidths[i])).join(" | ") + " |\n";
  out += separator + "\n";
  
  if (rows.length === 0) {
    const totalWidth = colWidths.reduce((a, b) => a + b, 0) + (colWidths.length * 3) - 1;
    out += "| " + "No data available".padEnd(totalWidth) + " |\n";
  } else {
    rows.forEach(r => {
      out += "| " + r.map((cell, i) => String(cell ?? "").padEnd(colWidths[i])).join(" | ") + " |\n";
    });
  }
  
  out += separator;
  return out;
}

// Commands execution logic
async function runCommand(cmdLine, isInteractive = false) {
  const cleanCmd = cmdLine.trim();
  if (!cleanCmd) return;

  const parts = cleanCmd.split(/\s+/);
  let cmd = parts[0].toLowerCase();
  
  // Strip leading slash if any
  if (cmd.startsWith("/")) {
    cmd = cmd.substring(1);
  }

  const globalDb = await getGlobalDB();

  if (cmd === "exit" || cmd === "quit" || cmd === "q") {
    console.log("Menghentikan CLI Elynisia. Sampai jumpa!");
    process.exit(0);
  }

  else if (cmd === "help" || cmd === "h") {
    console.log("\n==========================================");
    console.log("            ELYNISIA CLI HELP");
    console.log("==========================================");
    console.log("/setup                - Mulai Setup Wizard (Inisialisasi Server)");
    console.log("/start                - Menjalankan Elynisia (berdasarkan .env)");
    console.log("/reset                - Hapus semua konfigurasi & database (!Bahaya)");
    console.log("/userlist             - List all registered bot users");
    console.log("/rolemanager <uid> <role> - Manage/update user roles");
    console.log("/status               - View runtime, uptime & database stats");
    console.log("/exit                 - Exit the CLI tool");
    console.log("==========================================\n");
  }

  else if (cmd === "setup") {
    console.log("🚀 Menjalankan Setup Wizard Elynisia...");
    // Jalankan index.js melalui child process agar dapat berinteraksi dengan Inquirer
    const { spawn } = await import("child_process");
    const setupProc = spawn("node", [path.join(__dirname, "index.js"), "--setup-only"], { stdio: "inherit" });
    await new Promise(resolve => setupProc.on("close", resolve));
  }

  else if (cmd === "start" || cmd === "run") {
    console.log("🚀 Memulai Sistem Elynisia...");
    // Import dan jalankan file index.js (ini akan membaca mode dari .env)
    const { spawn } = await import("child_process");
    const startProc = spawn("node", [path.join(__dirname, "index.js")], { stdio: "inherit" });
    await new Promise(resolve => startProc.on("close", resolve));
  }

  else if (cmd === "reset") {
    const { default: inquirer } = await import("inquirer");
    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: "⚠️ PERINGATAN: Ini akan menghapus file .env dan seluruh Database SQLite (memory/). Lanjutkan?",
        default: false
      }
    ]);
    if (confirm) {
      try {
        const envFile = path.join(__dirname, ".env");
        if (fs.existsSync(envFile)) fs.unlinkSync(envFile);
        
        const memoryDir = path.join(__dirname, "memory");
        if (fs.existsSync(memoryDir)) {
           fs.rmSync(memoryDir, { recursive: true, force: true });
        }
        console.log("✅ Sistem berhasil di-reset sepenuhnya!");
      } catch(err) {
        console.error("❌ Gagal melakukan reset:", err.message);
      }
    } else {
      console.log("Dibatalkan.");
    }
  }

  else if (cmd === "userlist") {
    try {
      const users = await globalDb.all("SELECT * FROM user_economy");
      const rows = [];
      for (const u of users) {
        const role = await getUserRole(u.user_id);
        const limitRow = await globalDb.get("SELECT custom_limit FROM user_roles WHERE user_id = ?", [String(u.user_id)]);
        const limitStr = limitRow ? limitRow.custom_limit : "Default";

        rows.push([
          u.user_id,
          u.username || "Guest",
          role.toUpperCase(),
          String(u.level || 1),
          (u.tokens ?? 10000).toLocaleString(),
          limitStr
        ]);
      }
      
      console.log("\n💬 DAFTAR USER AKTIF ELYNISIA");
      console.log(drawTable(
        ["User ID", "Username", "Role", "Level", "Sisa Token", "Custom Limit"],
        rows
      ));
      console.log();
    } catch (err) {
      console.error("❌ Gagal memuat userlist:", err.message);
    }
  }

  else if (cmd === "rolemanager") {
    const targetUid = parts[1];
    const targetRole = parts[2];

    if (!targetUid || !targetRole) {
      console.log("Format salah! Gunakan: /rolemanager <userId> <owner|admin|user|custom_role_name>");
      return;
    }

    try {
      await setUserRole(targetUid, targetRole.toLowerCase());
      console.log(`\n✅ Role untuk user ID [${targetUid}] berhasil diubah ke: ${targetRole.toUpperCase()}\n`);
    } catch (err) {
      console.error("❌ Gagal mengubah role:", err.message);
    }
  }

  else if (cmd === "status") {
    try {
      const statusFile = path.join(__dirname, "memory", "status.json");
      let statusData = null;
      let isOnline = false;

      if (fs.existsSync(statusFile)) {
        try {
          statusData = JSON.parse(fs.readFileSync(statusFile, "utf8"));
          process.kill(statusData.pid, 0); // test if process exists
          isOnline = true;
        } catch (e) {
          isOnline = false;
        }
      }

      // Calculate sizes
      let globalDbSize = 0;
      const globalDbFile = path.join(__dirname, "memory", "global.db");
      if (fs.existsSync(globalDbFile)) {
        globalDbSize = fs.statSync(globalDbFile).size;
      }

      const memoryRoot = path.join(__dirname, "memory");
      let totalFiles = 0;
      let totalDbSize = 0;
      if (fs.existsSync(memoryRoot)) {
        const items = fs.readdirSync(memoryRoot);
        for (const item of items) {
          const itemPath = path.join(memoryRoot, item);
          if (fs.statSync(itemPath).isDirectory() && item.match(/^\d+$/)) {
            const userFiles = fs.readdirSync(itemPath);
            for (const uf of userFiles) {
              totalFiles++;
              if (uf.endsWith(".db")) {
                totalDbSize += fs.statSync(path.join(itemPath, uf)).size;
              }
            }
          }
        }
      }

      const plugins = await globalDb.all("SELECT * FROM plugins WHERE enabled = 1");
      const pluginsList = plugins.length > 0 
        ? plugins.map(p => `${p.name} (v${p.version})`).join(", ")
        : "None";

      console.log("\n==========================================");
      console.log("          ELYNISIA RUNTIME STATUS");
      console.log("==========================================");
      console.log(`• Status Bot:     ${isOnline ? "\x1b[32m● ONLINE (RUNNING)\x1b[0m" : "\x1b[31m○ OFFLINE (STOPPED)\x1b[0m"}`);
      if (isOnline && statusData) {
        console.log(`• Bot Process PID:${statusData.pid}`);
        console.log(`• Bot Uptime:     ${formatDuration(Date.now() - statusData.startTime)}`);
      }
      console.log(`• CLI Directory:  ${__dirname}`);
      console.log(`• Global DB Size: ${(globalDbSize / 1024).toFixed(2)} KB`);
      console.log(`• Users Memory:   ${totalFiles} files (${(totalDbSize / 1024).toFixed(2)} KB)`);
      console.log(`• Active Plugins: ${pluginsList}`);
      console.log("==========================================\n");
    } catch (err) {
      console.error("❌ Gagal memuat runtime status:", err.message);
    }
  }

  else {
    console.log(`Perintah tidak dikenal: "${cmd}". Ketik /help untuk melihat daftar perintah.`);
  }
}

// Start CLI Flow
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length > 0) {
    // Direct command execution mode
    const cmdLine = args.join(" ");
    await runCommand(cmdLine, false);
    process.exit(0);
  }

  // Interactive REPL Mode
  console.log("==========================================");
  console.log("         ELYNISIA AGENT BOT CLI");
  console.log("==========================================");
  console.log("Ketik /help untuk panduan perintah.");
  console.log("Ketik /exit untuk keluar.");
  console.log("==========================================\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "Elynisia CLI > "
  });

  rl.prompt();

  rl.on("line", async (line) => {
    await runCommand(line, true);
    rl.prompt();
  }).on("close", () => {
    console.log("\nMenghentikan CLI Elynisia. Sampai jumpa!");
    process.exit(0);
  });
}

main().catch(err => {
  console.error("Fatal CLI Error:", err);
  process.exit(1);
});
