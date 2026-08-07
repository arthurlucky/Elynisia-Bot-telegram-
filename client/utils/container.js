/**
 * utils/container.js
 * 
 * WorkspaceContainer Manager
 * Mengelola state per-user container:
 * - CWD (current working directory) state untuk $cd
 * - RAM limit (default 500MB)
 * - Disk limit (default 500MB)
 * - Pengukuran disk usage aktual
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { getOrCreateUserEconomy } from "../core/economy.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACES_ROOT = path.join(__dirname, "..", "Workspaces");

// In-memory state per user: userId -> { cwd: string }
const containerState = new Map();

/**
 * Mendapatkan root workspace user
 */
export function getUserWorkspaceRoot(userId) {
  const dir = path.join(WORKSPACES_ROOT, String(userId));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Mendapatkan CWD aktif user (relatif dari root workspace mereka)
 * Jika belum diset, default ke root workspace
 */
export function getUserCwd(userId) {
  const state = containerState.get(String(userId));
  const root = getUserWorkspaceRoot(userId);
  if (!state || !state.cwd) return root;

  // Pastikan path masih valid dan berada di dalam workspace
  const resolved = path.resolve(root, state.cwd);
  if (!resolved.startsWith(root)) return root;
  if (!fs.existsSync(resolved)) return root;

  return resolved;
}

/**
 * Set CWD baru untuk user
 * Validasi keamanan: harus tetap di dalam workspace root
 * @returns { ok: boolean, cwd: string, error?: string }
 */
export function setUserCwd(userId, newDir) {
  const root = getUserWorkspaceRoot(userId);
  const currentCwd = getUserCwd(userId);

  // Resolve relative to current cwd
  const resolved = newDir.startsWith("/")
    ? path.resolve(root, "." + newDir) // treat absolute as relative to root
    : path.resolve(currentCwd, newDir);

  // Security: must stay inside workspace root
  if (!resolved.startsWith(root)) {
    return { ok: false, error: "❌ Akses ditolak: Tidak dapat keluar dari workspace Anda." };
  }

  if (!fs.existsSync(resolved)) {
    return { ok: false, error: `❌ Direktori tidak ditemukan: \`${newDir}\`` };
  }

  if (!fs.statSync(resolved).isDirectory()) {
    return { ok: false, error: `❌ Bukan direktori: \`${newDir}\`` };
  }

  containerState.set(String(userId), { cwd: resolved });
  const relPath = path.relative(root, resolved) || ".";
  return { ok: true, cwd: resolved, relPath };
}

/**
 * Reset CWD user ke root workspace
 */
export function resetUserCwd(userId) {
  const root = getUserWorkspaceRoot(userId);
  containerState.set(String(userId), { cwd: root });
  return root;
}

/**
 * Hitung disk usage folder workspace user dalam MB
 */
export function getDiskUsageMB(userId) {
  const root = getUserWorkspaceRoot(userId);
  try {
    const result = execSync(`du -sm "${root}" 2>/dev/null | cut -f1`, { timeout: 5000 }).toString().trim();
    return parseInt(result) || 0;
  } catch {
    return 0;
  }
}

/**
 * Estimasi RAM usage proses bot saat ini dalam MB (keseluruhan node process)
 * Digunakan sebagai referensi — dalam Termux kita tidak bisa isolasi RAM per user
 */
export function getSystemRamUsageMB() {
  try {
    const mem = process.memoryUsage();
    return Math.round(mem.rss / 1024 / 1024);
  } catch {
    return 0;
  }
}

/**
 * Mendapatkan limit container user dari database economy
 * Default: 500MB RAM, 500MB disk
 */
export async function getContainerLimits(userId) {
  const profile = await getOrCreateUserEconomy(userId);
  return {
    ram_limit_mb: profile.ram_limit_mb || 500,
    disk_limit_mb: profile.disk_limit_mb || 500,
    ports_limit: profile.ports_limit || 1,
  };
}

/**
 * Mendapatkan status container lengkap untuk /constatus
 */
export async function getContainerStatus(userId) {
  const root = getUserWorkspaceRoot(userId);
  const cwd = getUserCwd(userId);
  const relCwd = path.relative(root, cwd) || ".";
  const limits = await getContainerLimits(userId);
  const diskUsed = getDiskUsageMB(userId);
  const ramUsed = getSystemRamUsageMB();

  // Count files in workspace
  let fileCount = 0;
  try {
    const result = execSync(`find "${root}" -type f 2>/dev/null | wc -l`, { timeout: 5000 }).toString().trim();
    fileCount = parseInt(result) || 0;
  } catch { fileCount = 0; }

  const diskPct = Math.min(100, Math.round((diskUsed / limits.disk_limit_mb) * 100));
  const ramPct = Math.min(100, Math.round((ramUsed / limits.ram_limit_mb) * 100));

  function bar(pct) {
    const filled = Math.round(pct / 10);
    return "█".repeat(filled) + "░".repeat(10 - filled);
  }

  const diskStatus = diskPct >= 90 ? "🔴" : diskPct >= 70 ? "🟡" : "🟢";
  const ramStatus = ramPct >= 90 ? "🔴" : ramPct >= 70 ? "🟡" : "🟢";

  // Calculate allocated port numbers based on ports_limit (Base port 3000 + userId hash % 500)
  const basePort = 3000 + (parseInt(String(userId).slice(-4)) || 100);
  const assignedPorts = [];
  for (let i = 0; i < limits.ports_limit; i++) {
    assignedPorts.push(basePort + i);
  }
  const portsListStr = assignedPorts.map(p => `\`:${p}\``).join(", ");

  return (
    `🖥️ *STATUS CONTAINER — Workspaces/${userId}*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📂 *CWD Aktif:* \`${relCwd}\`\n` +
    `📁 *Total File:* \`${fileCount} file\`\n\n` +
    `${diskStatus} *DISK USAGE*\n` +
    `\`${bar(diskPct)}\` ${diskPct}%\n` +
    `\`${diskUsed} MB\` / \`${limits.disk_limit_mb} MB\`\n\n` +
    `${ramStatus} *RAM USAGE (Proses Bot)*\n` +
    `\`${bar(ramPct)}\` ${ramPct}%\n` +
    `\`${ramUsed} MB\` / \`${limits.ram_limit_mb} MB\`\n\n` +
    `🌐 *Port Diizinkan (${limits.ports_limit} Port):*\n` +
    `👉 ${portsListStr}\n\n` +
    `💡 Upgrade di \`/shop\` → tambah RAM/Disk/Port`
  );
}

/**
 * Cek apakah disk sudah melebihi limit
 */
export async function isDiskFull(userId) {
  const limits = await getContainerLimits(userId);
  const used = getDiskUsageMB(userId);
  return used >= limits.disk_limit_mb;
}
