import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

export const gitManagerTool = new DynamicStructuredTool({
  name: "git_manager",
  description: "Manage Git version control: check status, add files, commit changes, and push to remote repository.",
  schema: z.object({
    action: z.enum(["status", "add", "commit", "push", "log", "branch"]).describe("The git action to perform"),
    files: z.array(z.string()).optional().describe("List of files to add (use ['.'] for all files)"),
    message: z.string().optional().describe("Commit message for the 'commit' action"),
    branch: z.string().optional().describe("Branch name for the 'push' or 'branch' action"),
  }),
  func: async ({ action, files, message, branch }) => {
    try {
      let command = "";

      switch (action) {
        case "status":
          command = "git status --short";
          break;
        case "add":
          if (!files || files.length === 0) {
            return "Error: Please specify files to add.";
          }
          command = `git add ${files.join(" ")}`;
          break;
        case "commit":
          if (!message) {
            return "Error: Please provide a commit message.";
          }
          // BUGFIX: pesan commit yang mengandung tanda kutip ganda dulu
          // merusak syntax shell (mis. message berisi `fix: handle "edge case"`
          // bikin command jadi `git commit -m "fix: handle "edge case""`,
          // yang dipotong shell jadi argumen acak). Escape setiap `"` dan `\`.
          command = `git commit -m "${message.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
          break;
        case "push":
          const targetBranch = branch || "main";
          command = `git push origin ${targetBranch}`;
          break;
        case "log":
          command = "git log -n 5 --oneline";
          break;
        case "branch":
          command = branch ? `git branch ${branch}` : "git branch";
          break;
        default:
          return "Error: Invalid action.";
      }

      const { stdout, stderr } = await execPromise(command);
      
      if (stderr && !stdout) {
        return `Git Error: ${stderr}`;
      }
      
      return stdout || "Command executed successfully (no output).";
    } catch (error) {
      return `System Error: ${error.message}`;
    }
  },
});
