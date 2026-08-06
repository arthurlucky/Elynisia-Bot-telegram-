import "dotenv/config";
import { Telegraf } from "telegraf";

async function run() {
  const bot = new Telegraf(process.env.TELEGRAM_TOKEN_BOT);
  const userId = process.env.OWNER_ID;
  
  let helpText = "A".repeat(1025); // Exceeds 1024 characters
  const menuUrl = "https://files.catbox.moe/nl09r6.jpg";

  try {
    console.log("Sending photo with long caption...");
    await bot.telegram.sendPhoto(userId, menuUrl, { caption: helpText, parse_mode: "Markdown" });
    console.log("Success!");
  } catch (err) {
    console.error("Failed photo:", err.message);
    try {
      console.log("Falling back to text...");
      await bot.telegram.sendMessage(userId, helpText, { parse_mode: "Markdown" });
      console.log("Fallback success!");
    } catch (e) {
      console.error("Fallback failed:", e.message);
    }
  }
}
run();
