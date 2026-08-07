import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const CONTAINERS_DIR = path.join(ROOT_DIR, ".emora", "containers");

const activeContainers = new Map();

/**
 * Ensures the container directory structure exists.
 */
async function ensureContainer(id) {
  const dir = path.join(CONTAINERS_DIR, id);
  const memoryDir = path.join(dir, "memory");
  
  await fs.mkdir(dir, { recursive: true });
  await fs.mkdir(memoryDir, { recursive: true });

  // Create default configs if they don't exist
  const gatewayConfig = path.join(dir, "gateways.config.json");
  const agentFile = path.join(dir, "AGENT.md");
  const soulFile = path.join(dir, "SOUL.md");

  try { await fs.stat(gatewayConfig); } catch {
    await fs.writeFile(gatewayConfig, JSON.stringify({ enabled: false, platforms: {} }, null, 2));
  }
  try { await fs.stat(agentFile); } catch {
    await fs.writeFile(agentFile, "You are a specialized Swarm Agent.");
  }
  try { await fs.stat(soulFile); } catch {
    await fs.writeFile(soulFile, "Act intelligently and precisely.");
  }

  return {
    dir,
    memoryDir,
    gatewayConfig,
    agentFile,
    soulFile
  };
}

export async function createContainer(id) {
  await ensureContainer(id);
  return { success: true, message: `Container ${id} created.` };
}

/**
 * Start a container as a background process.
 */
export async function startContainer(id) {
  const paths = await ensureContainer(id);
  const pidFile = path.join(paths.dir, "gateway.pid");
  try {
    const existingPid = await fs.readFile(pidFile, "utf8");
    if (existingPid) {
      try {
        process.kill(parseInt(existingPid, 10), 0); // Check if process exists
        return { success: false, message: "Container is already running" };
      } catch (e) {
        // Process dead, cleanup
        await fs.unlink(pidFile).catch(()=>{});
      }
    }
  } catch(e) {}

  let config = {};
  try {
    const raw = await fs.readFile(path.join(paths.dir, "config.json"), "utf8");
    config = JSON.parse(raw);
  } catch (e) {}

  const env = {
    ...process.env,
    NAME: `Emora-${id}`,
    EMORA_MEMORY_DIR: paths.memoryDir,
    EMORA_GATEWAY_CONFIG: paths.gatewayConfig,
    EMORA_AGENT_PATH: paths.agentFile,
    EMORA_SOUL_PATH: paths.soulFile,
    EMORA_CRON_FILE: path.join(paths.dir, "jobs.json"),
    EMORA_PID_FILE: path.join(paths.dir, "gateway.pid"),
    EMORA_TUI_LOCK_FILE: path.join(paths.dir, "tui.lock")
  };

  if (config.model_provider) env.MODEL_PROVIDER = config.model_provider;
  if (config.model_name) env.MODEL_NAME = config.model_name;
  if (config.model_url) env.MODEL_URL = config.model_url;
  if (config.model_api) env.MODEL_API = config.model_api;

  const logOut = await import("fs").then(m => m.openSync(path.join(paths.dir, "out.log"), "a"));
  const logErr = await import("fs").then(m => m.openSync(path.join(paths.dir, "err.log"), "a"));

  const proc = spawn("node", ["bin/emora.js", "gateway", "run"], {
    cwd: ROOT_DIR,
    env,
    detached: true,
    stdio: ["ignore", logOut, logErr]
  });

  proc.unref();

  return { success: true, pid: proc.pid };
}

/**
 * Stop a running container.
 */
export async function stopContainer(id) {
  const pidFile = path.join(CONTAINERS_DIR, id, "gateway.pid");
  try {
    const pid = await fs.readFile(pidFile, "utf8");
    process.kill(parseInt(pid, 10), "SIGTERM");
    await fs.unlink(pidFile).catch(()=>{});
    activeContainers.delete(id);
    return { success: true };
  } catch (e) {
    return { success: false, message: "Container is not running or already stopped" };
  }
}

/**
 * Get status and logs of all containers.
 */
export async function listContainers() {
  let allDirs = [];
  try {
    const entries = await fs.readdir(CONTAINERS_DIR, { withFileTypes: true });
    allDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }

  const result = [];
  for (const id of allDirs) {
    let pid = null;
    let isActive = false;
    try {
      const pidStr = await fs.readFile(path.join(CONTAINERS_DIR, id, "gateway.pid"), "utf8");
      pid = parseInt(pidStr, 10);
      process.kill(pid, 0); // test if alive
      isActive = true;
    } catch(e) {
      pid = null;
      isActive = false;
    }
    
    let logs = [];
    try {
      const logTxt = await fs.readFile(path.join(CONTAINERS_DIR, id, "out.log"), "utf8");
      logs = logTxt.split("\n").slice(-15);
    } catch(e) {}

    result.push({
      id,
      status: isActive ? "running" : "stopped",
      pid,
      logs
    });
  }
  return result;
}

export async function deleteContainer(id) {
  await stopContainer(id).catch(() => {});
  const dir = path.join(CONTAINERS_DIR, id);
  await fs.rm(dir, { recursive: true, force: true });
  return { success: true, message: `Container ${id} deleted.` };
}

export async function getContainerConfig(id) {
  const configFile = path.join(CONTAINERS_DIR, id, "config.json");
  try {
    const raw = await fs.readFile(configFile, "utf8");
    return JSON.parse(raw);
  } catch {
    return {
      model_provider: "gemini",
      model_name: "gemini-1.5-flash",
      model_url: "",
      model_api: "",
      gateway_enabled: false,
      telegram_token: ""
    };
  }
}

export async function updateContainerConfig(id, config) {
  const dir = path.join(CONTAINERS_DIR, id);
  await fs.mkdir(dir, { recursive: true });
  const configFile = path.join(dir, "config.json");
  await fs.writeFile(configFile, JSON.stringify(config, null, 2));

  // Also update gateways.config.json
  const gatewayConfig = path.join(dir, "gateways.config.json");
  const gateways = {
    enabled: !!config.gateway_enabled,
    platforms: {
      telegram: {
        type: "telegram",
        enabled: !!config.gateway_enabled,
        token: config.telegram_token || "",
        allowedUsers: [],
        maxUsers: 0,
        extra: {}
      }
    }
  };
  await fs.writeFile(gatewayConfig, JSON.stringify(gateways, null, 2));
  return { success: true };
}
