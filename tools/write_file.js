import fs   from "fs";
import path from "path";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { resolveWorkspacePath } from "../utils/workspace.js";

export const writeFileTool = new DynamicStructuredTool({
  name       : "write_file",
  description: "Buat atau timpa file.",
  schema     : z.object({
    path   : z.string().describe("Path file"),
    content: z.string().describe("Konten teks yang akan ditulis ke file"),
  }),
  func: async ({ path: filename, content }, ctx) => {
    try {
      const fp  = resolveWorkspacePath(filename, ctx?.userId);
      const dir = path.dirname(fp);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fp, content, "utf-8");
      const lines = content.split("\n").length;
      return `✅ File "${filename}" berhasil ditulis (${lines} baris).`;
    } catch (err) {
      return `❌ Error: ${err.message}`;
    }
  },
});
