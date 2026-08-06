import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { resolveWorkspacePath } from "../utils/workspace.js";


export const backupManager = new DynamicStructuredTool({
  name: "backup_manager",
  description: "Manage project backups: create, list, restore, and clean zip backups in the /backups folder.",
  
  schema: z.object({
    action: z.enum(["create", "list", "restore", "clean"]).describe("Action to perform: create, list, restore, or clean"),
    target: z.string().optional().describe("The file or folder to backup/restore. For 'create', it's the source path. For 'restore', it's the backup filename."),
    backupName: z.string().optional().describe("Custom name for the backup file (only for 'create' action)"),
  }),

  func: async ({ action, target, backupName }) => {
    try {
      const backupDir = resolveWorkspacePath("backups");
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      if (action === "create") {
        if (!target) return "❌ Error: Target path is required for 'create' action.";
        
        const sourcePath = resolveWorkspacePath(target);
        if (!fs.existsSync(sourcePath)) return `❌ Error: Source path ${target} does not exist.`;

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const fileName = backupName ? `${backupName}.zip` : `backup_${path.basename(sourcePath)}_${timestamp}.zip`;
        const outputPath = path.join(backupDir, fileName);

        // Using system zip command for efficiency (Zero Installation Policy: using child_process)
        // For Windows: 'powershell Compress-Archive', For Linux/Mac: 'zip'
        const isWin = process.platform === "win32";
        if (isWin) {
          execSync(`powershell Compress-Archive -Path "${sourcePath}" -DestinationPath "${outputPath}" -Force`);
        } else {
          execSync(`zip -r "${outputPath}" "${sourcePath}"`);
        }

        return `✅ Backup created successfully: ${fileName}`;
      }

      if (action === "list") {
        const files = fs.readdirSync(backupDir);
        if (files.length === 0) return "ℹ️ No backups found in /backups folder.";
        
        const list = files.map(f => {
          const stats = fs.statSync(path.join(backupDir, f));
          return `- ${f} (${(stats.size / 1024).toFixed(2)} KB)`;
        }).join("\n");
        
        return `📂 Available Backups:\n${list}`;
      }

      if (action === "restore") {
        if (!target) return "❌ Error: Backup filename is required for 'restore' action.";
        
        const backupPath = path.join(backupDir, target);
        if (!fs.existsSync(backupPath)) return `❌ Error: Backup file ${target} not found.`;

        const isWin = process.platform === "win32";
        if (isWin) {
          execSync(`powershell Expand-Archive -Path "${backupPath}" -DestinationPath "." -Force`);
        } else {
          execSync(`unzip -o "${backupPath}" -d .`);
        }

        return `✅ Backup ${target} restored successfully to root.`;
      }

      if (action === "clean") {
        const files = fs.readdirSync(backupDir);
        files.forEach(f => fs.unlinkSync(path.join(backupDir, f)));
        return "✅ All backups have been cleared.";
      }

    } catch (err) {
      return `❌ Error in backup_manager: ${err.message}`;
    }
  },
});

export default backupManager;
