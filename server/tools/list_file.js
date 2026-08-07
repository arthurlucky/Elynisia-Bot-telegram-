import fs   from "fs";
import path from "path";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { resolveWorkspacePath } from "../../client/utils/workspace.js";

export const listFilesTool = new DynamicStructuredTool({
  name       : "list_files",
  description: "Tampilkan daftar file.",
  schema     : z.object({
    subdir: z.string().optional().describe("Sub-folder"),
  }),
  func: async ({ subdir = "" }, ctx) => {
    try {
      const dir   = resolveWorkspacePath(subdir, ctx?.userId);
      const items = fs.readdirSync(dir, { withFileTypes: true });
      if (!items.length) return "📂 Direktori kosong.";
      return items
        .map(d => d.isDirectory() ? `📁 ${d.name}/` : `📄 ${d.name}`)
        .join("\n");
    } catch (err) {
      return `❌ Error: ${err.message}`;
    }
  },
});
