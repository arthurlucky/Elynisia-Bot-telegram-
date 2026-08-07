/**
 * core/marketplace_engine.js
 * Git-Based Plugin Marketplace & Claude Code Compatibility Engine untuk Elynisia
 */

import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { getUserDB, getGlobalDB } from "../../client/core/db.js";
import { getUserWorkspaceRoot } from "../../client/utils/container.js";
import { getUserPluginsDir, pluginManager } from "./pluginManager.js";

const execAsync = promisify(exec);

export class MarketplaceEngine {
  /**
   * Dapatkan Direktori Penyimpanan Marketplace Lokal User
   */
  static getMarketplaceDir(userId) {
    const root = getUserWorkspaceRoot(userId);
    const mDir = path.join(root, "marketplaces");
    if (!fs.existsSync(mDir)) {
      fs.mkdirSync(mDir, { recursive: true });
    }
    return mDir;
  }

  /**
   * Tambah Repository Marketplace Git (/plugin marketplace add <git_url>)
   */
  static async addMarketplace(userId, gitUrl) {
    const db = await getUserDB(userId);
    const mDir = this.getMarketplaceDir(userId);

    // Ekstrak nama repo dari URL Git
    const repoName = path.basename(gitUrl, ".git").toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    const targetPath = path.join(mDir, repoName);

    if (fs.existsSync(targetPath)) {
      // Jika sudah ada, lakukan git pull
      try {
        await execAsync(`git -C "${targetPath}" pull`);
      } catch (e) {}
    } else {
      // Clone repository git
      await execAsync(`git clone "${gitUrl}" "${targetPath}"`);
    }

    // Deteksi Format Marketplace (Elynisia vs Claude Code)
    const formatInfo = this.detectAndParseMarketplace(targetPath);

    // Simpan data Marketplace ke DB User
    await db.run(
      "INSERT OR REPLACE INTO user_marketplaces (name, git_url, path, format, updated_at) VALUES (?, ?, ?, ?, ?)",
      [repoName, gitUrl, targetPath, formatInfo.format, Date.now()]
    );

    // Indeks Seluruh Plugin dari Marketplace ke DB
    let indexedCount = 0;
    for (const item of formatInfo.plugins) {
      await db.run(
        "INSERT OR REPLACE INTO marketplace_plugins (id, marketplace_name, name, version, description, author, source_url, permissions_json, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          item.id,
          repoName,
          item.name,
          item.version || "1.0.0",
          item.description || "",
          item.author || "Community",
          item.source_url || gitUrl,
          JSON.stringify(item.permissions || []),
          formatInfo.format === "claude_code" ? "Claude Code Compatible" : "Elynisia Native"
        ]
      );
      indexedCount++;
    }

