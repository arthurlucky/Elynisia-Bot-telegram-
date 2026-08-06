import { SearchWebTool } from "../tools/search_web.js";

import { listFilesTool } from "../tools/list_file.js";
import { readFileTool } from "../tools/read_file.js";
import { writeFileTool } from "../tools/write_file.js";
import { datetimeTool } from "../tools/datetime.js";
import { shellExecTool } from "../tools/shell_exec.js";
import projectManagerTool from "../tools/project_manager.js";
import { schedulerTool } from "../tools/scheduler.js";
import { FetchPageTool }from "../tools/fetch_page.js";

import groupManagerTool from "../tools/group_manager.js";

import searchTextTool from "../tools/search_text.js";

import findFolderTool from "../tools/find_folder.js";

import createFolderTool from "../tools/create_folder.js";
import deleteFolderTool from "../tools/delete_folder.js";

import zipCompressTool from "../tools/zip_compress.js";
import zipExtractTool from "../tools/zip_extract.js";

import { skillFactoryTool } from "../tools/skill_factory.js";
import backupManager from "../tools/backup_manager.js";
import { systemMonitorTool } from "../tools/system_monitor.js";
import { gitManagerTool } from "../tools/git_manager.js";
import knowledgeLibraryTool from "../tools/knowledge_library.js";
import { loadMCPTools } from "../tools/mcp_bridge.js";
import { swarmDelegateTool } from "../tools/swarm_delegate.js";
import { getUserProfileTool } from "../tools/get_user_profile.js";
import { sendMediaTool } from "../tools/send_media.js";

const tools = [
  SearchWebTool,
  FetchPageTool,

  listFilesTool,
  readFileTool,
  writeFileTool,

  searchTextTool,
  findFolderTool,

  createFolderTool,
  deleteFolderTool,

  zipCompressTool,
  zipExtractTool,
  
  datetimeTool,
  shellExecTool,
  projectManagerTool,
  schedulerTool,

  skillFactoryTool,
  backupManager,
  systemMonitorTool,
  gitManagerTool,
  
  groupManagerTool,
  knowledgeLibraryTool,
  swarmDelegateTool,
  getUserProfileTool,
  sendMediaTool
];

// ─────────────────────────────────────────────
// MCP external tools — spawn server stdio yang dikonfigurasi di
// mcp/mcp.config.json (mis. autocad-mcp) dan tambahkan tool-toolnya
// ke daftar tool EMORA. Top-level await aman karena project ini
// "type": "module" dan main.js sudah memakai top-level await juga.
// ─────────────────────────────────────────────
try {
  const mcpTools = await loadMCPTools();
  if (mcpTools.length) tools.push(...mcpTools);
} catch (err) {
  console.error(`  ⚠️  MCP bridge gagal dimuat: ${err.message}`);
}

export default tools;
