import "dotenv/config";
import { Telegraf, Markup } from "telegraf";
import { getGlobalDB } from "./core/db.js";

async function run() {
  const bot = new Telegraf(process.env.TELEGRAM_TOKEN_BOT);
  const userId = process.env.OWNER_ID;
  
  const db = await getGlobalDB();
  const menuRow = await db.get("SELECT value FROM settings WHERE key = 'menu_url'");
  const menuUrl = menuRow ? menuRow.value : null;
  console.log("menuUrl:", menuUrl);

  const helpText = "Test help caption";

  const buttons = Markup.inlineKeyboard([
    [Markup.button.callback("🎒 Inventory", "help_inv"), Markup.button.callback("⚔️ RPG", "help_rpg")]
  ]);

  try {
    if (menuUrl) {
      console.log("Sending photo with URL:", menuUrl);
      await bot.telegram.sendPhoto(userId, { url: menuUrl }, { caption: helpText, parse_mode: "Markdown", ...buttons });
      console.log("Photo sent successfully!");
    } else {
      console.log("No menuUrl set!");
    }
  } catch (err) {
    console.error("Error sending photo:", err.message);
  }
}
run();
