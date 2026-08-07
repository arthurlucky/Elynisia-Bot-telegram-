import fs from "fs/promises";

import { z } from "zod";

import {
  DynamicStructuredTool,
} from "@langchain/core/tools";

import {
  resolveWorkspacePath,
} from "../../client/utils/workspace.js";

export default new DynamicStructuredTool({
  name: "create_folder",

  description:
    "Membuat folder",

  schema: z.object({
    path: z.string(),
  }),

  async func({ path }, ctx) {
    const target =
      resolveWorkspacePath(
        path,
        ctx?.userId
      );

    await fs.mkdir(
      target,
      {
        recursive: true,
      }
    );

    return `Folder berhasil dibuat: ${path}`;
  },
});