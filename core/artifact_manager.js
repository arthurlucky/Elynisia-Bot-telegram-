/**
 * core/artifact_manager.js
 * Persistent Structured Artifact Manager & Versioning Engine untuk Elynisia
 */

import crypto from "crypto";
import path from "path";
import fs from "fs";
import { getUserDB } from "./db.js";
import { getUserWorkspaceRoot } from "../utils/container.js";

export const ARTIFACT_TYPES = [
  "markdown", "html", "json", "mermaid", "svg", "source_code", "sql", "documentation", "report", "workflow", "config"
];

export class ArtifactManager {
  /**
   * Buat Artifact Baru
   */
  static async createArtifact(userId, { name, type = "markdown", content = "", metadata = {} }) {
    const db = await getUserDB(userId);
    const id = `ART-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const now = Date.now();
    const version = 1;

    await db.run(
      "INSERT INTO artifacts (id, user_id, name, type, version, content, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [id, String(userId), name, type.toLowerCase(), version, content, JSON.stringify(metadata), now, now]
    );

    // Catat ke riwayat versi pertama
    await db.run(
      "INSERT INTO artifact_history (artifact_id, version, content, summary, created_at) VALUES (?, ?, ?, 'Inisialisasi awal artifact', ?)",
      [id, version, content, now]
    );

    return { id, name, type, version, content, metadata };
  }

  /**
   * Ambil Daftar Artifact milik User
   */
  static async getUserArtifacts(userId) {
    const db = await getUserDB(userId);
    return db.all("SELECT id, name, type, version, updated_at FROM artifacts WHERE user_id = ? ORDER BY updated_at DESC", [String(userId)]);
  }

  /**
   * Buka / Detail Artifact
   */
  static async getArtifact(userId, artifactId) {
    const db = await getUserDB(userId);
    const art = await db.get("SELECT * FROM artifacts WHERE user_id = ? AND id = ?", [String(userId), artifactId]);
    if (!art) throw new Error(`Artifact ID '${artifactId}' tidak ditemukan.`);
    return {
      ...art,
      metadata: JSON.parse(art.metadata_json || "{}")
    };
  }

  /**
   * Edit / Update Artifact (Increment Version + Record History)
   */
  static async updateArtifact(userId, artifactId, newContent, summary = "Update konten") {
    const db = await getUserDB(userId);
    const art = await this.getArtifact(userId, artifactId);

    const newVersion = art.version + 1;
    const now = Date.now();

    await db.run(
      "UPDATE artifacts SET content = ?, version = ?, updated_at = ? WHERE user_id = ? AND id = ?",
      [newContent, newVersion, now, String(userId), artifactId]
    );

    await db.run(
      "INSERT INTO artifact_history (artifact_id, version, content, summary, created_at) VALUES (?, ?, ?, ?, ?)",
      [artifactId, newVersion, newContent, summary, now]
    );

    return { id: artifactId, newVersion, updated_at: now };
  }

  /**
   * Hapus Artifact & Riwayatnya
   */
  static async deleteArtifact(userId, artifactId) {
    const db = await getUserDB(userId);
    const art = await this.getArtifact(userId, artifactId);

    await db.run("DELETE FROM artifacts WHERE user_id = ? AND id = ?", [String(userId), artifactId]);
    await db.run("DELETE FROM artifact_history WHERE artifact_id = ?", [artifactId]);

    return { id: artifactId, name: art.name };
  }

  /**
   * Fork Artifact (Salin Artifact ke ID Baru)
   */
  static async forkArtifact(userId, artifactId, newName = null) {
    const art = await this.getArtifact(userId, artifactId);
    const name = newName || `${art.name} (Fork)`;
    return this.createArtifact(userId, {
      name,
      type: art.type,
      content: art.content,
      metadata: { ...art.metadata, forkedFrom: artifactId }
    });
  }

  /**
   * Ambil Riwayat Perubahan (Version History)
   */
  static async getHistory(userId, artifactId) {
    const db = await getUserDB(userId);
    await this.getArtifact(userId, artifactId); // Validasi kepemilikan
    return db.all("SELECT id, version, summary, created_at FROM artifact_history WHERE artifact_id = ? ORDER BY version DESC", [artifactId]);
  }

  /**
   * Ekspor Artifact ke File Lokal Workspace User
   */
  static async exportArtifact(userId, artifactId) {
    const art = await this.getArtifact(userId, artifactId);
    const root = getUserWorkspaceRoot(userId);
    const extMap = { markdown: "md", html: "html", json: "json", svg: "svg", sql: "sql", source_code: "js" };
    const ext = extMap[art.type] || "txt";

    const fileName = `${art.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${art.id}.${ext}`;
    const filePath = path.join(root, fileName);

    fs.writeFileSync(filePath, art.content, "utf8");
    return { fileName, filePath };
  }
}

export default ArtifactManager;
