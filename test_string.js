import "dotenv/config";
import { Telegraf } from "telegraf";

async function run() {
  const bot = new Telegraf(process.env.TELEGRAM_TOKEN_BOT);
  const userId = process.env.OWNER_ID;
  const menuUrl = "https://files.catbox.moe/nl09r6.jpg";
  
  try {
    console.log("Sending photo with string URL...");
    const start = Date.now();
    await bot.telegram.sendPhoto(userId, menuUrl);
    console.log("Success in", Date.now() - start, "ms");
  } catch (err) {
    console.error("Failed photo:", err.message);
  }
}
run();
