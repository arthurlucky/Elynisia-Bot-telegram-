/**
 * core/pluginManager.js
 * Elynisia AI Capability Package Engine (Full Lifecycle, Event Bus, Hooks, Permissions, & API)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getGlobalDB, SQLiteDB } from "../../client/core/db.js";
import { registry } from "./registry.js";
import { eventBus } from "./eventBus.js";

import { getUserWorkspaceRoot } from "../../client/utils/container.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLUGINS_ROOT = path.join(__dirname, "..", "plugins");

if (!fs.existsSync(PLUGINS_ROOT)) {
  fs.mkdirSync(PLUGINS_ROOT, { recursive: true });
}

export function getUserPluginsDir(userId) {
  const userRoot = getUserWorkspaceRoot(userId);
  const userPluginsDir = path.join(userRoot, "plugins");
  if (!fs.existsSync(userPluginsDir)) {
    fs.mkdirSync(userPluginsDir, { recursive: true });
  }
  return userPluginsDir;
}

export const ALL_PERMISSIONS = [
  "Filesystem", "SQLite Database", "Memory", "Conversation", "Scheduler",
  "Network", "Telegram API", "MCP", "Artifact", "Tool Registry",
  "Event Bus", "Plugin API", "Environment Variable"
];

export const HOOK_EVENTS = [
  "OnStartup", "OnShutdown", "OnMessage", "OnCommand", "OnToolCall",
  "OnMemorySaved", "OnDatabaseUpdated", "OnArtifactCreated",
  "OnPluginInstalled", "OnPluginRemoved", "OnSchedulerTick",
  "OnError", "OnUserJoined", "OnConversationFinished"
];

class PluginManager {
  constructor() {
    this.plugins = new Map(); // key `${userId}:${id}` -> { manifest, module, status, permissions, error }
    this.pluginAPIs = new Map();
    this.pluginLogs = new Map();
    this.workflows = new Map();
    this.prompts = new Map();
    this.artifactTemplates = new Map();
    this.schedulers = new Map();
  }

  /**
   * Scan and initialize all plugins for a specific user
   */
  async initUserPlugins(userId) {
    const userDir = getUserPluginsDir(userId);
    try {
      const folders = fs.readdirSync(userDir);
      for (const folder of folders) {
        const pluginPath = path.join(userDir, folder);
        if (fs.statSync(pluginPath).isDirectory()) {
          const loaded = await this.loadPlugin(userId, folder);
          if (loaded) {
            await this.enablePlugin(userId, folder);
          }
        }
      }
    } catch (err) {}
  }

  /**
   * Install Plugin directly from GitHub URL
   */
  async installPlugin(userId, gitUrl) {
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    const userDir = getUserPluginsDir(userId);
    const repoName = path.basename(gitUrl, ".git").toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    const targetPluginDir = path.join(userDir, repoName);

    if (fs.existsSync(targetPluginDir)) {
      await execAsync(`git -C "${targetPluginDir}" pull`);
    } else {
      await execAsync(`git clone "${gitUrl}" "${targetPluginDir}"`);
    }

    await this.loadPlugin(userId, repoName);
    await this.enablePlugin(userId, repoName);
    
    return { id: repoName };
  }


  getUserPluginsList(userId) {
    const result = [];
    for (const [key, p] of this.plugins.entries()) {
      if (String(p.userId) === String(userId)) {
        result.push({
          id: p.id,
          name: p.manifest?.name || p.id,
          version: p.manifest?.version || "1.0.0",
          status: p.status,
          description: p.manifest?.description || "",
          author: p.manifest?.author || "User",
          permissions: p.permissions || []
        });
      }
    }
    return result;
  }

  /**
   * Scan and initialize all plugins on startup
   */
  async init() {
    console.log("[PluginManager] Initializing AI Capability Packages Engine...");
    try {
      this.runGlobalHook("OnStartup", { timestamp: Date.now() });
    } catch (err) {
      console.error("[PluginManager] Error initializing plugins:", err.message);
    }
  }

  /**
   * Catat log internal per plugin
   */
  log(userId, id, type, message) {
    const key = `${userId}:${id}`;
    const logs = this.pluginLogs.get(key) || [];
    const entry = `[${new Date().toISOString()}] [${type.toUpperCase()}] ${message}`;
    logs.push(entry);
    if (logs.length > 50) logs.shift();
    this.pluginLogs.set(key, logs);
  }

  /**
   * 1. LOAD & VALIDATE PLUGIN (Lifecycle: Validate -> Dependency -> Permission -> Load)
   */
  async loadPlugin(userId, folderName) {
    const userDir = getUserPluginsDir(userId);
    const pluginDir = path.join(userDir, folderName);
    let manifestPath = path.join(pluginDir, "plugin.json");
    let manifest = {};

    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } else if (fs.existsSync(path.join(pluginDir, ".claude-plugin", "plugin.json"))) {
      manifestPath = path.join(pluginDir, ".claude-plugin", "plugin.json");
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } else if (fs.existsSync(path.join(pluginDir, "package.json"))) {
      manifestPath = path.join(pluginDir, "package.json");
      const pkg = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      manifest = {
        id: pkg.name || folderName,
        name: pkg.displayName || pkg.name || folderName,
        version: pkg.version || "1.0.0",
        description: pkg.description || "",
        author: pkg.author || "",
        entry: pkg.main || "index.js"
      };
    } else {
      // Auto-generate manifest for raw declarative repos
      manifest = {
        id: folderName,
        name: folderName,
        version: "1.0.0",
        description: "Auto-generated manifest for declarative plugin",
        author: "Unknown"
      };
    }

    try {
      const id = manifest.id || folderName;
      const key = `${userId}:${id}`;
      this.log(userId, id, "info", `Starting validation for plugin: ${id}`);

      // Dependency Check (Required & Optional)
      if (manifest.dependencies && Array.isArray(manifest.dependencies)) {
        for (const dep of manifest.dependencies) {
          const [depName] = dep.split(/[>=<]/);
          const depPath = path.join(userDir, depName);
          if (!fs.existsSync(depPath)) {
            const errStr = `Missing required dependency: ${depName}`;
            this.log(userId, id, "error", errStr);
            this.plugins.set(key, { userId, id, manifest, status: "error", error: errStr, folderName });
            return false;
          }
        }
      }

      // Permission List Fallback / Default
      const permissions = manifest.permissions || ALL_PERMISSIONS;

      // Create isolated API
      const api = this.createPluginAPI(id, pluginDir, manifest, permissions, userId);
      this.pluginAPIs.set(key, api);

      // Run Database Migrations if present
      const migrationFile = path.join(pluginDir, "migration.sql");
      if (fs.existsSync(migrationFile)) {
        const sql = fs.readFileSync(migrationFile, "utf8");
        const db = await api.getDatabase();
        await db.exec(sql);
        this.log(userId, id, "info", "Ran database migration successfully.");
      }

      // Load module dynamically if present
      let module = {};
      const entryFile = manifest.entry || "index.js";
      const entryPath = path.join(pluginDir, entryFile);

      if (fs.existsSync(entryPath)) {
        const fileUrl = `file://${entryPath}?update=${Date.now()}`;
        module = await import(fileUrl);
      } else {
        this.log(userId, id, "info", `Entry file not found. Falling back to pure declarative plugin.`);
      }

      // Universal Auto-Loader for Declarative Protocols
      const autoLoadProtocols = async (api) => {
        // Auto-load skills/
        const skillsDir = path.join(pluginDir, "skills");
        if (fs.existsSync(skillsDir)) {
          const files = fs.readdirSync(skillsDir);
          for (const f of files) {
            if (f.endsWith(".md") || f.endsWith(".js") || f.endsWith(".json")) {
              const content = fs.readFileSync(path.join(skillsDir, f), "utf8");
              const name = path.basename(f, path.extname(f));
              if (api.registerSkill) api.registerSkill(name, "Auto-loaded Skill", content);
              api.getLogger().info(`Auto-registered skill: ${name}`);
            }
          }
        }

        // Auto-load commands/
        const cmdsDir = path.join(pluginDir, "commands");
        if (fs.existsSync(cmdsDir)) {
          const files = fs.readdirSync(cmdsDir);
          for (const f of files) {
            const name = path.basename(f, path.extname(f));
            const content = fs.readFileSync(path.join(cmdsDir, f), "utf8");
            let promptText = content;
            let descText = "Auto-loaded Command";

            if (f.endsWith(".toml")) {
               let descMatch = content.match(/description\s*=\s*"([^"]+)"/);
               let promptMatch = content.match(/prompt\s*=\s*"([^"]+)"/);
               if (descMatch) descText = descMatch[1];
               if (promptMatch) promptText = promptMatch[1];
            }
            if (api.registerCommand) {
               api.registerCommand(name, null, descText, promptText);
            }
            api.getLogger().info(`Auto-registered command: ${name}`);
          }
        }

        // Auto-load MCP
        const mcpPath = path.join(pluginDir, ".mcp.json");
        if (fs.existsSync(mcpPath)) {
          api.getLogger().info(`Found MCP server configuration in .mcp.json`);
        }
      };

      // Merge module with auto-loader
      const originalOnLoad = module.onLoad;
      module = {
        ...module,
        onLoad: async (api) => {
          await autoLoadProtocols(api);
          if (originalOnLoad) await originalOnLoad(api);
        },
        onEnable: module.onEnable || (async () => {}),
        onDisable: module.onDisable || (async () => {})
      };

      this.plugins.set(key, {
        userId,
        id,
        manifest,
        module,
        status: "loaded",
        permissions,
        folderName
      });

      if (module.onLoad && typeof module.onLoad === "function") {
        await module.onLoad(api);
      }

      this.log(userId, id, "info", "Plugin loaded successfully.");
      registry.runHook("PluginLoaded", { userId, id, manifest });
      return true;

    } catch (err) {
      console.error(`[PluginManager] Failed to load plugin from "${folderName}":`, err.message);
      this.plugins.set(`${userId}:${folderName}`, { userId, id: folderName, status: "error", error: err.message, folderName });
      return false;
    }
  }

  /**
   * 2. ENABLE PLUGIN (Lifecycle: Initialize -> Register -> Running)
   */
  async enablePlugin(userId, id) {
    const key = `${userId}:${id}`;
    const plugin = this.plugins.get(key);
    if (!plugin || (plugin.status !== "loaded" && plugin.status !== "disabled")) {
      return false;
    }

    try {
      const api = this.pluginAPIs.get(key);
      const module = plugin.module;

      if (module.onEnable && typeof module.onEnable === "function") {
        await module.onEnable(api);
      }

      const db = await getGlobalDB();
      // Store in user-specific or global table? Better not to store in DB since it's user-specific
      // Let's assume plugins are enabled by default once loaded for users, but if we need state we should persist per user.
      // We will skip global DB persistence for multi-user, just keep in memory for now.

      plugin.status = "enabled";
      this.log(userId, id, "info", "Plugin enabled.");
      registry.runHook("PluginEnabled", { userId, id });
      eventBus.emitEvent("PluginEnabled", { userId, id });
      return true;
    } catch (err) {
      this.log(userId, id, "error", `Failed to enable: ${err.message}`);
      plugin.status = "error";
      plugin.error = err.message;
      return false;
    }
  }

  /**
   * 3. DISABLE PLUGIN (Lifecycle: Pause -> Disable)
   */
  async disablePlugin(userId, id) {
    const key = `${userId}:${id}`;
    const plugin = this.plugins.get(key);
    if (!plugin || plugin.status !== "enabled") {
      return false;
    }

    try {
      const api = this.pluginAPIs.get(key);
      const module = plugin.module;

      if (module.onDisable && typeof module.onDisable === "function") {
        await module.onDisable(api);
      }

      this.unregisterPluginResources(key);

      plugin.status = "disabled";
      this.log(userId, id, "info", "Plugin disabled.");
      registry.runHook("PluginDisabled", { userId, id });
      eventBus.emitEvent("PluginDisabled", { userId, id });
      return true;
    } catch (err) {
      this.log(userId, id, "error", `Failed to disable: ${err.message}`);
      return false;
    }
  }

  /**
   * 4. RELOAD / UPDATE PLUGIN
   */
  async reloadPlugin(userId, id) {
    const key = `${userId}:${id}`;
    const plugin = this.plugins.get(key);
    if (!plugin) return false;

    const folderName = plugin.folderName || id;

    if (plugin.status === "enabled") {
      await this.disablePlugin(userId, id);
    }

    if (plugin.module && plugin.module.onUnload) {
      try { await plugin.module.onUnload(this.pluginAPIs.get(key)); } catch (e) {}
    }

    this.plugins.delete(key);
    this.pluginAPIs.delete(key);

    const success = await this.loadPlugin(userId, folderName);
    if (success) {
      return await this.enablePlugin(userId, id);
    }
    return false;
  }

  /**
   * 5. UNINSTALL PLUGIN (Lifecycle: Unload -> Remove)
   */
  async uninstallPlugin(userId, id) {
    const key = `${userId}:${id}`;
    const plugin = this.plugins.get(key);
    if (!plugin) throw new Error(`Plugin '${id}' tidak ditemukan.`);

    if (plugin.status === "enabled") {
      await this.disablePlugin(userId, id);
    }

    const userDir = getUserPluginsDir(userId);
    const pluginDir = path.join(userDir, plugin.folderName || id);
    if (fs.existsSync(pluginDir)) {
      fs.rmSync(pluginDir, { recursive: true, force: true });
    }

    this.plugins.delete(key);
    this.pluginAPIs.delete(key);
    this.pluginLogs.delete(key);

    registry.runHook("OnPluginRemoved", { userId, id });
    return true;
  }

  /**
   * Jalankan Global Hook ke seluruh Plugin yang aktif
   */
  runGlobalHook(hookName, data) {
    for (const [key, plugin] of this.plugins.entries()) {
      if (plugin.status === "enabled" && plugin.module && plugin.module[hookName]) {
        try {
          plugin.module[hookName](data, this.pluginAPIs.get(key));
        } catch (err) {
          this.log(plugin.userId, plugin.id, "error", `Error executing hook ${hookName}: ${err.message}`);
        }
      }
    }
  }

  /**
   * Create an API object tailored for a specific plugin
   */
  createPluginAPI(id, pluginDir, manifest, permissions, userId) {
    const dataDir = path.join(pluginDir, "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, "storage.db");
    let localDB = null;

    const registeredResources = {
      commands: [],
      tools: [],
      skills: [],
      hooks: [],
      schedulers: [],
    };

    const hasPerm = (perm) => permissions.includes(perm);

    return {
      manifest,
      permissions,

      registerCommand: (name, handler, desc, promptTemplate = null) => {
        if (!hasPerm("Plugin API") && !hasPerm("Tool Registry")) throw new Error("Permission Denied: Command Registry");
        registry.registerCommand(userId, name, handler, desc, promptTemplate);
        registeredResources.commands.push(name);
      },

      registerTool: (name, schema, func) => {
        if (!hasPerm("Tool Registry")) throw new Error("Permission Denied: Tool Registry");
        registry.registerTool(userId, name, schema, func);
        registeredResources.tools.push(name);
      },

      registerSkill: (name, systemPrompt, description) => {
        registry.registerSkill(userId, name, systemPrompt, description);
        registeredResources.skills.push(name);
      },

      registerHook: (name, func) => {
        registry.registerHook(name, func);
        registeredResources.hooks.push({ name, func });
      },

      registerWorkflow: (name, workflowFn) => {
        this.workflows.set(`${userId}:${id}:${name}`, workflowFn);
      },

      registerPrompt: (name, promptText) => {
        this.prompts.set(`${userId}:${id}:${name}`, promptText);
      },

      registerArtifactTemplate: (name, template) => {
        this.artifactTemplates.set(`${userId}:${id}:${name}`, template);
      },

      registerScheduler: (name, intervalMs, callback) => {
        if (!hasPerm("Scheduler")) throw new Error("Permission Denied: Scheduler");
        const timerId = setInterval(() => {
          try {
            callback();
            registry.runHook("OnSchedulerTick", { userId, pluginId: id, schedulerName: name });
          } catch (e) {}
        }, intervalMs);
        registeredResources.schedulers.push(timerId);
      },

      getDatabase: async () => {
        if (!hasPerm("SQLite Database")) throw new Error("Permission Denied: SQLite Database");
        if (localDB) return localDB;
        localDB = new SQLiteDB(dbPath);
        await localDB.open();
        return localDB;
      },

      getLogger: () => ({
        info: (msg) => this.log(userId, id, "info", msg),
        warn: (msg) => this.log(userId, id, "warn", msg),
        error: (msg) => this.log(userId, id, "error", msg),
      }),

      emitEvent: (event, data) => {
        if (!hasPerm("Event Bus")) throw new Error("Permission Denied: Event Bus");
        eventBus.emitEvent(event, data);
      },

      subscribe: (event, listener) => {
        if (!hasPerm("Event Bus")) throw new Error("Permission Denied: Event Bus");
        eventBus.subscribe(event, listener);
      },

      _registered: registeredResources,
    };
  }

  /**
   * Cleanup resources registered by a plugin
   */
  unregisterPluginResources(key) {
    const api = this.pluginAPIs.get(key);
    if (!api || !api._registered) return;
    
    // key is `${userId}:${id}`
    const userId = key.split(":")[0];

    const { commands, tools, skills, hooks, schedulers } = api._registered;

    for (const cmd of commands) registry.unregisterCommand(userId, cmd);
    for (const tool of tools) registry.unregisterTool(userId, tool);
    for (const skill of skills) registry.unregisterSkill(userId, skill);
    for (const hook of hooks) registry.unregisterHook(hook.name, hook.func);
    for (const timerId of schedulers) clearInterval(timerId);
  }

  getGlobalPluginsList() {
    return Array.from(this.plugins.values()).map((p) => ({
      id: p.id,
      name: p.manifest?.name || p.id,
      version: p.manifest?.version || "1.0.0",
      status: p.status,
      error: p.error || null,
      description: p.manifest?.description || "",
      author: p.manifest?.author || "Komunitas",
      permissions: p.permissions || []
    }));
  }

  getPluginLogs(userId, id) {
    const key = `${userId}:${id}`;
    return this.pluginLogs.get(key) || ["Belum ada catatan log."];
  }
}

export const pluginManager = new PluginManager();
export default pluginManager;