    return { name: repoName, format: formatInfo.format, indexedCount };
  }

  /**
   * Deteksi Format Catalog (elynisia.marketplace.json vs .claude-plugin/marketplace.json)
   */
  static detectAndParseMarketplace(repoPath) {
    const elynisiaCatalogPath = path.join(repoPath, "elynisia.marketplace.json");
    const claudeCatalogPath1 = path.join(repoPath, ".claude-plugin", "marketplace.json");
    const claudeCatalogPath2 = path.join(repoPath, "marketplace.json");

    if (fs.existsSync(elynisiaCatalogPath)) {
      const data = JSON.parse(fs.readFileSync(elynisiaCatalogPath, "utf8"));
      return { format: "elynisia_native", plugins: data.plugins || [] };
    }

    if (fs.existsSync(claudeCatalogPath1) || fs.existsSync(claudeCatalogPath2)) {
      const targetFile = fs.existsSync(claudeCatalogPath1) ? claudeCatalogPath1 : claudeCatalogPath2;
      const data = JSON.parse(fs.readFileSync(targetFile, "utf8"));
      // Compatibility Translation: Terjemahkan Claude Code Plugins ke Format Elynisia
      const translatedPlugins = (data.plugins || data || []).map(p => ({
        id: p.name || p.id,
        name: p.displayName || p.name || p.id,
        version: p.version || "1.0.0",
        description: p.description || "Claude Code Compatible Plugin",
        author: p.author || "Claude Ecosystem",
        source_url: p.repository || p.url || p.source,
        permissions: p.permissions || ["Tool Registry", "Filesystem"]
      }));
      return { format: "claude_code", plugins: translatedPlugins };
    }

    // Fallback Scan Subfolders for plugin.json
    const plugins = [];
    const files = fs.readdirSync(repoPath);
    for (const f of files) {
      const sub = path.join(repoPath, f);
      const manifestPath = path.join(sub, "plugin.json");
      if (fs.statSync(sub).isDirectory() && fs.existsSync(manifestPath)) {
        try {
          const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
          plugins.push({
            id: m.id || f,
            name: m.name || f,
            version: m.version || "1.0.0",
            description: m.description || "",
            author: m.author || "Community",
            source_url: m.repository || repoPath,
            permissions: m.permissions || []
          });
        } catch (e) {}
      }
    }

    return { format: "generic_git", plugins };
  }

  /**
   * List Marketplace Terpasang
   */
  static async listMarketplaces(userId) {
    const db = await getUserDB(userId);
    return db.all("SELECT * FROM user_marketplaces ORDER BY updated_at DESC");
  }

  /**
   * Cari Plugin di Katalog Marketplace Terindeks
   */
  static async searchPlugins(userId, keyword = "") {
    const db = await getUserDB(userId);
    const q = `%${keyword.toLowerCase()}%`;
    return db.all(
      "SELECT * FROM marketplace_plugins WHERE LOWER(name) LIKE ? OR LOWER(description) LIKE ? OR LOWER(id) LIKE ? ORDER BY name ASC",
      [q, q, q]
    );
  }

  /**
   * Hapus Marketplace
   */
  static async removeMarketplace(userId, name) {
    const db = await getUserDB(userId);
    await db.run("DELETE FROM user_marketplaces WHERE user_id = ? AND name = ?", [String(userId), name]);
    await db.run("DELETE FROM marketplace_plugins WHERE marketplace_name = ?", [name]);
    return true;
  }

  /**
   * Install Plugin dari Marketplace ke Workspace Privat User
   */
  static async installPluginFromMarketplace(userId, pluginId) {
    const db = await getUserDB(userId);
    const item = await db.get("SELECT * FROM marketplace_plugins WHERE id = ?", [pluginId]);
    if (!item) throw new Error(`Plugin ID '${pluginId}' tidak ditemukan di katalog Marketplace!`);

    const userPluginsDir = getUserPluginsDir(userId);
    const targetPluginDir = path.join(userPluginsDir, pluginId);

    if (item.source_url && item.source_url.startsWith("http")) {
      if (fs.existsSync(targetPluginDir)) {
        await execAsync(`git -C "${targetPluginDir}" pull`);
      } else {
        await execAsync(`git clone "${item.source_url}" "${targetPluginDir}"`);
      }
    } else {
      // Buat folder minimal jika berupa paket dummy
      if (!fs.existsSync(targetPluginDir)) fs.mkdirSync(targetPluginDir, { recursive: true });
      const manifest = {
        id: item.id,
        name: item.name,
        version: item.version,
        description: item.description,
        author: item.author,
        permissions: JSON.parse(item.permissions_json || "[]")
      };
      fs.writeFileSync(path.join(targetPluginDir, "plugin.json"), JSON.stringify(manifest, null, 2));
      fs.writeFileSync(path.join(targetPluginDir, "index.js"), `export async function onLoad() {}\nexport async function onEnable() {}`);
    }

    // Auto-load & auto-enable
    await pluginManager.loadPlugin(userId, pluginId);
    await pluginManager.enablePlugin(userId, pluginId);
    return item;
  }
}

export default MarketplaceEngine;
