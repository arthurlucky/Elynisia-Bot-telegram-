import fg from "fast-glob";

import { z } from "zod";

import {
  DynamicStructuredTool,
} from "@langchain/core/tools";

import {
  resolveWorkspacePath,
} from "../../client/utils/workspace.js";

export default new DynamicStructuredTool({
  name: "find_folder",

  description:
    "Mencari folder berdasarkan nama",

  schema: z.object({
    name: z.string(),
  }),

  async func({ name }, ctx) {
    const root =
      resolveWorkspacePath(
        "",
        ctx?.userId
      );

    // BUGFIX (perf): sama seperti search_text.js, cegah noise dari
    // node_modules/.git/dll yang gak relevan dan bikin lambat.
    const dirs =
      await fg("**", {
        cwd: root,
        onlyDirectories: true,
        absolute: false,
        ignore: [
          "**/node_modules/**",
          "**/.git/**",
          "**/dist/**",
          "**/.nuxt/**",
          "**/.output/**",
        ],
      });

    const found =
      dirs.filter((dir) =>
        dir
          .toLowerCase()
          .includes(
            name.toLowerCase()
          )
      );

    return JSON.stringify(
      found,
      null,
      2
    );
  },
});