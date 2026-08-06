import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

// Import fungsi dari gateway
import { resolveWorkspacePath } from "../utils/workspace.js";
import { sendFileToUser } from "../gateway/index.js";

const BASE_DIR = path.resolve(process.cwd());
const DEFAULT_TIMEOUT = 60_000;
const MAX_TIMEOUT = 300_000;
const MAX_OUTPUT = 8000; 

const BLACKLIST = [
  /rm\s+-rf\s+\/(?!\S)/,     
  /rm\s+-rf\s+~\//,          
  /:\(\)\s*\{.*fork/,        
  /dd\s+if=.*of=\/dev\//,    
  /mkfs\./,                  
  /shutdown/,
  /reboot/,
  /halt/,
  /poweroff/,
  />\s*\/dev\/sd/,           
  /chmod\s+777\s+\/(?!\S)/, 
  /passwd(?:\s|$)/,          
  /sudo\s+rm\s+-rf\s+\//,
];

function isSafe(cmd) {
  return !BLACKLIST.some(pattern => pattern.test(cmd));
}

function resolveCwd(cwd, userId = null) {
  let baseDir = BASE_DIR;
  if (userId) {
    baseDir = path.resolve(BASE_DIR, "Workspaces", String(userId));
  }
  if (!cwd) return baseDir;
  return path.isAbsolute(cwd) ? cwd : path.resolve(baseDir, cwd);
}

export const shellExecTool = new DynamicStructuredTool({
  name: "shell_exec",
  description:
    "Jalankan perintah terminal/shell nyata. BISA JUGA untuk kirim file ke user via Telegram ATAU WhatsApp (otomatis sesuai gateway aktif) menggunakan perintah khusus: sendFile --pathfile=\"...\" --text=\"...\"",
  schema: z.object({
    command: z.string(),
    session_id: z.string().describe("WAJIB DIISI dengan Session ID (dari [INFO SYSTEM]) HANYA JIKA menggunakan perintah sendFile!").optional(),
    cwd: z.string().describe("Working directory. Kosongkan untuk mengeksekusi di root project (Emora-Agent).").optional(),
    timeout: z.number().int().min(1000).max(MAX_TIMEOUT).optional(),
    create_cwd: z.boolean().optional().default(true),
  }),
  func: async ({ command, session_id, cwd, timeout = DEFAULT_TIMEOUT, create_cwd = true }, ctx) => {
    
    // [INTERCEPTOR]: Cegat perintah sendFile (bekerja untuk Telegram MAUPUN WhatsApp)
    if (command.trim().startsWith("sendFile")) {
      if (!session_id) return "❌ Gagal: parameter session_id WAJIB diisi untuk sendFile.";

      const pathMatch = command.match(/--pathfile=(?:"([^"]+)"|'([^']+)'|(\S+))/);
      const textMatch = command.match(/--text=(?:"([^"]+)"|'([^']+)'|(\S+))/);

      if (!pathMatch) {
        return '❌ Format salah. Gunakan: sendFile --pathfile="./namafile.txt" --text="Caption"';
      }

      const rawPath = pathMatch[1] || pathMatch[2] || pathMatch[3];
      const caption = textMatch ? (textMatch[1] || textMatch[2] || textMatch[3]) : "";
      const absolutePath = resolveWorkspacePath(rawPath, ctx?.userId);

      if (!fs.existsSync(absolutePath)) {
        return `❌ File tidak ditemukan: '${rawPath}'`;
      }

      const results = await sendFileToUser(session_id, absolutePath, caption);
      return results.join("\n");
    }

    if (ctx?.userId) {
      const lower = command.toLowerCase();
      if (lower.includes("..") || lower.includes(" /") || lower.includes(" ~/")) {
        return "❌ Akses ditolak: Jalur traversal (..) atau absolute paths luar dilarang di dalam workspace.";
      }
      if (lower.includes("rm") && (lower.includes("-rf") || lower.includes("-f") || lower.includes("-r"))) {
        if (lower.includes("/") && !lower.includes(`workspaces/${ctx.userId}`) && !lower.includes("./")) {
          return "❌ Akses ditolak: Dilarang menghapus file di luar folder workspace Anda.";
        }
      }
      if (lower.includes("/etc") || lower.includes("/sys") || lower.includes("/proc") || lower.includes("/usr") || lower.includes("/dev")) {
        return "❌ Akses ditolak: Dilarang mengakses direktori sistem.";
      }
    }

    if (!isSafe(command)) return `🚫 Perintah diblokir: "${command}"`;

    const workDir = resolveCwd(cwd, ctx?.userId);

    if (create_cwd && !fs.existsSync(workDir)) {
      try { fs.mkdirSync(workDir, { recursive: true }); }
      catch (e) { return `❌ Gagal membuat direktori "${workDir}": ${e.message}`; }
    }

    if (!fs.existsSync(workDir)) return `❌ Direktori tidak ditemukan: "${workDir}"`;

    const lines = [
      `💻 $ ${command}`,
      `📁 CWD: ${path.relative(process.cwd(), workDir) || "."}`,
      ``,
    ];

    try {
      // 🟢 DETEKSI OS OTOMATIS & ASYNCHRONOUS EXECUTOR
      const isWin = os.platform() === "win32";
      const shellCmd = isWin ? "cmd.exe" : "bash";
      const shellArgs = isWin ? ["/c", command] : ["-c", command];

      const result = await new Promise((resolve) => {
        const child = spawn(shellCmd, shellArgs, {
          cwd: workDir,
          env: { ...process.env, FORCE_COLOR: "0" },
        });

        let stdout = "";
        let stderr = "";
        let isTimedOut = false;

        const timer = setTimeout(() => {
          isTimedOut = true;
          child.kill("SIGTERM");
        }, timeout);

        child.stdout.on("data", (data) => {
          if (stdout.length < MAX_OUTPUT * 2) {
            stdout += data.toString();
          }
        });

        child.stderr.on("data", (data) => {
          if (stderr.length < MAX_OUTPUT * 2) {
            stderr += data.toString();
          }
        });

        child.on("error", (err) => {
          clearTimeout(timer);
          resolve({ stdout, stderr, code: -1, error: err });
        });

        child.on("close", (code) => {
          clearTimeout(timer);
          if (isTimedOut) {
            resolve({ stdout, stderr, code: -1, error: { code: "ETIMEDOUT", message: "Timeout" } });
          } else {
            resolve({ stdout, stderr, code: code ?? -1, error: null });
          }
        });
      });

      const stdoutStr = (result.stdout ?? "").trim();
      const stderrStr = (result.stderr ?? "").trim();
      const code = result.code;

      if (stdoutStr) {
        lines.push("📤 Output:");
        lines.push(stdoutStr.length > MAX_OUTPUT ? stdoutStr.slice(0, MAX_OUTPUT) + "\n…(dipotong)" : stdoutStr);
      }

      if (stderrStr) {
        lines.push(stdoutStr ? "\n⚠️ Stderr:" : "⚠️ Stderr:");
        lines.push(stderrStr.length > MAX_OUTPUT ? stderrStr.slice(0, MAX_OUTPUT) + "\n…(dipotong)" : stderrStr);
      }

      if (result.error) {
        if (result.error.code === "ETIMEDOUT") lines.push(`⏱️ Timeout setelah ${timeout / 1000} detik.`);
        else lines.push(`❌ Error: ${result.error.message}`);
        return lines.join("\n");
      }

      lines.push(`\n${code === 0 ? "✅" : "⚠️"} Exit code: ${code}`);
      return lines.join("\n");

    } catch (err) {
      return `❌ shell_exec gagal: ${err.message}`;
    }
  },
});

