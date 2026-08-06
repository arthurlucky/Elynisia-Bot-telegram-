import "dotenv/config";
import { Telegraf } from "telegraf";

const bot = new Telegraf(process.env.TELEGRAM_TOKEN_BOT);
const userId = process.env.OWNER_ID;

const adminCmdsText = `\n🛠 *Admin Commands:*\n` +
  `• \`/admin\` - Panel admin\n` +
  `• \`/setmenuurl <url>\` - Atur gambar menu /help\n` +
  `• \`/plugin disable/enable/reload/uninstall\`\n`;

const pluginCmdsText = `\n🧩 *Plugin Commands Anda:*\n` + 
  `• \`/ponytail\` - Switch ponytail intensity level (lite/full/ultra/off)\n`;

let helpText = 
  `🤖 *ELYNISIA AI ASSISTANT*\n\n` +
  `💬 *Utama:*\n` +
  `• \`/newchat\`, \`/listchat\`, \`/switchchat\`, \`/deletechat\`\n` +
  `• \`/inv\`, \`/shop\`, \`/barter\`, \`/convert\`, \`/status\`\n\n` +
  `🎮 *Game & Ekspedisi:*\n` +
  `• \`/hero\`, \`/gacha\`, \`/skill\`, \`/tower\`, \`/pvp\`, \`/spin\`, \`/dice\`\n\n` +
  `🧩 *Plugin & Workspace:*\n` +
  `• \`/plugin list\` - Daftar plugin terpasang\n` +
  `• \`/plugin install <url-github>\` - Instal plugin baru\n` +
  `• \`/artifact list\` - Daftar file/hasil AI\n\n` +
  `💻 *Sistem & Shell:*\n` +
  `• \`$\` \`<command>\` - Shell command privat (cth: \`$ls\`)\n` +
  `• \`/constatus\`, \`/mcp\`, \`/runtime\`, \`/btw\`\n` +
  `• \`/reset\` - **[DANGER]** Reset akun\n` +
  adminCmdsText +
  pluginCmdsText +
  `\nKetik pesan langsung untuk berbicara dengan saya!`;

bot.telegram.sendMessage(userId, helpText, { parse_mode: "Markdown" })
  .then(() => console.log("Sent successfully!"))
  .catch(err => console.error("Error sending markdown:", err.message));
