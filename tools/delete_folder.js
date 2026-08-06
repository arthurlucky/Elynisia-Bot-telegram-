import fs from "fs/promises";
import os from "os";
import path from "path";

import { z } from "zod";

import {
  DynamicStructuredTool,
} from "@langchain/core/tools";

import {
  resolveWorkspacePath,
  ROOT_DIR,
} from "../utils/workspace.js";

// BUGFIX (safety): sebelumnya tool ini langsung fs.rm(target, {recursive,
// force}) TANPA proteksi sama sekali — beda dengan shell_exec yang punya
// BLACKLIST buat mencegah pola "rm -rf /". Karena resolveWorkspacePath
// sengaja mendukung path absolut ke MANA SAJA (lihat AGENT.md bagian FULL
// SYSTEM ACCESS) dan path relatif seperti ".." bisa lolos ke luar project
// root, tool ini sebelumnya bisa menghapus root project sendiri, home
// directory user, atau bahkan root filesystem ("/") kalau LLM salah/
// berhalusinasi mengisi parameter path. Guard di bawah mencegah penghapusan
// titik-titik krusial itu, sambil tetap mempertahankan filosofi "akses
// penuh ke folder lain di luar root" untuk target yang BUKAN salah satu
// titik krusial tsb.
function isDangerousTarget(target) {
  const home = path.resolve(os.homedir());
  const resolvedRoot = path.resolve("/");
  const critical = [resolvedRoot, home, path.resolve(ROOT_DIR)];

  const normalizedTarget = path.resolve(target);

  for (const c of critical) {
    if (normalizedTarget === c) return true;
    // Cegah juga menghapus folder yang merupakan LELUHUR dari titik kritis
    // (mis. target ".." dari dalam home dir akan menghapus home itu sendiri
    // beserta semua isinya termasuk project root).
    const rel = path.relative(normalizedTarget, c);
    if (rel && !rel.startsWith("..") && rel !== "") return true;
  }
  return false;
}

export default new DynamicStructuredTool({
  name: "delete_folder",

  description:
    "Menghapus folder",

  schema: z.object({
    path: z.string(),
  }),

  async func({ path }, ctx) {
    const target =
      resolveWorkspacePath(
        path,
        ctx?.userId
      );

    if (isDangerousTarget(target)) {
      return `❌ Ditolak: "${target}" adalah folder root sistem, home directory, project root EMORA, atau leluhur dari salah satunya. Penghapusan ini akan merusak sistem dan dibatalkan demi keamanan.`;
    }

    await fs.rm(
      target,
      {
        recursive: true,
        force: true,
      }
    );

    return `Folder berhasil dihapus: ${path}`;
  },
});