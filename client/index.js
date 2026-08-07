import { getGlobalDB } from "./core/db.js";
import { bot, startBot } from "./gateway/telegram.js";
import { scheduler } from "../server/core/scheduler.js";

// ANSI Color Tokens
const C = { reset: "\x1b[0m", bold: "\x1b[1m", cyan: "\x1b[36m", green: "\x1b[32m", blue: "\x1b[34m", yellow: "\x1b[33m" };

export async function initClient() {
  try {
    console.log(`${C.cyan}[1/2] ⚡ Inisialisasi Global SQLite Database...${C.reset}`);
    await getGlobalDB();

    console.log(`${C.cyan}[2/2] 🌐 Mengaktifkan Telegram Gateway...${C.reset}`);
    if (process.env.TELEGRAM_TOKEN_BOT) {
      await startBot();
      
      // Jika server jalan bersama client (Global), kita override scheduler dengan bot
      if (process.env.APP_MODE === "global") {
        scheduler.start(bot);
      }
      
      console.log(`\n${C.green}${C.bold}✅ [CLIENT MODULE] Telegram Gateway terhubung!${C.reset}`);
    } else {
      console.log(`\n${C.yellow}⚠️ [CLIENT MODULE] TELEGRAM_TOKEN_BOT kosong. Bot tidak dijalankan.${C.reset}`);
    }
  } catch (err) {
    console.error(`❌ [CLIENT MODULE] Error: ${err.message}`);
    console.error(err);
  }
}

initClient();
