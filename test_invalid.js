import "dotenv/config";
import { Telegraf } from "telegraf";

async function run() {
  const bot = new Telegraf(process.env.TELEGRAM_TOKEN_BOT);
  const userId = process.env.OWNER_ID;
  const menuUrl = "halo"; // Invalid URL
  
  try {
    console.log("Sending photo with invalid URL...");
    await bot.telegram.sendPhoto(userId, { url: menuUrl });
    console.log("Success!");
  } catch (err) {
    console.error("Failed photo:", err.message);
  }
}
run();
