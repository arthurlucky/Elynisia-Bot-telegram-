import fs from "fs/promises";
import AdmZip from "adm-zip";

import { z } from "zod";
import { DynamicStructuredTool } from "@langchain/core/tools";

import {
  resolveWorkspacePath,
} from "../../client/utils/workspace.js";

export default new DynamicStructuredTool({
  name: "zip_extract",

  description:
    "Mengekstrak file ZIP",

  schema: z.object({
    zipFile: z.string(),
    destination:
      z.string(),
  }),

  async func({
    zipFile,
    destination,
  }, ctx) {
    const zipPath =
      resolveWorkspacePath(
        zipFile,
        ctx?.userId
      );

    const extractDir =
      resolveWorkspacePath(
        destination,
        ctx?.userId
      );

    await fs.mkdir(
      extractDir,
      {
        recursive: true,
      }
    );

    const zip =
      new AdmZip(
        zipPath
      );

    const entries =
      zip
        .getEntries()
        .map(
          (entry) => ({
            name:
              entry.entryName,

            isDirectory:
              entry.isDirectory,

            size:
              entry.header
                ?.size ??
              0,
          })
        );

    zip.extractAllTo(
      extractDir,
      true
    );

    return JSON.stringify(
      {
        success: true,

        action:
          "zip_extract",

        zipFile,

        destination,

        totalEntries:
          entries.length,

        entries,
      },
      null,
      2
    );
  },
});