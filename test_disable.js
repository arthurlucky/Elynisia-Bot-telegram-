import "dotenv/config";
import { pluginManager } from "./core/pluginManager.js";
import { getGlobalDB } from "./core/db.js";

async function run() {
  await getGlobalDB();
  const userId = process.env.OWNER_ID || process.env.TELEGRAM_ALLOWED_IDS?.split(",")[0];
  console.log("UserID:", userId);
  await pluginManager.initUserPlugins(userId);
  const plugins = pluginManager.getUserPluginsList(userId);
  console.log("Plugins:", plugins.map(p => p.id));
  
  if (plugins.length > 0) {
    const p = plugins[0].id;
    console.log("Status:", plugins[0].status);
    const res = await pluginManager.disablePlugin(userId, p);
    console.log("Disable result:", res);
  }
}

run().catch(console.error);
