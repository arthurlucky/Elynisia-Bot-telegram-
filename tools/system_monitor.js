import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

export const systemMonitorTool = new DynamicStructuredTool({
  name: "system_monitor",
  description: "Mengecek penggunaan resource sistem seperti CPU, Memory, dan Disk space secara ringkas.",
  schema: z.object({
    type: z.enum(["all", "cpu", "mem", "disk"]).describe("Tipe resource yang ingin dicek. 'all' untuk semua."),
  }),
  func: async ({ type }) => {
    try {
      let command = "";
      if (type === "cpu") {
        command = "top -bn1 | grep 'Cpu(s)'";
      } else if (type === "mem") {
        command = "free -h";
      } else if (type === "disk") {
        command = "df -h /";
      } else {
        command = "top -bn1 | grep 'Cpu(s)' && echo '---' && free -h && echo '---' && df -h /";
      }

      const { stdout, stderr } = await execPromise(command);
      if (stderr) return `Error: ${stderr}`;
      return stdout || "No data available.";
    } catch (error) {
      return `Failed to execute system monitor: ${error.message}`;
    }
  },
});
