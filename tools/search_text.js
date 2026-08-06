import fs from "fs/promises";
import fg from "fast-glob";

import { z } from "zod";

import {
  DynamicStructuredTool,
} from "@langchain/core/tools";

import {
  resolveWorkspacePath,
} from "../utils/workspace.js";

export default new DynamicStructuredTool({
  name: "search_text",

  description:
    "Mencari teks dalam seluruh file",

  schema: z.object({
    query: z.string(),
  }),

  async func({ query }, ctx) {
    const root =
      resolveWorkspacePath(
        "",
        ctx?.userId
      );

    // BUGFIX (perf): sebelumnya tidak ada ignore sama sekali, jadi kalau
    // ada node_modules/.git/dll di project root, tool ini bisa membaca
    // RIBUAN file yang gak relevan (lambat banget, kadang sampai terasa
    // "macet") sebelum hasil pencarian balik ke LLM.
    const files =
      await fg("**/*", {
        cwd: root,
        absolute: true,
        onlyFiles: true,
        ignore: [
          "**/node_modules/**",
          "**/.git/**",
          "**/dist/**",
          "**/.nuxt/**",
          "**/.output/**",
          "**/downloads/**",
          "**/uploads/**",
          "**/memory/**",
          "**/backups/**",
          "**/skill_factory/**",
        ],
      });

    const results = [];

    for (const file of files) {
      try {
        const content =
          await fs.readFile(
            file,
            "utf8"
          );

        const lines =
          content.split("\n");

        lines.forEach(
          (line, index) => {
            if (
              line.includes(query)
            ) {
              results.push({
                file,
                line:
                  index + 1,
                text:
                  line.trim(),
              });
            }
          }
        );
      } catch {}
    }

    return JSON.stringify(
      results.slice(0, 100),
      null,
      2
    );
  },
});