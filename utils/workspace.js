import path from "path";
import os from "os";

export const ROOT_DIR = path.resolve(process.cwd());
export const PLATFORM = os.platform(); // 'win32' (Windows), 'linux', 'darwin' (Mac), 'android' (Termux)

// Jadikan Root Project sebagai default directory
export const WORKSPACE_DIR = ROOT_DIR;

export function resolveWorkspacePath(targetPath = "", userId = null) {
  let cleanPath = targetPath.trim();

  // Tetap simpan ini untuk berjaga-jaga jika AI masih berhalusinasi mengetik 'workspaces/'
  cleanPath = cleanPath.replace(/^(\.\/)?workspaces\/?/, "");

  let baseDir = WORKSPACE_DIR;
  if (userId) {
    baseDir = path.resolve(WORKSPACE_DIR, "Workspaces", String(userId));
  }

  let resolved;
  
  if (path.isAbsolute(cleanPath)) {
    if (userId) {
      const relativePart = cleanPath
        .replace(WORKSPACE_DIR, "")
        .replace(`/Workspaces/${userId}`, "")
        .replace(`Workspaces/${userId}`, "");
      resolved = path.resolve(baseDir, relativePart.replace(/^\/+/, ""));
    } else {
      resolved = path.resolve(cleanPath);
    }
  } else {
    resolved = path.resolve(baseDir, cleanPath);
  }

  return resolved;
}
