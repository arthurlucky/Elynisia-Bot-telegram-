import fs from "fs";
import path from "path";
import * as archiver from "archiver";

import { z } from "zod";
import { DynamicStructuredTool } from "@langchain/core/tools";

import {
  resolveWorkspacePath,
} from "../utils/workspace.js";

export const zipCompressTool =
  new DynamicStructuredTool({
    name: "zip_compress",

    description:
      "Mengompres beberapa file dan/atau folder menjadi satu file ZIP",

    schema: z.object({
      items: z
        .array(z.string())
        .min(1)
        .describe(
          "Daftar file atau folder yang akan dikompres"
        ),

      output: z
        .string()
        .describe(
          "Nama file ZIP hasil kompresi"
        ),
    }),

    async func({
      items,
      output,
    }, ctx) {
      try {
        const outputZip =
          resolveWorkspacePath(
            output,
            ctx?.userId
          );

        const validItems =
          [];

        for (const item of items) {
          const fullPath =
            resolveWorkspacePath(
              item,
              ctx?.userId
            );

          if (
            !fs.existsSync(
              fullPath
            )
          ) {
            return JSON.stringify(
              {
                success: false,

                error: `Path tidak ditemukan: ${item}`,
              },
              null,
              2
            );
          }

          const stat =
            fs.statSync(
              fullPath
            );

          validItems.push({
            original:
              item,

            absolute:
              fullPath,

            type:
              stat.isDirectory()
                ? "folder"
                : "file",
          });
        }

        return new Promise(
          (
            resolve,
            reject
          ) => {
            const outputStream =
              fs.createWriteStream(
                outputZip
              );

            const archive =
              archiver.create(
                "zip",
                {
                  zlib: {
                    level: 9,
                  },
                }
              );

            outputStream.on(
              "close",
              () => {
                resolve(
                  JSON.stringify(
                    {
                      success: true,

                      action:
                        "zip_compress",

                      output,

                      compressedItems:
                        validItems.map(
                          (
                            item
                          ) => ({
                            type:
                              item.type,

                            path:
                              item.original,
                          })
                        ),

                      totalItems:
                        validItems.length,

                      compressedSize:
                        archive.pointer(),
                    },
                    null,
                    2
                  )
                );
              }
            );

            outputStream.on(
              "error",
              reject
            );

            archive.on(
              "error",
              reject
            );

            archive.pipe(
              outputStream
            );

            for (const item of validItems) {
              if (
                item.type ===
                "folder"
              ) {
                archive.directory(
                  item.absolute,

                  path.basename(
                    item.absolute
                  )
                );
              } else {
                archive.file(
                  item.absolute,

                  {
                    name: path.basename(
                      item.absolute
                    ),
                  }
                );
              }
            }

            archive.finalize();
          }
        );
      } catch (err) {
        return JSON.stringify(
          {
            success: false,
            error:
              err.message,
          },
          null,
          2
        );
      }
    },
  });

export default zipCompressTool;