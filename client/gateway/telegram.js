import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { Telegraf, Markup } from "telegraf";
import { getUserDB, getGlobalDB } from "../core/db.js";
import { ask } from "../../server/core/agent.js";
import { registry } from "../../server/core/registry.js";
import { scheduler } from "../../server/core/scheduler.js";
import { taskManager } from "../../server/core/taskManager.js";
import { SkillsManager } from "../../server/core/skills_manager.js";
import TowerManager from "../../server/core/tower_manager.js";
import BattleEngine from "../../server/core/battle_engine.js";
import ItemGenerator from "../../server/core/item_generator.js";
import HeroManager from "../../server/core/hero_manager.js";
import HeroGenerator from "../../server/core/hero_generator.js";
import LivingWorldEngine from "../../server/core/living_world.js";
import PvpEngine from "../../server/core/pvp_engine.js";
import CasinoEngine from "../../server/core/casino_engine.js";
import pluginManager from "../../server/core/pluginManager.js";
import ArtifactManager from "../../server/core/artifact_manager.js";
import MarketplaceEngine from "../../server/core/marketplace_engine.js";
import {
  getUserWorkspaceRoot,
  getUserCwd,
  setUserCwd,
  resetUserCwd,
  getContainerStatus,
  isDiskFull,
} from "../utils/container.js";
import {
  getUserRole,
  setUserRole,
  setCustomRoleLimit,
  checkPrivacyAccess,
  getUserLimit,
  setUserLimit,
} from "../core/permissions.js";
import {
  getOrCreateUserEconomy,
  saveUserEconomy,
  getUserInventory,
  buySystemTokens,
  buyShopItem,
  sellItemInShop,
  convertUserCurrency,
  openBarterOffer,
  cancelBarterOffer,
  proposeBarterBid,
  acceptBarterDeal,
  declineBarterDeal,
  giveItemToUser,
  giveMoneyToUser,
  removeItemFromUser
} from "../core/economy.js";

const token = process.env.TELEGRAM_TOKEN_BOT;
if (!token) {
  console.error("CRITICAL: TELEGRAM_TOKEN_BOT env variable is missing!");
}

export const bot = token ? new Telegraf(token) : null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Track conversational wizard states: userId -> { state, data... }
const userStates = new Map();

// Track active chats in memory: userId -> activeChatId
const activeChats = new Map();

// Track running AI turns per user to prevent overlapping/spam responses
const userTurns = new Map(); // userId -> boolean

// Process start time for /runtime
const startTime = Date.now();

// Helper to format duration
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
}

/**
 * Gets or creates the active chat session for a user.
 */
async function getOrSetActiveChat(userId) {
  const db = await getUserDB(userId);
  let chatId = activeChats.get(String(userId));

  if (chatId) {
    // Verify it still exists in DB
    const exists = await db.get("SELECT id FROM chats WHERE id = ?", [chatId]);
    if (exists) return chatId;
  }

  // Load last active chat
  const lastChat = await db.get("SELECT id FROM chats ORDER BY id DESC LIMIT 1");
  if (lastChat) {
    chatId = lastChat.id;
  } else {
    // Create first chat
    const res = await db.run("INSERT INTO chats (title, created_at) VALUES (?, ?)", [
      "Chat Default",
      Date.now(),
    ]);
    chatId = res.lastID;
  }

  activeChats.set(String(userId), chatId);
  return chatId;
}

// Start auto sub-agent item generator & Living World Engine (every 5-15 mins)
try {
  ItemGenerator.startAutoGenerator();
  LivingWorldEngine.startLivingWorldEngine();
} catch (e) {}

if (bot) {
  // 1. Hook for Privacy Access Checks
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    const allowed = await checkPrivacyAccess(userId);
    if (!allowed) {
      // If it's a private chat, inform the user.
      if (ctx.chat.type === "private") {
        await ctx.reply("🔒 *Privacy Mode ON*: Bot ini dikonfigurasi hanya untuk Admin & Owner.");
      }
      return;
    }
    await next();
  });

  // 2. Commands Handler

  // /start
  bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const role = await getUserRole(userId);
    await ctx.reply(
      `✨ *Selamat datang di Elynisia Bot!* ✨\n` +
        `Anda terdaftar sebagai: *${role.toUpperCase()}*\n\n` +
        `Gunakan perintah-perintah berikut untuk interaksi:\n` +
        `• /newchat - Membuat sesi percakapan baru\n` +
        `• /listchat - Melihat daftar percakapan Anda\n` +
        `• /status - Menampilkan status identitas dan level\n` +
        `• /runtime - Menampilkan waktu aktif bot\n` +
        `• /btw - Melihat antrean tugas Anda\n` +
        `• /mcp - Menampilkan status MCP Server\n` +
        `• Kirim pesan langsung untuk mengobrol dengan AI!`
    );
  });

  // /help
  bot.help(async (ctx) => {
    const userId = ctx.from.id;
    const role = await getUserRole(userId);
    const isStaff = role === "owner" || role === "admin";

    // Ambil command spesifik plugin untuk user ini
    const userPluginCmds = registry.getUserCommands(userId);
    let pluginCmdsText = "";
    if (userPluginCmds.length > 0) {
      pluginCmdsText = `\n🧩 𝗣𝗟𝗨𝗚𝗜𝗡 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦\n` + 
        userPluginCmds.map(c => `├⌑ ⚙️ \`/${c.name}\` - ${c.desc}`).join("\n") + "\n";
    }

    let adminCmdsText = "";
    if (isStaff) {
      adminCmdsText = `\n🛠 𝗔𝗗𝗠𝗜𝗡 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦\n` +
        `├⌑ 🛡️ \`/admin\` - Panel admin\n` +
        `├⌑ 🖼️ \`/setmenuurl\` - Atur gambar menu\n` +
        `╰⌑ 🔌 \`/plugin disable/enable/reload\`\n`;
    }

    let helpText = 
      `📜 𝗘𝗟𝗬𝗡𝗜𝗦𝗜𝗔 𝗔𝗜 𝗔𝗦𝗦𝗜𝗦𝗧𝗔𝗡𝗧\n` +
      `━━━━━━━━━━━━━━━━━━━━━⨳\n` +
      `🪪 𝗜𝗗𝗘𝗡𝗧𝗜𝗧𝗔𝗦 𝗣𝗘𝗡𝗚𝗚𝗨𝗡𝗔\n` +
      `├⌑ 👤 𝗡𝗮𝗺𝗮 : ${ctx.from.first_name || "User"}\n` +
      `╰⌑ 🆔 𝗜𝗗 : ${userId}\n\n` +
      `💬 𝗠𝗘𝗡𝗨 𝗨𝗧𝗔𝗠𝗔\n` +
      `├⌑ 🤖 \`/newchat\`, \`/listchat\`, \`/switchchat\`\n` +
      `╰⌑ 🎒 \`/inv\`, \`/shop\`, \`/barter\`, \`/status\`\n\n` +
      `🎮 𝗚𝗔𝗠𝗘 & 𝗘𝗞𝗦𝗣𝗘𝗗𝗜𝗦𝗜\n` +
      `├⌑ ⚔️ \`/hero\`, \`/tower\`, \`/pvp\`\n` +
      `╰⌑ 🎲 \`/gacha\`, \`/skill\`, \`/spin\`, \`/dice\`\n\n` +
      `🧩 𝗣𝗟𝗨𝗚𝗜𝗡 & 𝗪𝗢𝗥𝗞𝗦𝗣𝗔𝗖𝗘\n` +
      `├⌑ 📦 \`/plugin list\` - Daftar plugin\n` +
      `├⌑ 📥 \`/plugin install <url>\` - Instal baru\n` +
      `╰⌑ 📁 \`/artifact list\` - Daftar file AI\n\n` +
      `💻 𝗦𝗜𝗦𝗧𝗘𝗠 & 𝗦𝗛𝗘𝗟𝗟\n` +
      `├⌑ 🖥️ \`$\` \`<cmd>\` - Shell privat (cth: \`$ls\`)\n` +
      `├⌑ 📊 \`/constatus\`, \`/btw\`, \`/mcp\`\n` +
      `├⌑ 📋 \`/plan <tugas>\` - Buat blueprint proyek\n` +
      `╰⌑ ⚠️ \`/reset\` - Reset akun\n` +
      adminCmdsText +
      pluginCmdsText +
      `\n📨 _Ketik pesan langsung untuk berbicara dengan saya!_`;

    const db = await getGlobalDB();
    const menuRow = await db.get("SELECT val FROM settings WHERE key = 'menu_url'");
    const menuUrl = menuRow ? menuRow.val : null;

    const buttons = Markup.inlineKeyboard([
      [Markup.button.callback("🎒 Inventory", "help_inv"), Markup.button.callback("⚔️ RPG", "help_rpg")],
      [Markup.button.callback("🏪 Shop", "help_shop"), Markup.button.callback("🧩 Plugins", "help_plugins")],
      [Markup.button.callback("💻 System", "help_sys")]
    ]);

    try {
      if (menuUrl) {
        let photoSource = menuUrl;
        if (menuUrl.startsWith("/") && fs.existsSync(menuUrl)) {
          photoSource = { source: menuUrl };
        }
        await ctx.replyWithPhoto(photoSource, { caption: helpText, parse_mode: "Markdown", ...buttons });
      } else {
        await ctx.reply(helpText, { parse_mode: "Markdown", ...buttons });
      }
    } catch (err) {
      console.error("[Telegram] Error in /help command:", err);
      try {
        await ctx.reply(helpText, { parse_mode: "Markdown", ...buttons });
      } catch (e) {
        console.error("[Telegram] Fallback reply also failed:", e);
        await ctx.reply("Gagal menampilkan menu bantuan. Silakan lapor ke admin.");
      }
    }
  });

  // Help Callbacks
  const helpMenus = {
    "help_inv": "🎒 *INVENTORY & EKONOMI*\n• `/inv` - Buka inventory\n• `/convert` - Tukar uang\n• `/barter` - Tukar barang",
    "help_rpg": "⚔️ *RPG COMMANDS*\n• `/hero` - Daftar hero\n• `/gacha` - Gacha hero\n• `/tower` - Ekspedisi\n• `/pvp` - Arena PvP",
    "help_shop": "🏪 *SHOP COMMANDS*\n• `/shop` - Beli item sistem\n• `/shop buy <id>` - Beli item pemain\n• `/shop sell ...` - Jual item",
    "help_plugins": "🧩 *PLUGIN COMMANDS*\n• `/plugin list` - Lihat plugin\n• `/plugin install <url>`\n• `/plugin disable <id>`\n• `/plugin enable <id>`",
    "help_sys": "💻 *SYSTEM COMMANDS*\n• `$<cmd>` - Jalankan command Linux\n• `/constatus` - RAM/Disk\n• `/btw` - Status agent\n• `/mcp` - MCP server"
  };

  for (const [key, text] of Object.entries(helpMenus)) {
    bot.action(key, async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.reply(text, { parse_mode: "Markdown" });
    });
  }

  bot.command("mode", async (ctx) => {
    const userId = ctx.from.id;
    const arg = (ctx.payload || "").trim().toLowerCase();
    if (!["streaming", "normal"].includes(arg)) {
      return ctx.reply("Gunakan: `/mode streaming` atau `/mode normal`", { parse_mode: "Markdown" });
    }
    const db = await getUserDB(userId);
    await db.run("INSERT OR REPLACE INTO profile_memory (key, val, updated_at) VALUES (?, ?, ?)", ["chat_mode", arg, Date.now()]);
    return ctx.reply(`✅ Mode chat diatur ke: *${arg}*`, { parse_mode: "Markdown" });
  });

  bot.command("agent", async (ctx) => {
    const userId = ctx.from.id;
    const arg = (ctx.payload || "").trim().toLowerCase();
    if (!["fast", "normal", "deep"].includes(arg)) {
      return ctx.reply("Gunakan: `/agent fast|normal|deep`", { parse_mode: "Markdown" });
    }
    const db = await getUserDB(userId);
    await db.run("INSERT OR REPLACE INTO profile_memory (key, val, updated_at) VALUES (?, ?, ?)", ["agent_mode", arg, Date.now()]);
    return ctx.reply(`✅ Mode agent diatur ke: *${arg}*`, { parse_mode: "Markdown" });
  });

  bot.command("remember", async (ctx) => {
    const userId = ctx.from.id;
    const info = (ctx.payload || "").trim();
    if (!info) return ctx.reply("Gunakan: `/remember <informasi yang ingin diingat>`");
    
    const db = await getUserDB(userId);
    const id = Date.now().toString();
    await db.run("INSERT INTO profile_memory (key, val, updated_at) VALUES (?, ?, ?)", [`fact_${id}`, info, Date.now()]);
    return ctx.reply(`✅ Siap! Aku akan mengingat: "${info}"`);
  });

  bot.command("forget", async (ctx) => {
    const userId = ctx.from.id;
    const db = await getUserDB(userId);
    await db.run("DELETE FROM profile_memory WHERE key LIKE 'fact_%'");
    return ctx.reply("✅ Semua ingatan tentang fakta pengguna telah dihapus!");
  });

  bot.command("remind", async (ctx) => {
    const userId = ctx.from.id;
    const payload = (ctx.payload || "").trim();
    if (!payload.includes(" ")) {
      return ctx.reply("Gunakan: `/remind <menit_dari_sekarang> <pesan yang ingin diingatkan>`\nContoh: `/remind 5 Cek server`", { parse_mode: "Markdown" });
    }
    const parts = payload.split(" ");
    const minutes = parseInt(parts[0]);
    if (isNaN(minutes) || minutes <= 0) return ctx.reply("❌ Waktu harus berupa angka (menit) positif.");
    const message = parts.slice(1).join(" ");
    
    setTimeout(() => {
      bot.telegram.sendMessage(ctx.chat.id, `⏰ *REMINDER:* ${message}`, { parse_mode: "Markdown" })
        .catch(() => {});
    }, minutes * 60 * 1000);
    
    return ctx.reply(`✅ Siap! Aku akan mengingatkanmu tentang "${message}" dalam ${minutes} menit.`);
  });

  bot.command("panel", async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || "Player";
    
    try {
      const waitMsg = await ctx.reply("⏳ *Generating visual dashboard...*", { parse_mode: "Markdown" });
      
      const { generateDashboardImage } = await import("../core/panel_renderer.js");
      const imagePath = await generateDashboardImage(userId, username);
      
      await ctx.replyWithPhoto({ source: imagePath }, {
        caption: "📊 *Elynisia Visual Dashboard*\n\nBerikut adalah status terkini kamu.",
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎒 Inventory", callback_data: "help_inv" }, { text: "⚔️ RPG", callback_data: "help_rpg" }],
            [{ text: "🔄 Refresh", callback_data: "refresh_panel" }]
          ]
        }
      });
      
      // Hapus pesan loading
      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
    } catch (err) {
      console.error("[Telegram] Error generating panel:", err);
      return ctx.reply("❌ Gagal merender visual dashboard. Pastikan dependensi jimp sudah terinstall.");
    }
  });

  bot.action("refresh_panel", async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || "Player";
    
    try {
      const { generateDashboardImage } = await import("../core/panel_renderer.js");
      const imagePath = await generateDashboardImage(userId, username);
      
      // Update image
      await ctx.editMessageMedia(
        { type: "photo", media: { source: imagePath }, caption: "📊 *Elynisia Visual Dashboard*\n\nBerikut adalah status terkini kamu. (Refreshed)", parse_mode: "Markdown" },
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🎒 Inventory", callback_data: "help_inv" }, { text: "⚔️ RPG", callback_data: "help_rpg" }],
              [{ text: "🔄 Refresh", callback_data: "refresh_panel" }]
            ]
          }
        }
      );
    } catch (err) {
      await ctx.answerCbQuery("Gagal merender ulang panel.", { show_alert: true });
    }
  });

  bot.command("topup", async (ctx) => {
    const userId = ctx.from.id;
    const amountStr = (ctx.payload || "").trim();
    const amount = parseInt(amountStr);
    
    if (isNaN(amount) || amount < 1000) {
      return ctx.reply("❌ Silakan masukkan nominal topup (minimal 1000).\nContoh: `/topup 10000`", { parse_mode: "Markdown" });
    }

    try {
      const waitMsg = await ctx.reply("⏳ *Sedang membuat tiket pembayaran QRIS...*", { parse_mode: "Markdown" });
      const { createQrisDeposit, monitorDeposit } = await import("../core/payment_gateway.js");
      
      const res = await createQrisDeposit(amount);
      
      if (res && res.data && res.data.depositId) {
        const depositId = res.data.depositId;
        const qrisUrl = res.data.qris_url || res.data.qr_code || res.data.qr_string; // Menyesuaikan dengan kembalian API
        
        let msg = `✅ *TIKET TOPUP BERHASIL DIBUAT*\n\n`;
        msg += `Nominal: *Rp${amount.toLocaleString()}*\n`;
        msg += `Deposit ID: \`${depositId}\`\n\n`;
        msg += `Silakan scan QRIS atau bayar menggunakan data yang diberikan sistem. Saldo *${amount.toLocaleString()} Gems* akan masuk secara otomatis setelah pembayaran sukses. (Waktu tunggu 10 menit)`;
        
        // Memulai polling status di background
        monitorDeposit(userId, depositId, amount, bot, ctx.chat.id);
        
        // Jika ada URL/gambar QRIS
        if (qrisUrl && qrisUrl.startsWith("http")) {
          await ctx.replyWithPhoto(qrisUrl, { caption: msg, parse_mode: "Markdown" });
          await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
        } else {
          // Jika API mengembalikan string base64 / text biasa, tambahkan ke pesan
          if (qrisUrl) msg += `\n\nQR Data:\n\`${qrisUrl}\``;
          await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, undefined, msg, { parse_mode: "Markdown" });
        }
      } else {
        throw new Error("Gagal mendapatkan deposit ID dari API.");
      }
    } catch (err) {
      console.error("[Telegram] Error /topup:", err);
      return ctx.reply("❌ Terjadi kesalahan saat memproses topup: " + err.message);
    }
  });

  // /setmenuurl
  bot.command("setmenuurl", async (ctx) => {
    const userId = ctx.from.id;
    const role = await getUserRole(userId);
    if (role !== "owner" && role !== "admin") return ctx.reply("❌ Khusus Admin/Owner.");
    const url = (ctx.payload || "").trim();
    if (!url) return ctx.reply("Gunakan: `/setmenuurl <url>`", { parse_mode: "Markdown" });
    
    try {
      const os = await import("os");
      const downloadDir = path.join(os.homedir(), "storage", "downloads");
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      }
      const filePath = path.join(downloadDir, "elynisia_menu.jpg");
      
      const replyMsg = await ctx.reply("⏳ Mendownload gambar...");
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(filePath, Buffer.from(buffer));
      
      const db = await getGlobalDB();
      await db.run("INSERT OR REPLACE INTO settings (key, val) VALUES (?, ?)", ["menu_url", filePath]);
      return ctx.telegram.editMessageText(ctx.chat.id, replyMsg.message_id, undefined, "✅ Gambar menu berhasil diunduh ke folder download dan diatur! Silakan ketik /help.");
    } catch (err) {
      return ctx.reply(`❌ Gagal mengatur menu: ${err.message}`);
    }
  });

  // /reset command
  bot.command("reset", async (ctx) => {
    const userId = ctx.from.id;
    try {
      const { getUserWorkspaceRoot } = await import("../utils/container.js");
      const root = getUserWorkspaceRoot(userId);
      const fs = await import("fs");
      
      if (fs.existsSync(root)) {
        fs.rmSync(root, { recursive: true, force: true });
      }
      
      const dbDir = `/data/data/com.termux/files/home/Elynisia/memory/${userId}`;
      if (fs.existsSync(dbDir)) {
        fs.rmSync(dbDir, { recursive: true, force: true });
      }

      await ctx.reply("💥 *RESET SELESAI*\nSeluruh database, progress, plugin, dan workspace Anda telah dihapus secara permanen.", { parse_mode: "Markdown" });
    } catch (err) {
      await ctx.reply(`❌ *Gagal melakukan reset:* ${err.message}`, { parse_mode: "Markdown" });
    }
  });

  // /constatus
  bot.command("constatus", async (ctx) => {
    const userId = ctx.from.id;
    try {
      const status = await getContainerStatus(userId);
      await ctx.reply(status, { parse_mode: "Markdown" });
    } catch (err) {
      await ctx.reply(`❌ Gagal mendapatkan status container: ${err.message}`);
    }
  });

  // /status (Komprehensif RPG & Player Status)
  bot.command("status", async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name || String(userId);

    try {
      const economy = await getOrCreateUserEconomy(userId, username);
      const state = await TowerManager.getUserState(userId);
      const room = TowerManager.getRoomInfo(state.floor, state.room_idx);
      const skills = await SkillsManager.getUserSkills(userId);
      const equippedSkills = skills.filter(s => s.is_equipped === 1).map(s => s.name).join(", ") || "Tidak ada";

      const statusText = 
        `═══════ 👤 PLAYER STATUS ═══════\n` +
        `• *Nama:* @${username}\n` +
        `• *Level:* Lv. ${economy.level} (EXP: ${economy.exp}/${economy.level * 100})\n` +
        `• *Class:* Ksatria Pemula\n` +
        `• *Rune:* Non-active\n\n` +
        `❤️ *HP:* ${state.hp}/${state.max_hp}\n` +
        `💧 *Mana:* ${state.mana}/${state.max_mana}\n` +
        `⚔️ *Skill Aktif:* ${equippedSkills}\n\n` +
        `🪙 *Gold:* ${economy.gold} | 🥈 *Silver:* ${economy.silver} | 💎 *Gems:* ${economy.gems}\n` +
        `⚡ *Token:* ${economy.tokens}\n\n` +
        `🗼 *Tower Floor:* ${state.floor} (Room ${state.room_idx + 1})\n` +
        `🔑 *Room ID:* \`${room.roomId}\`\n` +
        `🎯 *Quest:* ${room.questTitle} (${state.quest_progress}/${room.targetKills})\n` +
        `👥 *Party:* Solo\n` +
        `═════════════════════════════`;

      await ctx.reply(statusText, { parse_mode: "Markdown" });
    } catch (err) {
      await ctx.reply(`❌ Gagal mengambil status: ${err.message}`);
    }
  });

  // /runtime
  bot.command("runtime", async (ctx) => {
    const elapsed = Date.now() - startTime;
    await ctx.reply(`⏱ *Bot Runtime:* \`${formatDuration(elapsed)}\``, {
      parse_mode: "Markdown",
    });
  });

  // /privacy
  bot.command("privacy", async (ctx) => {
    const userId = ctx.from.id;
    const role = await getUserRole(userId);
    if (role !== "owner" && role !== "admin") {
      return ctx.reply("❌ Perintah ini hanya bisa digunakan oleh Owner atau Admin.");
    }

    const arg = ctx.payload.trim().toLowerCase();
    if (arg !== "on" && arg !== "off") {
      return ctx.reply("Format salah. Gunakan: `/privacy on` atau `/privacy off`", {
        parse_mode: "Markdown",
      });
    }

    const db = await getGlobalDB();
    await db.run("INSERT OR REPLACE INTO settings (key, val) VALUES (?, ?)", ["privacy", arg]);
    await ctx.reply(`🔒 *Privacy Mode* berhasil diubah ke: *${arg.toUpperCase()}*`);
  });

  // /setlimit
  bot.command("setlimit", async (ctx) => {
    const userId = ctx.from.id;
    const role = await getUserRole(userId);
    if (role !== "owner" && role !== "admin") {
      return ctx.reply("❌ Perintah ini hanya bisa digunakan oleh Owner atau Admin.");
    }

    // Expects: /setlimit <userId> <limit_value> OR /setlimit <default_limit>
    const args = ctx.payload.trim().split(/\s+/);
    if (args.length === 0 || !args[0]) {
      return ctx.reply("Format: `/setlimit <limit_value>` atau `/setlimit <userId> <limit_value>`", {
        parse_mode: "Markdown",
      });
    }

    const db = await getGlobalDB();

    if (args.length === 1) {
      const limitVal = args[0];
      await db.run("INSERT OR REPLACE INTO settings (key, val) VALUES (?, ?)", ["default_limit", limitVal]);
      return ctx.reply(`✅ *Limit default* berhasil diubah ke: *${limitVal}*`);
    } else {
      const targetUser = args[0];
      const limitVal = args[1];
      await setUserLimit(targetUser, limitVal);
      return ctx.reply(`✅ *Limit User* \`${targetUser}\` berhasil diubah ke: *${limitVal}*`, {
        parse_mode: "Markdown",
      });
    }
  });

  // /customrole
  bot.command("customrole", async (ctx) => {
    const userId = ctx.from.id;
    const role = await getUserRole(userId);
    if (role !== "owner" && role !== "admin") {
      return ctx.reply("❌ Perintah ini hanya bisa digunakan oleh Owner atau Admin.");
    }

    userStates.set(String(userId), { state: "waiting_role_name" });
    await ctx.reply("nama role?");
  });

  // /newchat
  bot.command("newchat", async (ctx) => {
    const userId = ctx.from.id;
    const db = await getUserDB(userId);

    const title = `Chat ${new Date().toLocaleTimeString()}`;
    const res = await db.run("INSERT INTO chats (title, created_at) VALUES (?, ?)", [
      title,
      Date.now(),
    ]);

    const chatId = res.lastID;
    activeChats.set(String(userId), chatId);

    await ctx.reply(`🆕 *Sesi Percakapan Baru Dimulai!*\n• ID Sesi: \`${chatId}\`\n• Judul: \`${title}\``, {
      parse_mode: "Markdown",
    });
  });

  // /listchat
  bot.command("listchat", async (ctx) => {
    const userId = ctx.from.id;
    const db = await getUserDB(userId);
    const chats = await db.all("SELECT * FROM chats ORDER BY id DESC LIMIT 10");

    if (chats.length === 0) {
      return ctx.reply("Anda belum memiliki percakapan. Kirim pesan untuk memulai!");
    }

    const activeId = await getOrSetActiveChat(userId);

    const listStr = chats
      .map((c) => {
        const marker = c.id === activeId ? "⭐️ " : "• ";
        return `${marker}ID: \`${c.id}\` - *${c.title}*`;
      })
      .join("\n");

    await ctx.reply(`💬 *DAFTAR PERCAKAPAN ANDA*\n━━━━━━━━━━━━━━━━━━━━\n${listStr}\n\n💡 Ketik \`/switchchat <id>\` untuk berpindah percakapan.`, {
      parse_mode: "Markdown",
    });
  });

  // /switchchat
  bot.command("switchchat", async (ctx) => {
    const userId = ctx.from.id;
    const chatId = parseInt(ctx.payload.trim());

    if (isNaN(chatId)) {
      return ctx.reply("Format salah. Gunakan: `/switchchat <id>`", { parse_mode: "Markdown" });
    }

    const db = await getUserDB(userId);
    const exists = await db.get("SELECT id FROM chats WHERE id = ?", [chatId]);
    if (!exists) {
      return ctx.reply("❌ Sesi chat tidak ditemukan.");
    }

    activeChats.set(String(userId), chatId);
    await ctx.reply(`✅ Berhasil pindah ke sesi chat ID: \`${chatId}\``, {
      parse_mode: "Markdown",
    });
  });

  // /deletechat
  bot.command("deletechat", async (ctx) => {
    const userId = ctx.from.id;
    const chatId = parseInt(ctx.payload.trim());

    if (isNaN(chatId)) {
      return ctx.reply("Format salah. Gunakan: `/deletechat <id>`", { parse_mode: "Markdown" });
    }

    const db = await getUserDB(userId);
    const exists = await db.get("SELECT id FROM chats WHERE id = ?", [chatId]);
    if (!exists) {
      return ctx.reply("❌ Sesi chat tidak ditemukan.");
    }

    // Delete chat and its messages
    await db.run("DELETE FROM chats WHERE id = ?", [chatId]);
    await db.run("DELETE FROM messages WHERE chat_id = ?", [chatId]);

    // If deleted chat was active, invalidate cache
    if (activeChats.get(String(userId)) === chatId) {
      activeChats.delete(String(userId));
    }

    const newActive = await getOrSetActiveChat(userId);
    await ctx.reply(`🗑 Sesi chat ID \`${chatId}\` telah dihapus. Sesi aktif dipindahkan ke ID \`${newActive}\`.`, {
      parse_mode: "Markdown",
    });
  });

  // /btw
  bot.command("btw", async (ctx) => {
    const userId = ctx.from.id;
    const tasks = taskManager.getUserActiveTasks(userId);

    if (tasks.length === 0) {
      return ctx.reply("Tidak ada tugas (Main Agent/Subagent) di antrean saat ini.");
    }

    const queueStr = tasks
      .map(
        (q) =>
          `• *[${q.type}]* Job #${q.taskId}\n` +
          `  Tugas: "${q.prompt.substring(0, 40)}..."\n` +
          `  Status: \`${q.status}\`\n` +
          `  Durasi: ${Math.floor((Date.now() - q.startedAt)/1000)} detik`
      )
      .join("\n\n");

    await ctx.reply(`📋 *ANTREAN TUGAS AKTIF*\n━━━━━━━━━━━━━━━━━━━━\n${queueStr}`, {
      parse_mode: "Markdown",
    });
  });

  // /plan
  bot.command("plan", async (ctx) => {
    const userId = ctx.from.id;
    const prompt = (ctx.payload || "").trim();
    if (!prompt) {
      return ctx.reply("Gunakan: `/plan <deskripsi tugas>`\nContoh: `/plan buatkan bot discord sederhana menggunakan nodejs`", { parse_mode: "Markdown" });
    }
    
    // Inject planning instruction
    const planInstruction = `[PLANNING MODE]\nUser memintamu untuk membuat Rencana Implementasi (Roadmap) teknis untuk tugas berikut:\n"${prompt}"\n\nTugasmu:\n1. Pikirkan dan buat rencana implementasi langkah demi langkah.\n2. Tulis rencana tersebut ke dalam file Markdown (contoh: plan.md) di workspace user menggunakan tool write_file (jangan gunakan send_media, simpan saja di disk).\n3. Beritahu user bahwa rencana telah selesai dibuat.`;
    
    const chatId = await getOrSetActiveChat(userId);
    taskManager.enqueueUserMessage(userId, planInstruction, ctx, chatId);
  });

  // /mcp
  bot.command("mcp", async (ctx) => {
    const mcpServers = Array.from(registry.mcpServers.keys());
    const mcpTools = Array.from(registry.tools.keys()).filter((t) => typeof t === "string" && t.startsWith("mcp_"));

    if (mcpServers.length === 0) {
      return ctx.reply("Bridge MCP aktif tapi tidak ada server terhubung.");
    }

    const serversList = mcpServers.map((s) => `• *${s}* (Connected)`).join("\n");
    const toolsList = mcpTools.map((t) => `• \`${t}\``).join("\n");

    await ctx.reply(
      `🌐 *STATUS MCP BRIDGE*\n━━━━━━━━━━━━━━━━━━━━\n` +
        `*MCP Servers Connected:*\n${serversList}\n\n` +
        `*Registered MCP Tools:*\n${toolsList}`,
      { parse_mode: "Markdown" }
    );
  });

  // /inventory (or /inv) with page parameters and subcommands
  bot.command(["inventory", "inv"], async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name || String(userId);
    const payload = ctx.payload.trim();

    if (payload) {
      const parts = payload.split(/\s+/);
      const sub = parts[0].toLowerCase();

      if (sub === "delete" && parts[1] === "skill") {
        const skillName = parts.slice(2).join(" ").trim();
        if (!skillName) return ctx.reply("Format salah. Gunakan: `/inv delete skill <nama_skill>`");
        
        try {
          const db = await getGlobalDB();
          await db.run("INSERT OR REPLACE INTO user_skills (user_id, skill_name, enabled) VALUES (?, ?, 0)", [String(userId), skillName]);
          return ctx.reply(`❌ *Skill [${skillName}] dinonaktifkan* untuk agen Anda. Agen tidak akan membaca panduan skill ini lagi.`);
        } catch (err) {
          return ctx.reply(`❌ Gagal menonaktifkan skill: ${err.message}`);
        }
      } 
      else if ((sub === "activate" || sub === "add") && parts[1] === "skill") {
        const skillName = parts.slice(2).join(" ").trim();
        if (!skillName) return ctx.reply("Format salah. Gunakan: `/inv activate skill <nama_skill>`");

        try {
          const db = await getGlobalDB();
          await db.run("INSERT OR REPLACE INTO user_skills (user_id, skill_name, enabled) VALUES (?, ?, 1)", [String(userId), skillName]);
          return ctx.reply(`✅ *Skill [${skillName}] diaktifkan kembali* untuk agen Anda.`);
        } catch (err) {
          return ctx.reply(`❌ Gagal mengaktifkan skill: ${err.message}`);
        }
      }
      else if (sub === "manage" && parts[1] === "skill") {
        try {
          const db = await getGlobalDB();
          const userSkills = await db.all("SELECT * FROM user_skills WHERE user_id = ?", [String(userId)]);
          const skillStates = new Map(userSkills.map(s => [s.skill_name, s.enabled]));

          let skillListStr = "";
          if (registry.skills.size === 0) {
            skillListStr = "_Belum ada skill yang terdaftar di sistem._";
          } else {
            let num = 1;
            for (const [name, sk] of registry.skills.entries()) {
              const state = skillStates.has(name) ? skillStates.get(name) : 1;
              const emoji = state === 1 ? "✅ *ENABLED*" : "❌ *DISABLED*";
              const cmdHint = state === 1 
                ? `\`/inv delete skill ${name}\` untuk mematikan` 
                : `\`/inv activate skill ${name}\` untuk menyalakan`;
              
              skillListStr += `${num}. *${name}* | Status: ${emoji}\n   Deskripsi: _${sk.description}_\n   Ketik: ${cmdHint}\n\n`;
              num++;
            }
          }

          return ctx.reply(
            `🛠 *MANAJEMEN SKILL AGEN*\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `Berikut adalah daftar skill agen Anda:\n\n` +
            `${skillListStr}`,
            { parse_mode: "Markdown" }
          );
        } catch (err) {
          return ctx.reply(`❌ Gagal memuat manajemen skill: ${err.message}`);
        }
      }
      else if (sub === "delete") {
        const itemId = parseInt(parts[1]);
        if (isNaN(itemId)) return ctx.reply("Format salah. Gunakan: `/inv delete <item_id_inventory>`");

        try {
          const itemName = await removeItemFromUser(userId, itemId, 1);
          return ctx.reply(`🗑 *1x ${itemName}* telah dihapus dari inventory Anda.`);
        } catch (err) {
          return ctx.reply(`❌ Gagal menghapus item: ${err.message}`);
        }
      }
      
      const pageNum = parseInt(payload);
      if (!isNaN(pageNum) && pageNum > 0) {
        return displayInventory(ctx, userId, username, pageNum);
      }

      return ctx.reply("Subcommand tidak dikenal. Gunakan `/inv delete <id>`, `/inv manage skill`, `/inv delete skill <nama>`, atau `/inv [halaman]`.");
    }

    return displayInventory(ctx, userId, username, 1);
  });

  // /tower (Komprehensif RPG Tower Battle System)
  bot.command(["tower", "towering"], async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name || String(userId);
    const payload = (ctx.payload || "").trim();

    try {
      const state = await TowerManager.getUserState(userId);
      const room = TowerManager.getRoomInfo(state.floor, state.room_idx);

      if (payload.startsWith("party")) {
        const size = payload.split(/\s+/)[1] || "4";
        return ctx.reply(`👥 *TOWER PARTY CREATED*\nParty berkapasitas *${size} Player* berhasil dibuat!\nID Party: \`PARTY-${userId.toString().slice(-4)}\``, { parse_mode: "Markdown" });
      }

      if (payload.startsWith("send") || payload.startsWith("dispatch")) {
        const parts = payload.split(/\s+/);
        const targetFloor = parseInt(parts[1]);
        if (isNaN(targetFloor)) {
          return ctx.reply("Gunakan: `/tower send <lantai>` (contoh: `/tower send 5`) untuk mengirim party ke lantai yang sudah pernah dilewati.", { parse_mode: "Markdown" });
        }
        const res = await TowerManager.startExpedition(userId, targetFloor);
        return ctx.reply(
          `🚀 *PARALLEL TOWER EXPEDITION DIMULAI!*\n━━━━━━━━━━━━━━━━━━━━\n` +
          `• *Target Lantai:* Lantai ${res.floor} (Cleared Floor)\n` +
          `• *Durasi:* ${res.durationMinutes} Menit\n` +
          `• *Reward Preview:* ${res.rewardPreview}\n\n` +
          `💡 Ketik \`/tower expedition\` untuk cek status atau \`/tower claim\` jika sudah selesai!`,
          { parse_mode: "Markdown" }
        );
      }

      if (payload.startsWith("expedition") || payload.startsWith("expeditions")) {
        const exps = await TowerManager.getUserExpeditions(userId);
        if (exps.length === 0) {
          return ctx.reply("Tidak ada ekspedisi paralel yang sedang berlangsung.\n💡 Gunakan `/tower send <lantai>` untuk mengirim party!", { parse_mode: "Markdown" });
        }
        const listStr = exps.map(e => 
          `• *ID:* \`${e.id}\` | Lantai ${e.floor} | Status: *${e.isReady ? "✅ SIAP DIKLAIM" : `⏳ Sisa ${e.remainingSec}s`}*\n  Ketik: \`/tower claim ${e.id}\``
        ).join("\n\n");
        return ctx.reply(`🛰️ *DAFTAR EKSPEDISI PARALEL TOWER*\n━━━━━━━━━━━━━━━━━━━━\n${listStr}`, { parse_mode: "Markdown" });
      }

      if (payload.startsWith("claim")) {
        const parts = payload.split(/\s+/);
        const expId = parseInt(parts[1]);
        if (isNaN(expId)) {
          const exps = await TowerManager.getUserExpeditions(userId);
          const ready = exps.find(e => e.isReady && e.status !== "claimed");
          if (!ready) return ctx.reply("Belum ada ekspedisi yang siap diklaim. Gunakan `/tower expedition` untuk melihat status.", { parse_mode: "Markdown" });
          const res = await TowerManager.claimExpedition(userId, ready.id);
          return ctx.reply(`🎁 *HASIL EKSPEDISI DIKLAIM!*\n━━━━━━━━━━━━━━━━━━━━\n• *Lantai:* ${res.floor}\n• *Reward:* +${res.exp} EXP | +${res.silver} Silver | 📦 Item: *${res.item}*`, { parse_mode: "Markdown" });
        }
        const res = await TowerManager.claimExpedition(userId, expId);
        return ctx.reply(`🎁 *HASIL EKSPEDISI DIKLAIM!*\n━━━━━━━━━━━━━━━━━━━━\n• *Lantai:* ${res.floor}\n• *Reward:* +${res.exp} EXP | +${res.silver} Silver | 📦 Item: *${res.item}*`, { parse_mode: "Markdown" });
      }

      if (payload.startsWith("attack") || payload.startsWith("skill")) {
        const parts = payload.split(/\s+/);
        const action = parts[0] === "skill" ? "skill" : "attack";
        const skillKey = parts[1] || null;

        const res = await BattleEngine.executeTurn(userId, action, skillKey);

        if (res.status === "defeat") {
          return ctx.reply(
            `💀 *BATTLE DEFEAT*\n━━━━━━━━━━━━━━━━━━━━\n${res.logs.join("\n")}\n\n${res.penaltyMsg}`,
            { parse_mode: "Markdown" }
          );
        } else if (res.status === "victory") {
          let msg = `⚔️ *BATTLE VICTORY!*\n━━━━━━━━━━━━━━━━━━━━\n${res.logs.join("\n")}\n\n` +
                    `🎁 *HADIAH:* +${res.expReward} EXP | +${res.silverReward} Silver${res.levelUpStr}`;
          
          if (res.isQuestComplete) {
            msg += `\n\n🎉 *ROOM QUEST CLEARED!* Ruangan dibersihkan. Lanjut ke Lantai ${res.newFloor}!`;
          } else {
            msg += `\n\n💡 Ketik \`/tower attack\` lagi untuk membasmi musuh berikutnya.`;
          }
          return ctx.reply(msg, { parse_mode: "Markdown" });
        } else {
          return ctx.reply(
            `⚔️ *PERTARUNGAN BERLANGSUNG*\n━━━━━━━━━━━━━━━━━━━━\n${res.logs.join("\n")}\n\n` +
            `❤️ HP Musuh: \`${res.monsterHp}/${res.monsterMaxHp}\`\n` +
            `❤️ HP Anda: \`${res.playerHp}/${res.playerMaxHp}\` | 💧 Mana: \`${res.playerMana}/${res.playerMaxMana}\`\n\n` +
            `💡 Ketik \`/tower attack\` atau \`/tower skill <key>\` untuk menyerang balik!`,
            { parse_mode: "Markdown" }
          );
        }
      }

      // Load party synergy
      const heroes = await HeroManager.getUserHeroes(userId);
      const party = heroes.slice(0, 4);
      const synergy = HeroManager.getPartySynergy(party);
      const synergyStr = synergy.bonuses.length > 0 ? synergy.bonuses.join("\n") : "_Tidak ada sinergi elemen khusus._";

      // Default Display
      const towerInfo = 
        `═══════ 🗼 TOWER BATTLE ═══════\n\n` +
        `*Floor:* Lv. ${state.floor} (Room ${state.room_idx + 1})\n` +
        `*Room ID:* \`${room.roomId}\`\n\n` +
        `*Quest:* "${room.questTitle}"\n` +
        `_${room.questDesc}_\n\n` +
        `*Progress:* ${state.quest_progress} / ${room.targetKills}\n` +
        `*Difficulty:* ${room.difficulty}\n` +
        `*Recommended Party:* ${room.recommendedParty}\n\n` +
        `⚡ *Party Synergy Aktif:*\n${synergyStr}\n\n` +
        `❤️ *HP Party:* ${state.hp}/${state.max_hp}\n` +
        `💧 *Mana Party:* ${state.mana}/${state.max_mana}\n\n` +
        `🎁 *Reward Preview:* Gold | EXP | Rare Equipment | Material\n` +
        `═════════════════════════════\n\n` +
        `💡 *Perintah Bertarung & Ekspedisi:*\n` +
        `• \`/tower attack\` - Serang musuh ruangan ini\n` +
        `• \`/tower skill <key>\` - Serang menggunakan skill\n` +
        `• \`/tower send <lantai>\` - Kirim party ke lantai yang sudah dilewati\n` +
        `• \`/tower expedition\` - Cek daftar ekspedisi berjalan\n` +
        `• \`/tower claim [id]\` - Klaim hadiah ekspedisi`;

      await ctx.reply(towerInfo, { parse_mode: "Markdown" });
    } catch (err) {
      await ctx.reply(`❌ Gagal masuk ke tower: ${err.message}`);
    }
  });

  // /use <item_id>
  bot.command("use", async (ctx) => {
    const userId = ctx.from.id;
    const itemId = (ctx.payload || "").trim();
    if (!itemId) {
      return ctx.reply("Gunakan: `/use <item_id>` (contoh: `/use Ramuan HP`)", { parse_mode: "Markdown" });
    }
    try {
      const res = await BattleEngine.executeTurn(userId, `item:${itemId}`);
      if (res.error) return ctx.reply(res.error);
      return ctx.reply(`🧪 *Item Digunakan!*\n${res.logs}`, { parse_mode: "Markdown" });
    } catch (err) {
      return ctx.reply(`❌ Gagal menggunakan item: ${err.message}`);
    }
  });

  // /hero (Commander Hero Management System)
  bot.command(["hero", "heroes"], async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name || String(userId);
    const payload = (ctx.payload || "").trim();

    try {
      const parts = payload.split(/\s+/);
      const subcommand = parts[0] ? parts[0].toLowerCase() : "";

      if (subcommand === "diary" || subcommand === "diaries") {
        const heroId = parts[1];
        if (!heroId) return ctx.reply("Gunakan: `/hero diary <hero_id>`", { parse_mode: "Markdown" });

        const res = await LivingWorldEngine.getHeroDiaries(userId, heroId);
        const entriesStr = res.list.map(d => `• ${d.entry_text}`).join("\n\n");

        return ctx.reply(
          `📖 *HERO DIARY — ${res.hero.name} ${res.hero.surname}*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `${entriesStr}\n\n` +
          `💡 Catatan harian Hero ditulis secara dinamis berdasarkan perjalanan bersama Commander!`,
          { parse_mode: "Markdown" }
        );
      }

      if (subcommand === "detail") {
        const heroId = parts[1];
        if (!heroId) return ctx.reply("Gunakan: `/hero detail <hero_id>`", { parse_mode: "Markdown" });

        const hero = await HeroManager.getHeroDetail(userId, heroId);
        if (!hero) return ctx.reply(`❌ Hero ID \`${heroId}\` tidak ditemukan di koleksi Anda!`, { parse_mode: "Markdown" });

        if (parts[2] === "background" || parts[2] === "story") {
          const page = parseInt(parts[3]) || 1;
          const bgPages = JSON.parse(hero.background_json || "[]");
          const maxPages = Math.min(bgPages.length, hero.star);
          if (page < 1 || page > maxPages) {
            return ctx.reply(`📖 Story Halaman ${page} belum terbuka! (Maksimum Halaman Terbuka: ${maxPages} berdasarkan ${hero.star} Star).`, { parse_mode: "Markdown" });
          }
          return ctx.reply(
            `📖 *HERO STORY — ${hero.name} ${hero.surname}* (Hal. ${page}/${maxPages})\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `${bgPages[page - 1] || "_Tidak ada catatan cerita._"}`,
            { parse_mode: "Markdown" }
          );
        }

        const starsStr = "⭐".repeat(hero.star);
        const skillsList = JSON.parse(hero.skills_json || "[]").map(s => `• *${s.name}* (${s.type.toUpperCase()}) — ${s.desc}`).join("\n");

        return ctx.reply(
          `═══════ 👤 HERO DETAIL ═══════\n` +
          `• *Nama:* ${hero.name} ${hero.surname}\n` +
          `• *Julukan:* "${hero.nickname}"\n` +
          `• *Hero ID:* \`${hero.hero_id}\`\n` +
          `• *Star:* ${starsStr} (${hero.star} Star)\n` +
          `• *Rarity:* *${hero.rarity}* | *Class:* ${hero.class_name}\n` +
          `• *Elemen:* ${hero.element} | *Growth:* ${hero.growth_type}\n\n` +
          `📍 *Asal & Ras:* ${hero.country} (${hero.race}, ${hero.gender}, ${hero.age} th, ${hero.height} cm)\n` +
          `🎭 *Kepribadian:* ${hero.personality} | *Hobi:* ${hero.hobby}\n` +
          `❤️ *Likes:* ${hero.likes} | 💔 *Dislikes:* ${hero.dislikes}\n` +
          `⚠️ *Kelemahan:* ${hero.weakness}\n\n` +
          `💬 *Dialog Panggilan:* _${hero.dialog_summon}_\n\n` +
          `📊 *STATS (Lv. ${hero.level}):*\n` +
          `• HP: \`${hero.hp}/${hero.max_hp}\` | Mana: \`${hero.mana}/${hero.max_mana}\`\n` +
          `• ATK: \`${hero.atk}\` | MATK: \`${hero.matk}\` | DEF: \`${hero.def}\` | MDEF: \`${hero.mdef}\` | SPD: \`${hero.speed}\`\n` +
          `• Crit: \`${hero.crit_rate}%\` | Crit DMG: \`${hero.crit_dmg}%\` | Trust: \`${hero.trust}%\`\n\n` +
          `⚔️ *HERO SKILLS:*\n${skillsList}\n\n` +
          `📖 *Lore:* _${hero.lore}_\n` +
          `💡 Ketik \`/hero detail ${hero.hero_id} background 1\` untuk membaca cerita pahlawan ini.`,
          { parse_mode: "Markdown" }
        );
      }

      if (subcommand === "upstar") {
        const heroId = parts[1];
        if (!heroId) return ctx.reply("Gunakan: `/hero upstar <hero_id>`", { parse_mode: "Markdown" });
        const res = await HeroManager.upStarHero(userId, heroId);
        return ctx.reply(
          `✨ *HERO UP STAR SUCCESS!*\n━━━━━━━━━━━━━━━━━━━━\n` +
          `• *Hero:* ${res.name}\n` +
          `• *Star:* ${"⭐".repeat(res.oldStar)} → ${"⭐".repeat(res.newStar)}\n` +
          `• *Bonus Stat:* ATK +${res.atkBonus} | DEF +${res.defBonus} | HP +${res.hpBonus}\n` +
          `• *Class:* ${res.newClass}\n` +
          `🎉 Halaman cerita & potensi baru telah terbuka!`,
          { parse_mode: "Markdown" }
        );
      }

      if (subcommand === "synthesize") {
        const targetId = parts[1];
        const matIds = parts.slice(2);
        if (!targetId || matIds.length === 0) {
          return ctx.reply("Gunakan: `/hero synthesize <target_hero_id> <material_hero_id_1> <material_hero_id_2> ...`", { parse_mode: "Markdown" });
        }
        const res = await HeroManager.synthesizeHero(userId, targetId, matIds);
        return ctx.reply(
          `🧪 *SYNTHESIZE BERHASIL!*\n━━━━━━━━━━━━━━━━━━━━\n` +
          `• *Hero Target:* ${res.targetName}\n` +
          `• *Material Digunakan:* ${res.count} Hero\n` +
          `• *EXP Gained:* +${res.expGained} EXP\n` +
          `🎉 Hero target sekarang berlevel **Lv. ${res.newLevel}**!`,
          { parse_mode: "Markdown" }
        );
      }

      // Default List Hero Commander
      const heroes = await HeroManager.getUserHeroes(userId);
      if (heroes.length === 0) {
        return ctx.reply(
          `👥 *HERO COLLECTION COMMANDER*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `Anda belum memiliki Hero dalam koleksi!\n\n` +
          `💡 Ketik \`/gacha basic\` atau \`/gacha premium\` untuk merekrut Hero pertama Anda!`,
          { parse_mode: "Markdown" }
        );
      }

      const listStr = heroes.map((h, i) => 
        `${i + 1}. *${h.name} ${h.surname}* [${"⭐".repeat(h.star)}] — *${h.rarity}* | Class: \`${h.class_name}\` | ID: \`${h.hero_id}\``
      ).join("\n");

      return ctx.reply(
        `👥 *HERO COLLECTION COMMANDER* (@${username})\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Total Hero: *${heroes.length} Pahlawan*\n\n` +
        `${listStr}\n\n` +
        `💡 *Perintah Hero:*\n` +
        `• \`/hero detail <hero_id>\` - Detail profil & stat Hero\n` +
        `• \`/hero upstar <hero_id>\` - Naikkan Star ⭐ Hero\n` +
        `• \`/hero synthesize <target> <mat1> <mat2>\` - Konsumsi Hero material untuk EXP\n` +
        `• \`/giveitem <hero_id> <item_id>\` - Pasang equipment ke Hero`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      await ctx.reply(`❌ *Hero System Error:* ${err.message}`, { parse_mode: "Markdown" });
    }
  });

  // /gacha <basic|premium|super> [x1|x5|x10]
  bot.command("gacha", async (ctx) => {
    const userId = ctx.from.id;
    const payload = (ctx.payload || "").trim().toLowerCase();
    const parts = payload.split(/\s+/);
    
    const bannerType = parts[0] || "basic";
    let count = 1;
    if (parts[1] && parts[1].startsWith("x")) {
      count = parseInt(parts[1].substring(1)) || 1;
    }
    count = Math.min(10, Math.max(1, count));

    try {
      const res = await HeroManager.pullGacha(userId, bannerType, count);
      const listStr = res.results.map((h, i) => 
        `• *${h.name} ${h.surname}* ("${h.nickname}") [${"⭐".repeat(h.star)}] — *${h.rarity}* | Elemen: ${h.element} | ID: \`${h.hero_id}\`\n  _"${h.dialog_summon}"_`
      ).join("\n\n");

      return ctx.reply(
        `🎰 *REKRUTMEN HERO (GACHA — ${bannerType.toUpperCase()})*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Biaya Terpakai: *${res.costUsed}*\n\n` +
        `🎉 *HERO BARU DIREKRUT:*\n${listStr}\n\n` +
        `💡 Ketik \`/hero\` untuk melihat seluruh koleksi Anda.`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      await ctx.reply(`❌ *Gacha Gagal:* ${err.message}`, { parse_mode: "Markdown" });
    }
  });

  // /giveitem <hero_id> <item_id>
  bot.command("giveitem", async (ctx) => {
    const userId = ctx.from.id;
    const parts = (ctx.payload || "").trim().split(/\s+/);
    const heroId = parts[0];
    const itemName = parts.slice(1).join(" ");

    if (!heroId || !itemName) {
      return ctx.reply("Gunakan: `/giveitem <hero_id> <nama_item>` (contoh: `/giveitem ALSR-UA91-ZF20 Pedang Tua`)", { parse_mode: "Markdown" });
    }

    try {
      const res = await HeroManager.giveItemToHero(userId, heroId, itemName);
      return ctx.reply(
        `🛡️ *EQUIPMENT DIPASANG LEWAT COMMANDER!*\n━━━━━━━━━━━━━━━━━━━━\n` +
        `• *Hero:* ${res.heroName}\n` +
        `• *Item:* *${res.itemName}*\n` +
        `• *Bonus Stat:* ATK +${res.atkAdd} | DEF +${res.defAdd}`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      await ctx.reply(`❌ *Gagal Memasang Item:* ${err.message}`, { parse_mode: "Markdown" });
    }
  });

  // /roomchat (Menampilkan Obrolan Otomatis antar Hero di Pangkalan)
  bot.command(["roomchat", "roomchats"], async (ctx) => {
    const userId = ctx.from.id;
    const payload = (ctx.payload || "").trim().toLowerCase();

    try {
      if (payload === "clear" || payload === "reset") {
        await LivingWorldEngine.clearRoomchats(userId);
        return ctx.reply("🧹 *Riwayat Hero Roomchat berhasil dibersihkan!*", { parse_mode: "Markdown" });
      }

      // Picu pemicu percakapan baru otomatis
      await LivingWorldEngine.generateHeroConversation(userId);
      const chats = await LivingWorldEngine.getRoomchats(userId);
      const weather = await LivingWorldEngine.getCurrentWeather();

      if (chats.length === 0) {
        return ctx.reply(
          `💬 *HERO ROOM CHAT*\n━━━━━━━━━━━━━━━━━━━━\n` +
          `Belum ada obrolan di pangkalan! Rekrut minimal 2 Hero via \`/gacha\` agar pahlawan Anda bisa saling berinteraksi secara otomatis.`,
          { parse_mode: "Markdown" }
        );
      }

      const listStr = chats.map(c => `• *${c.hero1_name}* & *${c.hero2_name}*:\n  ${c.message}`).join("\n\n");

      return ctx.reply(
        `💬 *HERO ROOM CHAT (OBROLAN PANGKALAN)*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🌍 *Cuaca Saat Ini:* ${weather.name} (${weather.effect})\n\n` +
        `${listStr}\n\n` +
        `💡 Percakapan di-reset otomatis setiap 5 menit! Ketik \`/roomchat clear\` untuk mengosongkan manual.`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      await ctx.reply(`❌ *Gagal Memuat Roomchat:* ${err.message}`, { parse_mode: "Markdown" });
    }
  });

  // /news (Menampilkan Berita Dunia Elynia Terkini & Cuaca)
  bot.command(["news", "worldnews"], async (ctx) => {
    try {
      const newsList = await LivingWorldEngine.getWorldNews();
      const weather = await LivingWorldEngine.getCurrentWeather();

      const listStr = newsList.map((n, i) => 
        `${i + 1}. 📰 *${n.title}*\n   _${n.content}_\n   ⚡ *Dampak World:* ${n.impact}`
      ).join("\n\n");

      return ctx.reply(
        `📰 *BERITA DUNIA ELYNIA (WORLD NEWS)*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🌤️ *CUACA DUNIA:* ${weather.name}\n` +
        `✨ *Efek Element:* \`${weather.effect}\`\n\n` +
        `${listStr}\n\n` +
        `💡 Berita & Cuaca berubah secara dinamis dan memengaruhi monster, quest, serta ekspedisi!`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      await ctx.reply(`❌ *Gagal Memuat Berita:* ${err.message}`, { parse_mode: "Markdown" });
    }
  });

  // /rumor (Menampilkan Rumor Dunia Elynia)
  bot.command(["rumor", "rumors"], async (ctx) => {
    try {
      const rumors = await LivingWorldEngine.getWorldRumors();
      const listStr = rumors.map((r, i) => 
        `${i + 1}. 🗣️ *[${r.topic}]* Dari: _${r.source}_\n   "${r.content}"\n   🔍 Status: ${r.veracity}`
      ).join("\n\n");

      return ctx.reply(
        `🔮 *RUMOR & GOSIP DUNIA ELYNIA*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `${listStr}\n\n` +
        `💡 Rumor beredar dari NPC & petualang. Sebagian fakta, sebagian gosip belum terbukti!`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      await ctx.reply(`❌ *Gagal Memuat Rumor:* ${err.message}`, { parse_mode: "Markdown" });
    }
  });

  // /pvp (PvP Arena & Leaderboard System)
  bot.command("pvp", async (ctx) => {
    const userId = ctx.from.id;
    const payload = (ctx.payload || "").trim().toLowerCase();
    const parts = payload.split(/\s+/);
    const sub = parts[0] || "";

    try {
      if (sub === "top" || sub === "leaderboard") {
        const top = await PvpEngine.getTopLeaderboard();
        const listStr = top.map(t => `#${t.rank} *${t.name}* — \`${t.points} Poin\` [${t.rank_title}]`).join("\n");
        return ctx.reply(`🏆 *LEADERBOARD COMMANDER PVP SERVER*\n━━━━━━━━━━━━━━━━━━━━\n${listStr}`, { parse_mode: "Markdown" });
      }

      if (sub === "match" || sub === "battle") {
        // Simulasi pertarungan dengan bot Commander saingan
        const targetUserId = "999999";
        const res = await PvpEngine.battle(userId, targetUserId);

        const outcomeStr = res.isWinnerA ? "🎉 *KEMENANGAN PVP! (+25 Poin ELO)*\n🎁 Reward: +150 Silver 🥈 & +50 EXP" : "💀 *KEKALAHAN PVP (-25 Poin ELO)*";

        return ctx.reply(
          `⚔️ *PERTARUNGAN PVP ARENA 4v4*\n━━━━━━━━━━━━━━━━━━━━\n` +
          `• *Tim Anda:* (${res.partyANames})\n` +
          `• *Tim Musuh:* (${res.partyBNames})\n\n` +
          `💥 Damage Dihasilkan: **${res.dmgToB} DMG** | Sisa HP Musuh: \`${res.remHpB}\`\n` +
          `💢 Damage Diterima: **${res.dmgToA} DMG** | Sisa HP Anda: \`${res.remHpA}\`\n\n` +
          `${outcomeStr}\n` +
          `🏅 *Rank PvP Anda:* **${res.rankA}** (\`${res.newPointsA} Poin\`)`,
          { parse_mode: "Markdown" }
        );
      }

      // Default Display PvP Status
      const stats = await PvpEngine.getPvpStats(userId);
      return ctx.reply(
        `⚔️ *PVP ARENA COMMANDER*\n━━━━━━━━━━━━━━━━━━━━\n` +
        `• *Rank:* **${stats.rank_title}**\n` +
        `• *Poin ELO:* \`${stats.points} Poin\`\n` +
        `• *Rekor Pertarungan:* ${stats.wins} Menang | ${stats.losses} Kalah\n\n` +
        `💡 *Perintah PvP:*\n` +
        `• \`/pvp match\` - Cari lawan bertarung di Arena 4v4\n` +
        `• \`/pvp top\` - Lihat papan peringkat Commander tertinggi`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      await ctx.reply(`❌ *PvP System Error:* ${err.message}`, { parse_mode: "Markdown" });
    }
  });

  // /spin (Wheel of Fortune Harian)
  bot.command("spin", async (ctx) => {
    const userId = ctx.from.id;
    try {
      const prize = await CasinoEngine.spinWheel(userId);
      return ctx.reply(
        `🎡 *WHEEL OF FORTUNE (SPIN HARIAN)*\n━━━━━━━━━━━━━━━━━━━━\n` +
        `🎉 *SELAMAT! Anda memenangkan:*\n` +
        `🎁 **${prize.label}**!\n\n` +
        `💡 Hadiah telah ditambahkan ke saldo akun Anda. Kembali lagi besok untuk spin gratis berikutnya!`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      await ctx.reply(`❌ *Spin Gagal:* ${err.message}`, { parse_mode: "Markdown" });
    }
  });

  // /dice <taruhan> <tebakan>
  bot.command("dice", async (ctx) => {
    const userId = ctx.from.id;
    const parts = (ctx.payload || "").trim().split(/\s+/);
    const bet = parseInt(parts[0]) || 100;
    const guess = parts[1] || "ganjil";

    try {
      const res = await CasinoEngine.rollDice(userId, bet, guess);
      if (res.isWin) {
        return ctx.reply(
          `🎲 *DUEL DADU HOKI (KEMENANGAN!)*\n━━━━━━━━━━━━━━━━━━━━\n` +
          `• *Angka Dadu:* 🎲 **[ ${res.diceRoll} ]**\n` +
          `• *Tebakan Anda:* \`${guess}\` (TEPAT! 🎉)\n` +
          `• *Hasil Taruhan:* +${res.netGain} Silver 🥈`,
          { parse_mode: "Markdown" }
        );
      } else {
        return ctx.reply(
          `🎲 *DUEL DADU HOKI (KEKALAHAN)*\n━━━━━━━━━━━━━━━━━━━━\n` +
          `• *Angka Dadu:* 🎲 **[ ${res.diceRoll} ]**\n` +
          `• *Tebakan Anda:* \`${guess}\` (Meleset! 💔)\n` +
          `• *Kerugian:* -${res.lostAmount} Silver 🥈`,
          { parse_mode: "Markdown" }
        );
      }
    } catch (err) {
      await ctx.reply(`❌ *Dice Error:* ${err.message}`, { parse_mode: "Markdown" });
    }
  });

  // /plugin (AI Capability Package Manager CLI)
  bot.command(["plugin", "plugins"], async (ctx) => {
    const userId = ctx.from.id;
    const role = await getUserRole(userId);
    const isStaff = role === "owner" || role === "admin";
    const payload = (ctx.payload || "").trim();
    const parts = payload.split(/\s+/);
    const action = parts[0] ? parts[0].toLowerCase() : "";
    let targetPlugin = parts[1] || "";

    try {
      // Resolusi Numeric ID menjadi Real Plugin ID
      if (targetPlugin && /^\d+$/.test(targetPlugin)) {
        await pluginManager.initUserPlugins(userId);
        const plugins = pluginManager.getUserPluginsList(userId);
        const idx = parseInt(targetPlugin, 10) - 1;
        if (plugins[idx]) {
          targetPlugin = plugins[idx].id;
        }
      }

      if (action === "install") {
        if (!targetPlugin) return ctx.reply("Gunakan: `/plugin install <url-github>`", { parse_mode: "Markdown" });
        const res = await pluginManager.installPlugin(userId, targetPlugin);
        return ctx.reply(`📦 *PLUGIN BERHASIL DIINSTAL!*\n━━━━━━━━━━━━━━━━━━━━\n• *ID:* \`${res.id}\`\n\nPlugin terpasang 🟢 di workspace privat Anda dan langsung aktif!`, { parse_mode: "Markdown" });
      }

      if (action === "enable") {
        if (!isStaff) return ctx.reply("❌ Hanya Admin/Owner yang dapat mengaktifkan plugin.");
        if (!targetPlugin) return ctx.reply("Gunakan: `/plugin enable <plugin_id>`", { parse_mode: "Markdown" });
        const res = await pluginManager.enablePlugin(userId, targetPlugin);
        if (res) return ctx.reply(`✅ Plugin \`${targetPlugin}\` berhasil diaktifkan 🟢!`, { parse_mode: "Markdown" });
        return ctx.reply(`❌ Gagal mengaktifkan plugin \`${targetPlugin}\`. Cek logs via \`/plugin logs ${targetPlugin}\`.`, { parse_mode: "Markdown" });
      }

      if (action === "disable") {
        if (!isStaff) return ctx.reply("❌ Hanya Admin/Owner yang dapat menonaktifkan plugin.");
        if (!targetPlugin) return ctx.reply("Gunakan: `/plugin disable <plugin_id>`", { parse_mode: "Markdown" });
        const res = await pluginManager.disablePlugin(userId, targetPlugin);
        if (res) return ctx.reply(`⏸️ Plugin \`${targetPlugin}\` berhasil dinonaktifkan!`, { parse_mode: "Markdown" });
        return ctx.reply(`❌ Gagal menonaktifkan plugin \`${targetPlugin}\`.`, { parse_mode: "Markdown" });
      }

      if (action === "reload" || action === "update") {
        if (!isStaff) return ctx.reply("❌ Hanya Admin/Owner yang dapat merefresh plugin.");
        if (!targetPlugin) return ctx.reply("Gunakan: `/plugin reload <plugin_id>`", { parse_mode: "Markdown" });
        const res = await pluginManager.reloadPlugin(userId, targetPlugin);
        if (res) return ctx.reply(`🔄 Plugin \`${targetPlugin}\` berhasil di-reload!`, { parse_mode: "Markdown" });
        return ctx.reply(`❌ Gagal merefresh plugin \`${targetPlugin}\`.`, { parse_mode: "Markdown" });
      }

      if (action === "uninstall" || action === "remove") {
        if (!isStaff) return ctx.reply("❌ Hanya Admin/Owner yang dapat menghapus plugin.");
        if (!targetPlugin) return ctx.reply("Gunakan: `/plugin uninstall <plugin_id>`", { parse_mode: "Markdown" });
        await pluginManager.uninstallPlugin(userId, targetPlugin);
        return ctx.reply(`🗑️ Plugin \`${targetPlugin}\` telah dihapus secara permanen dari server.`, { parse_mode: "Markdown" });
      }

      if (action === "logs") {
        if (!targetPlugin) return ctx.reply("Gunakan: `/plugin logs <plugin_id>`", { parse_mode: "Markdown" });
        const logs = pluginManager.getPluginLogs(userId, targetPlugin);
        return ctx.reply(`📋 *PLUGIN LOGS — ${targetPlugin}*\n━━━━━━━━━━━━━━━━━━━━\n\`\`\`\n${logs.join("\n")}\n\`\`\``, { parse_mode: "Markdown" });
      }

      if (action === "info") {
        if (!targetPlugin) return ctx.reply("Gunakan: `/plugin info <plugin_id>`", { parse_mode: "Markdown" });
        const list = pluginManager.getUserPluginsList(userId);
        const p = list.find(item => item.id === targetPlugin);
        if (!p) return ctx.reply(`❌ Plugin \`${targetPlugin}\` tidak ditemukan.`, { parse_mode: "Markdown" });

        return ctx.reply(
          `📦 *PLUGIN INFO — ${p.name}*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `• *ID:* \`${p.id}\`\n` +
          `• *Versi:* \`v${p.version}\` | *Author:* ${p.author}\n` +
          `• *Status:* **${p.status.toUpperCase()}** ${p.status === "enabled" ? "🟢" : "🔴"}\n` +
          `• *Deskripsi:* ${p.description || "_Tidak ada deskripsi._"}\n\n` +
          `🔑 *Permissions Granted:*\n${p.permissions.map(perm => `• ${perm}`).join("\n")}`,
          { parse_mode: "Markdown" }
        );
      }

      // Default Display: /plugin list
      await pluginManager.initUserPlugins(userId);
      const plugins = pluginManager.getUserPluginsList(userId);
      if (plugins.length === 0) {
        return ctx.reply("🧩 *AI CAPABILITY PLUGIN MANAGER*\n━━━━━━━━━━━━━━━━━━━━\nBelum ada plugin privat yang terpasang di folder workspace Anda (`plugins/`). Simpan paket plugin ke folder workspace privat Anda untuk mengaktifkannya!", { parse_mode: "Markdown" });
      }

      const listStr = plugins.map((p, i) => 
        `${i + 1}. *${p.name}* (\`v${p.version}\`) — Status: **${p.status.toUpperCase()}** ${p.status === "enabled" ? "🟢" : "🔴"}\n   ID: \`${p.id}\` | ${p.description}`
      ).join("\n\n");

      return ctx.reply(
        `══════ 🧩 AI PLUGINS ══════\n\n` +
        `${listStr}\n\n` +
        `═══════════════════════════\n` +
        `💡 *Perintah Plugin CLI:*\n` +
        `• \`/plugin enable <id>\` - Aktifkan plugin\n` +
        `• \`/plugin disable <id>\` - Menonaktifkan plugin\n` +
        `• \`/plugin reload <id>\` - Refresh hot-reload plugin\n` +
        `• \`/plugin info <id>\` - Informasi manifest & izin plugin\n` +
        `• \`/plugin logs <id>\` - Log aktivitas internal plugin`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      await ctx.reply(`❌ *Plugin Manager Error:* ${err.message}`, { parse_mode: "Markdown" });
    }
  });

  // /artifact (Persistent Artifact & Versioning Workspace CLI)
  bot.command(["artifact", "artifacts"], async (ctx) => {
    const userId = ctx.from.id;
    const payload = (ctx.payload || "").trim();
    const parts = payload.split(/\s+/);
    const action = parts[0] ? parts[0].toLowerCase() : "";
    const targetId = parts[1] || "";
    const extraContent = parts.slice(2).join(" ");

    try {
      if (action === "open" || action === "view") {
        if (!targetId) return ctx.reply("Gunakan: `/artifact open <id>`", { parse_mode: "Markdown" });
        const art = await ArtifactManager.getArtifact(userId, targetId);
        return ctx.reply(
          `📄 *ARTIFACT — ${art.name}* (\`v${art.version}\`)\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `• *ID:* \`${art.id}\` | *Tipe:* \`${art.type}\`\n\n` +
          `\`\`\`${art.type}\n${art.content}\n\`\`\``,
          { parse_mode: "Markdown" }
        );
      }

      if (action === "edit") {
        if (!targetId || !extraContent) return ctx.reply("Gunakan: `/artifact edit <id> <konten_baru>`", { parse_mode: "Markdown" });
        const res = await ArtifactManager.updateArtifact(userId, targetId, extraContent);
        return ctx.reply(`✅ Artifact \`${targetId}\` berhasil diperbarui ke versi **v${res.newVersion}**!`, { parse_mode: "Markdown" });
      }

      if (action === "fork") {
        if (!targetId) return ctx.reply("Gunakan: `/artifact fork <id>`", { parse_mode: "Markdown" });
        const res = await ArtifactManager.forkArtifact(userId, targetId);
        return ctx.reply(`🍴 Artifact \`${targetId}\` berhasil di-fork ke Artifact Baru dengan ID \`${res.id}\`!`, { parse_mode: "Markdown" });
      }

      if (action === "history") {
        if (!targetId) return ctx.reply("Gunakan: `/artifact history <id>`", { parse_mode: "Markdown" });
        const history = await ArtifactManager.getHistory(userId, targetId);
        const listStr = history.map(h => `• *v${h.version}* (${new Date(h.created_at).toLocaleString("id-ID")}): ${h.summary}`).join("\n");
        return ctx.reply(`📜 *RIWAYAT VERSI ARTIFACT — ${targetId}*\n━━━━━━━━━━━━━━━━━━━━\n${listStr}`, { parse_mode: "Markdown" });
      }

      if (action === "export") {
        if (!targetId) return ctx.reply("Gunakan: `/artifact export <id>`", { parse_mode: "Markdown" });
        const res = await ArtifactManager.exportArtifact(userId, targetId);
        return ctx.reply(`💾 Artifact berhasil diekspor ke file lokal workspace:\n\`${res.filePath}\``, { parse_mode: "Markdown" });
      }

      if (action === "delete" || action === "remove") {
        if (!targetId) return ctx.reply("Gunakan: `/artifact delete <id>`", { parse_mode: "Markdown" });
        const res = await ArtifactManager.deleteArtifact(userId, targetId);
        return ctx.reply(`🗑️ Artifact \`${res.name}\` (\`${targetId}\`) beserta seluruh riwayat reaksinya telah dihapus.`, { parse_mode: "Markdown" });
      }

      // Default Display: /artifact list
      const list = await ArtifactManager.getUserArtifacts(userId);
      if (list.length === 0) {
        return ctx.reply("📂 *ARTIFACT WORKSPACE*\n━━━━━━━━━━━━━━━━━━━━\nBelum ada Artifact tersimpan. AI Agent akan secara otomatis menyimpan hasil kerja dokumen, kode, & laporan sebagai Artifact persisten.", { parse_mode: "Markdown" });
      }

      const listStr = list.map((a, i) => 
        `${i + 1}. *${a.name}* (\`v${a.version}\`) — Tipe: \`${a.type}\`\n   ID: \`${a.id}\` | Update: _${new Date(a.updated_at).toLocaleTimeString("id-ID")}_`
      ).join("\n\n");

      return ctx.reply(
        `════ 📂 ARTIFACT WORKSPACE ════\n\n` +
        `${listStr}\n\n` +
        `═══════════════════════════════\n` +
        `💡 *Perintah Artifact CLI:*\n` +
        `• \`/artifact open <id>\` - Buka isi artifact\n` +
        `• \`/artifact edit <id> <text>\` - Perbarui isi (+1 versi)\n` +
        `• \`/artifact history <id>\` - Lihat riwayat perubahan\n` +
        `• \`/artifact fork <id>\` - Salin artifact ke dokumen baru\n` +
        `• \`/artifact export <id>\` - Ekspor ke file workspace\n` +
        `• \`/artifact delete <id>\` - Hapus artifact`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      await ctx.reply(`❌ *Artifact Error:* ${err.message}`, { parse_mode: "Markdown" });
    }
  });

  // /skill (RPG Skill System Progression Commands)
  bot.command(["skill", "skills"], async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name || String(userId);
    const payload = ctx.payload.trim();

    try {
      // Auto-seed and load user skills
      const skills = await SkillsManager.getUserSkills(userId);

      if (!payload) {
        const equipped = skills.filter(s => s.is_equipped === 1);
        const unequipped = skills.filter(s => s.is_equipped === 0);

        const eqStr = equipped.length > 0
          ? equipped.map((s, i) => `${i + 1}. *${s.name}* (Lv ${s.level}) [${s.element}] | CD: ${s.cooldown} | Cost: ${s.cost_value} ${s.cost_type.toUpperCase()}`).join("\n")
          : "_Belum ada skill aktif yang dipasang._";

        const uneqStr = unequipped.length > 0
          ? unequipped.map(s => `• *${s.name}* (Lv ${s.level}) [${s.element}] [CD: ${s.cooldown}]`).join("\n")
          : "_Tidak ada skill tidak aktif._";

        return ctx.reply(
          `🛡️ *ELYNISIA PROGRESSION: SKILL SYSTEM*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `⚔️ *Skill Aktif (Equipped - Max 4):*\n` +
          `${eqStr}\n\n` +
          `📦 *Skill Tersimpan (Unequipped):*\n` +
          `${uneqStr}\n\n` +
          `💡 *Perintah Manajemen:*\n` +
          `• Detail: \`/skill info <nama>\`\n` +
          `• Pasang: \`/skill equip <nama>\`\n` +
          `• Lepas: \`/skill unequip <nama>\`\n` +
          `• Upgrade: \`/skill up <nama>\`\n` +
          `• Evolusi: \`/skill evolve <nama>\`\n` +
          `• Skill Tree: \`/skill tree <nama>\`\n` +
          `• Mastery: \`/skill mastery <nama>\``,
          { parse_mode: "Markdown" }
        );
      }

      const parts = payload.split(/\s+/);
      const action = parts[0].toLowerCase();
      const skillTarget = parts.slice(1).join(" ").trim();

      if (action === "equip") {
        if (!skillTarget) return ctx.reply("Format salah. Ketik: `/skill equip <nama_skill>`", { parse_mode: "Markdown" });
        try {
          const res = await SkillsManager.equipSkill(userId, skillTarget);
          return ctx.reply(`✅ *Skill Terpasang!* *${res.name}* kini aktif dalam loadout pertempuran Anda.`, { parse_mode: "Markdown" });
        } catch (err) {
          return ctx.reply(`❌ *Gagal equip:* ${err.message}`, { parse_mode: "Markdown" });
        }
      }

      if (action === "unequip") {
        if (!skillTarget) return ctx.reply("Format salah. Ketik: `/skill unequip <nama_skill>`", { parse_mode: "Markdown" });
        try {
          const res = await SkillsManager.unequipSkill(userId, skillTarget);
          return ctx.reply(`✅ *Skill Dilepas!* *${res.name}* telah dikeluarkan dari loadout aktif Anda.`, { parse_mode: "Markdown" });
        } catch (err) {
          return ctx.reply(`❌ *Gagal unequip:* ${err.message}`, { parse_mode: "Markdown" });
        }
      }

      if (action === "info") {
        if (!skillTarget) return ctx.reply("Format salah. Ketik: `/skill info <nama_skill>`", { parse_mode: "Markdown" });
        const s = await SkillsManager.getSkill(userId, skillTarget);
        if (!s) return ctx.reply("❌ Skill tidak ditemukan.", { parse_mode: "Markdown" });

        const expReq = s.level * 100;
        return ctx.reply(
          `🔮 *INFO SKILL: ${s.name.toUpperCase()}*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `• *Kategori:* \`${s.category.toUpperCase()}\` | *Rarity:* \`${s.rarity}\`\n` +
          `• *Tipe:* \`${s.type.toUpperCase()}\` | *Elemen:* \`${s.element}\`\n` +
          `• *Level:* \`Lv ${s.level}/${s.max_level}\` | *EXP:* \`${s.exp}/${expReq}\`\n` +
          `• *Mastery:* \`${s.mastery}\` (Points: \`${s.mastery_points}\`)\n` +
          `• *Cooldown:* \`${s.cooldown} Turn\`\n` +
          `• *Cost:* \`${s.cost_value} ${s.cost_type.toUpperCase()}\`\n` +
          `• *Evolusi Tahap:* \`Stage ${s.evolution_stage}\` / 4\n` +
          `• *Status Pasang:* \`${s.is_equipped === 1 ? "Equipped" : "Unequipped"}\``,
          { parse_mode: "Markdown" }
        );
      }

      if (action === "up" || action === "upgrade") {
        if (!skillTarget) return ctx.reply("Format salah. Ketik: `/skill up <nama_skill>`", { parse_mode: "Markdown" });
        try {
          const res = await SkillsManager.upgradeSkill(userId, skillTarget);
          return ctx.reply(
            `🌟 *UPGRADE SKILL BERHASIL!*\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `• *Skill:* *${res.skillName}*\n` +
            `• *Level Baru:* *Lv ${res.nextLevel}*\n` +
            `• *Material Digunakan:* 📦 1x *${res.requiredGem}*\n` +
            `• *Biaya Gold:* 🪙 *${res.goldCost} Gold*`,
            { parse_mode: "Markdown" }
          );
        } catch (err) {
          return ctx.reply(`❌ *Upgrade Gagal:* ${err.message}`, { parse_mode: "Markdown" });
        }
      }

      if (action === "evolve") {
        if (!skillTarget) return ctx.reply("Format salah. Ketik: `/skill evolve <nama_skill>`", { parse_mode: "Markdown" });
        try {
          const res = await SkillsManager.evolveSkill(userId, skillTarget);
          return ctx.reply(
            `💥 *EVOLUSI SKILL TERJADI!*\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `Skill *${res.oldName}* Anda telah berevolusi!\n` +
            `✨ *Nama Baru:* *${res.evolvedName}* (Stage ${res.nextStage})\n` +
            `💡 *Kekuatan:* Cooldown dikurangi dan potensi damage/efek meningkat!`,
            { parse_mode: "Markdown" }
          );
        } catch (err) {
          return ctx.reply(`❌ *Evolusi Gagal:* ${err.message}`, { parse_mode: "Markdown" });
        }
      }

      if (action === "tree") {
        if (!skillTarget) return ctx.reply("Format salah. Ketik: `/skill tree <nama_skill>`", { parse_mode: "Markdown" });
        const s = await SkillsManager.getSkill(userId, skillTarget);
        if (!s) return ctx.reply("❌ Skill tidak ditemukan.", { parse_mode: "Markdown" });

        return ctx.reply(
          `🌲 *EVOLUTION SKILL TREE: ${s.name}*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `Stage 1: *${s.skill_key.toUpperCase()}* (Bawaan)\n` +
          `   ↓\n` +
          `Stage 2: *ADVANCED SKILL* (Min. Level 10)\n` +
          `   ↓\n` +
          `Stage 3: *LEGENDARY SKILL* (Min. Level 20)\n` +
          `   ↓\n` +
          `Stage 4: *DIVINE DESTINY* (Min. Level 30)\n\n` +
          `💡 *Status Saat Ini:* Stage *${s.evolution_stage}* (Level ${s.level})\n` +
          `Ketik \`/skill evolve <nama>\` jika level mencukupi untuk melakukan evolusi.`,
          { parse_mode: "Markdown" }
        );
      }

      if (action === "mastery") {
        if (!skillTarget) return ctx.reply("Format salah. Ketik: `/skill mastery <nama_skill>`", { parse_mode: "Markdown" });
        const s = await SkillsManager.getSkill(userId, skillTarget);
        if (!s) return ctx.reply("❌ Skill tidak ditemukan.", { parse_mode: "Markdown" });

        const ranks = [
          "Novice (Points: 0)",
          "Beginner (Points: 10)",
          "Intermediate (Points: 30)",
          "Advanced (Points: 60)",
          "Expert (Points: 100)",
          "Master (Points: 150)",
          "Grandmaster (Points: 220)",
          "Legend (Points: 300)",
          "Mythic (Points: 400)",
          "Transcendent (Points: 500)"
        ];

        return ctx.reply(
          `🏆 *MASTERY PROGRESSION: ${s.name}*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `• *Peringkat Mastery Anda:* *${s.mastery}*\n` +
          `• *Total Poin Penggunaan:* \`${s.mastery_points} Poin\`\n\n` +
          `*Jalur Mastery:* \n` +
          ranks.map(r => r.startsWith(s.mastery) ? `✨ *${r}* (Aktif)` : `• ${r}`).join("\n") + `\n\n` +
          `💡 *Info:* Setiap kali Anda menggunakan skill di Battle Tower, Poin Mastery Anda bertambah +1.`,
          { parse_mode: "Markdown" }
        );
      }

      return ctx.reply("Subcommand tidak dikenal. Gunakan `/skill equip`, `/skill unequip`, `/skill info`, `/skill up`, `/skill evolve`, `/skill tree`, atau `/skill mastery`.");
    } catch (err) {
      return ctx.reply(`❌ *Terjadi Kesalahan:* ${err.message}`);
    }
  });

  // /shop (with subcommands /shop buy and /shop sell)
  bot.command("shop", async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name || String(userId);
    const payload = ctx.payload.trim();

    if (!payload) {
      try {
        const economy = await getOrCreateUserEconomy(userId, username);
        const db = await getGlobalDB();
        const listings = await db.all("SELECT * FROM shop_listings");

        let listingsStr = "_Belum ada barang komunitas yang dijual._";
        if (listings.length > 0) {
          listingsStr = listings.map(l => 
            `• *ID:* \`${l.id}\` | Penjual: @${l.seller_username} | *${l.item_name}* (x${l.quantity}) | Harga: \`${l.price}\` ${l.currency === "gems" ? "💎" : (l.currency === "gold" ? "🪙" : "🥈")}`
          ).join("\n");
        }

        const dailySkills = SkillsManager.getDailySkills();
        const dailySkillsStr = dailySkills.map(s => 
          `• *ID:* \`sys_skill_${s.skill_key}\` | *${s.name}* [${s.element}] | Rarity: *${s.rarity}* | Harga: 🪙 *${s.price} Gold*\n` +
          `  Ketik: \`/shop buy sys_skill_${s.skill_key}\``
        ).join("\n");

        return ctx.reply(
          `🏪 *ELYNISIA SHOP SYSTEM*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `🎟 *PAKET RECHARGE TOKEN (SYSTEM SHOP)*\n` +
          `• *ID:* \`sys_gems\` | \`1.500.000 Token\` -> 💎 *1 Gems*\n` +
          `  Ketik: \`/shop buy sys_gems\`\n` +
          `• *ID:* \`sys_gold\` | \`500.000 Token\` -> 🪙 *50 Gold*\n` +
          `  Ketik: \`/shop buy sys_gold\`\n\n` +
          `🌐 *PORT WORKSPACE (SYSTEM SHOP)*\n` +
          `• *ID:* \`sys_port_gems\` | \`1 Port Workspace\` -> 💎 *1 Gems*\n` +
          `  Ketik: \`/shop buy sys_port_gems\`\n` +
          `• *ID:* \`sys_port_gold\` | \`1 Port Workspace\` -> 🪙 *10 Gold*\n` +
          `  Ketik: \`/shop buy sys_port_gold\`\n\n` +
          `✨ *DAILY RANDOM SKILLS (ROTASI HARIAN)*\n` +
          `${dailySkillsStr}\n\n` +
          `🛍 *DAGANGAN KOMUNITAS (PLAYER SHOP)*\n` +
          `${listingsStr}\n\n` +
          `💡 *Cara Berinteraksi:*\n` +
          `• Untuk membeli: \`/shop buy <id_listing>\`\n` +
          `• Untuk menjual: \`/shop sell <id_item_inventory> <jumlah> <harga> <gems|gold|silver>\`\n` +
          `• Dompet Anda: 💎 ${economy.gems} Gems | 🪙 ${economy.gold} Gold | 🥈 ${economy.silver} Silver | Batas Port: ${economy.ports_limit || 1}`,
          { parse_mode: "Markdown" }
        );
      } catch (err) {
        return ctx.reply(`❌ Gagal memuat shop: ${err.message}`);
      }
    }

    const parts = payload.split(/\s+/);
    const action = parts[0].toLowerCase();

    if (action === "buy") {
      const targetId = parts[1];
      if (!targetId) {
        return ctx.reply("Format salah. Gunakan: `/shop buy <id_listing>`", { parse_mode: "Markdown" });
      }

      try {
        if (targetId === "sys_gems" || targetId === "sys_gold" || targetId === "sys_port_gems" || targetId === "sys_port_gold" ||
            targetId === "sys_ram_gold" || targetId === "sys_ram_gems" || targetId === "sys_disk_gold" || targetId === "sys_disk_gems") {
          const res = await buySystemTokens(userId, targetId);
          if (typeof res === "number") {
            return ctx.reply(`✅ *Pembelian Berhasil!*\nToken Anda telah terisi sebanyak *+${res.toLocaleString()} Token*.`, { parse_mode: "Markdown" });
          } else if (res.type === "port") {
            return ctx.reply(`✅ *Pembelian Berhasil!*\nBatas port workspace Anda bertambah menjadi *${res.newLimit} Port* 🌐.`, { parse_mode: "Markdown" });
          } else if (res.type === "ram") {
            return ctx.reply(`✅ *Upgrade RAM Berhasil!*\nLimit RAM container Anda sekarang *${res.newLimit} MB* 🧠.\nCek status: \`/constatus\``, { parse_mode: "Markdown" });
          } else if (res.type === "disk") {
            return ctx.reply(`✅ *Upgrade Disk Berhasil!*\nLimit Disk container Anda sekarang *${res.newLimit} MB* 💾.\nCek status: \`/constatus\``, { parse_mode: "Markdown" });
          }
        } else if (targetId.startsWith("sys_skill_")) {
          const skillKey = targetId.substring("sys_skill_".length);
          const res = await SkillsManager.buyDailySkill(userId, skillKey);
          return ctx.reply(`✅ *Pembelian Berhasil!*\nAnda telah membeli skill *${res.name}* [${res.element}] seharga 🪙 *${res.price} Gold*.\n💡 Pasang skill ini melalui \`/skill equip ${res.name}\`.`, { parse_mode: "Markdown" });
        } else {
          const listingId = parseInt(targetId);
          if (isNaN(listingId)) throw new Error("ID listing harus berupa angka.");

          const res = await buyShopItem(userId, username, listingId);
          return ctx.reply(
            `✅ *Pembelian Toko Berhasil!*\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `• *Barang:* *${res.itemName}* (x${res.quantity})\n` +
            `• *Harga:* \`${res.price}\` ${res.currency.toUpperCase()}\n` +
            `• *Status:* Telah dipindahkan ke /inventory Anda.`,
            { parse_mode: "Markdown" }
          );
        }
      } catch (err) {
        return ctx.reply(`❌ *Pembelian Gagal:* ${err.message}`, { parse_mode: "Markdown" });
      }
    } else if (action === "sell") {
      const itemId = parseInt(parts[1]);
      const qty = parseInt(parts[2]);
      const price = parseInt(parts[3]);
      const currency = parts[4];

      if (isNaN(itemId) || isNaN(qty) || isNaN(price) || !currency) {
        return ctx.reply("Format salah. Gunakan: `/shop sell <id_item_inventory> <jumlah> <harga> <gems|gold|silver>`", { parse_mode: "Markdown" });
      }

      try {
        const itemName = await sellItemInShop(userId, username, itemId, qty, price, currency);
        return ctx.reply(
          `✅ *Barang Berhasil Dipajang!*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `• *Barang:* *${itemName}* (x${qty})\n` +
          `• *Harga:* \`${price}\` ${currency.toUpperCase()}\n` +
          `• *Status:* Ditambahkan ke player shop. Ketik \`/shop\` untuk melihat listing.`,
          { parse_mode: "Markdown" }
        );
      } catch (err) {
        return ctx.reply(`❌ *Gagal Menjual:* ${err.message}`, { parse_mode: "Markdown" });
      }
    } else {
      return ctx.reply("Aksi tidak dikenal. Gunakan `/shop buy` atau `/shop sell`.");
    }
  });

  // /convert
  bot.command("convert", async (ctx) => {
    const userId = ctx.from.id;
    const payload = ctx.payload.trim().split(/\s+/);

    if (payload.length < 2 || !payload[0] || !payload[1]) {
      return ctx.reply(
        `💡 *Konversi Mata Uang*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `Format: \`/convert <gems|gold|silver|gold_to_gems> <jumlah>\`\n\n` +
        `Aturan Konversi:\n` +
        `• \`gems\` -> 1 Gems = 100 Gold\n` +
        `• \`gold\` -> 1 Gold = 100 Silver\n` +
        `• \`silver\` -> 100 Silver = 1 Gold\n` +
        `• \`gold_to_gems\` -> 100 Gold = 1 Gems`,
        { parse_mode: "Markdown" }
      );
    }

    const type = payload[0].toLowerCase();
    const amount = parseInt(payload[1]);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply("Jumlah konversi harus angka positif.");
    }

    try {
      let typeCode = type;
      if (type === "gems") typeCode = "gems_to_gold";
      else if (type === "gold") typeCode = "gold_to_silver";
      else if (type === "silver") typeCode = "silver_to_gold";

      await convertUserCurrency(userId, typeCode, amount);
      return ctx.reply(`✅ *Konversi Berhasil!* Silakan cek saldo terbaru Anda di \`/inventory\`.`, { parse_mode: "Markdown" });
    } catch (err) {
      return ctx.reply(`❌ *Konversi Gagal:* ${err.message}`, { parse_mode: "Markdown" });
    }
  });

  // /barter (alias /ba)
  bot.command(["barter", "ba"], async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name || String(userId);
    const payload = ctx.payload.trim();

    if (!payload || payload.toLowerCase() === "list") {
      try {
        const db = await getGlobalDB();
        const barters = await db.all("SELECT * FROM barter_offers WHERE status = 'open' OR status = 'offered'");
        
        let barterStr = "_Belum ada barter aktif yang dibuka._";
        if (barters.length > 0) {
          barterStr = barters.map(b => 
            `• *ID:* \`${b.id}\` | Pemilik: @${b.creator_username}\n` +
            `  Menawarkan: *${b.offered_item}* | Status: \`${b.status.toUpperCase()}\``
          ).join("\n\n");
        }

        return ctx.reply(
          `🤝 *BARTER / TRADING HUB*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `${barterStr}\n\n` +
          `💡 *Cara Berinteraksi:*\n` +
          `• Buka barter baru: \`/ba open <id_inventory_item|uang>\` (Contoh: \`/ba open 1\` atau \`/ba open 10 gold\`)\n` +
          `• Tawarkan barter: \`/ba <id_barter> <id_inventory_item|uang>\` (Contoh: \`/ba username-XXXXX gold 1\`)\n` +
          `• Batalkan barter Anda: \`/ba cancel <id_barter>\``,
          { parse_mode: "Markdown" }
        );
      } catch (err) {
        return ctx.reply(`❌ Gagal memuat barter: ${err.message}`);
      }
    }

    const parts = payload.split(/\s+/);
    const action = parts[0].toLowerCase();

    if (action === "open") {
      const offerStr = parts.slice(1).join(" ");
      if (!offerStr) {
        return ctx.reply("Format salah. Gunakan: `/ba open <id_inventory_item|uang>`", { parse_mode: "Markdown" });
      }

      try {
        const res = await openBarterOffer(userId, username, offerStr);
        return ctx.reply(
          `🤝 *Barter Diopen!*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `• *Barter ID:* \`${res.barterId}\`\n` +
          `• *Item/Uang Ditawarkan:* *${res.offerName}*\n\n` +
          `💡 User lain sekarang bisa menawar menggunakan perintah:\n` +
          `\`/ba ${res.barterId} <id_item|uang>\``,
          { parse_mode: "Markdown" }
        );
      } catch (err) {
        return ctx.reply(`❌ *Gagal Membuka Barter:* ${err.message}`, { parse_mode: "Markdown" });
      }
    } else if (action === "cancel") {
      const barterId = parts[1];
      if (!barterId) {
        return ctx.reply("Format salah. Gunakan: `/ba cancel <id_barter>`", { parse_mode: "Markdown" });
      }

      try {
        await cancelBarterOffer(barterId, userId);
        return ctx.reply(`✅ *Barter ID* \`${barterId}\` telah berhasil dibatalkan dan semua item/uang dikembalikan.`, { parse_mode: "Markdown" });
      } catch (err) {
        return ctx.reply(`❌ *Gagal Membatalkan Barter:* ${err.message}`, { parse_mode: "Markdown" });
      }
    } else {
      const barterId = parts[0];
      const bidStr = parts.slice(1).join(" ");

      if (!barterId || !bidStr) {
        return ctx.reply("Format salah. Gunakan: \`/ba <id_barter> <id_item_inventory|uang>\`", { parse_mode: "Markdown" });
      }

      try {
        const res = await proposeBarterBid(userId, username, barterId, bidStr);
        
        await ctx.reply(
          `📬 *Barter telah dikirim, menunggu diterima*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `• *Barter ID:* \`${barterId}\`\n` +
          `• *Penawaran Anda:* \`${res.bidderOffer}\``,
          { parse_mode: "Markdown" }
        );

        await bot.telegram.sendMessage(
          res.creatorId,
          `🤝 *PENAWARAN BARTER MASUK!*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `Seseorang telah menawarkan barter pada barter ID Anda: \`${barterId}\`\n\n` +
          `• *Barter ID:* \`${barterId}\`\n` +
          `• *Barang Anda:* \`${res.offeredItem}\`\n` +
          `• *Penawaran @${username}:* \`${res.bidderOffer}\`\n\n` +
          `Apakah Anda ingin menerima penawaran barter ini?`,
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "✅ Terima", callback_data: `ba_accept:${barterId}` },
                  { text: "❌ Tolak", callback_data: `ba_decline:${barterId}` }
                ]
              ]
            }
          }
        );
      } catch (err) {
        return ctx.reply(`❌ *Gagal Menawar Barter:* ${err.message}`, { parse_mode: "Markdown" });
      }
    }
  });

  bot.command("premium", async (ctx) => {
    return ctx.reply("💎 *ELYNSIA PREMIUM STORE*\n\nGunakan Gems kamu untuk membeli fitur VIP!\n\n1. *VIP Role* (Akses fitur admin/developer lebih luas) - 50.000 Gems\n   Ketik: `/buy vip`\n\n2. *100.000 AI Tokens* (Untuk interaksi Agent) - 10.000 Gems\n   Ketik: `/buy tokens`", { parse_mode: "Markdown" });
  });

  bot.command("buy", async (ctx) => {
    const userId = ctx.from.id;
    const item = (ctx.payload || "").trim().toLowerCase();
    
    if (item === "vip") {
      const { getOrCreateUserEconomy } = await import("../core/economy.js");
      const economy = await getOrCreateUserEconomy(userId);
      if ((economy.gems || 0) < 50000) return ctx.reply("❌ Gems tidak cukup! Topup dulu menggunakan `/topup`");
      const db = await getUserDB(userId);
      await db.run("UPDATE economy SET gems = gems - 50000 WHERE id = 1");
      await setUserRole(userId, "vip");
      return ctx.reply("🎉 *SELAMAT!* Kamu sekarang adalah member *VIP* Elynisia!\nAkses eksklusif fitur premium telah terbuka.", { parse_mode: "Markdown" });
    } else if (item === "tokens") {
      const { getOrCreateUserEconomy } = await import("../core/economy.js");
      const economy = await getOrCreateUserEconomy(userId);
      if ((economy.gems || 0) < 10000) return ctx.reply("❌ Gems tidak cukup! Topup dulu menggunakan `/topup`");
      const db = await getUserDB(userId);
      await db.run("UPDATE economy SET gems = gems - 10000, tokens = tokens + 100000 WHERE id = 1");
      return ctx.reply("🎉 *100.000 AI Tokens* berhasil ditambahkan ke akunmu!");
    } else {
      return ctx.reply("Gunakan: `/buy vip` atau `/buy tokens`");
    }
  });

  bot.command("support", async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || "User";
    const msg = (ctx.payload || "").trim();
    
    if (!msg) return ctx.reply("Gunakan: `/support <keluhan/pesan kamu>`\nContoh: `/support Min, topup saya belum masuk.`", { parse_mode: "Markdown" });
    
    const adminId = process.env.OWNER_ID; 
    if (!adminId) return ctx.reply("❌ Fitur support belum dikonfigurasi (OWNER_ID kosong di .env).");
    
    try {
      await bot.telegram.sendMessage(adminId, `🎫 *TICKET BARU* [#${userId}]\nDari: @${username}\n\nPesan:\n${msg}`, { parse_mode: "Markdown" });
      return ctx.reply("✅ Pesan keluhanmu telah dikirim ke Customer Support (Admin). Mohon tunggu balasannya ya!");
    } catch (err) {
      return ctx.reply("❌ Gagal mengirim tiket ke admin. Pastikan admin pernah chat dengan bot ini sebelumnya.");
    }
  });

  // /setmenuurl
  bot.command("setmenuurl", async (ctx) => {
    const userId = ctx.from.id;
    const role = await getUserRole(userId);
    if (role !== "owner" && role !== "admin") return ctx.reply("❌ Khusus Admin/Owner.");
    const url = (ctx.payload || "").trim();
    if (!url) return ctx.reply("Gunakan: `/setmenuurl <url>`", { parse_mode: "Markdown" });
    
    try {
      const os = await import("os");
      const downloadDir = path.join(os.homedir(), "storage", "downloads");
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      }
      const filePath = path.join(downloadDir, "elynisia_menu.jpg");
      
      const replyMsg = await ctx.reply("⏳ Mendownload gambar...");
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const buffer = await response.arrayBuffer();
      fs.writeFileSync(filePath, Buffer.from(buffer));
      
      const db = await getGlobalDB();
      await db.run("INSERT OR REPLACE INTO settings (key, val) VALUES (?, ?)", ["menu_url", filePath]);
      return ctx.telegram.editMessageText(ctx.chat.id, replyMsg.message_id, undefined, "✅ Gambar menu berhasil diunduh ke folder download dan diatur! Silakan ketik /help.");
    } catch (err) {
      return ctx.reply(`❌ Gagal mengatur menu: ${err.message}`);
    }
  });

  // /reset command
  bot.command("reset", async (ctx) => {
    const userId = ctx.from.id;
    const db = await getUserDB(userId);
    await db.run("DELETE FROM messages");
    return ctx.reply("Memori chat telah direset.");
  });

  // --- ACCOUNT & SERVER COMMANDS ---
  bot.command("register", async (ctx) => {
    const userId = ctx.from.id;
    const args = (ctx.payload || "").trim().split(/\s+/);
    if (args.length < 2) return ctx.reply("Gunakan: `/register <nama> <password>`\nContoh: `/register Budi Rahasia123`", { parse_mode: "Markdown" });
    
    const [username, password] = args;
    try {
      const { registerAccount } = await import("../core/accounts.js");
      const accountId = await registerAccount(userId, username, password);
      return ctx.reply(`✅ *REGISTRASI BERHASIL!*\n\nHalo ${username}, Akun kamu telah dibuat.\n🔑 *Account ID kamu:* \`${accountId}\`\n(Simpan ID ini baik-baik untuk login di perangkat/akun Telegram lain).`, { parse_mode: "Markdown" });
    } catch (err) {
      return ctx.reply(`❌ Gagal registrasi: ${err.message}`);
    }
  });

  bot.command("login", async (ctx) => {
    const userId = ctx.from.id;
    const args = (ctx.payload || "").trim().split(/\s+/);
    if (args.length < 2) return ctx.reply("Gunakan: `/login <account_id> <password>`\nContoh: `/login 1 Rahasia123`", { parse_mode: "Markdown" });
    
    const [accountId, password] = args;
    try {
      const { loginAccount } = await import("../core/accounts.js");
      const account = await loginAccount(userId, accountId, password);
      return ctx.reply(`✅ *LOGIN BERHASIL!*\n\nSelamat datang kembali, *${account.username}*! Akun Telegram ini sekarang terikat dengan Account ID \`${accountId}\`.`, { parse_mode: "Markdown" });
    } catch (err) {
      return ctx.reply(`❌ Gagal login: ${err.message}`);
    }
  });

  bot.command("server", async (ctx) => {
    const userId = ctx.from.id;
    const args = (ctx.payload || "").trim().split(/\s+/);
    const subCommand = args[0] ? args[0].toLowerCase() : "";

    try {
      const { addPrivateServer, switchServerMode, getActiveServerConfig } = await import("../core/accounts.js");

      if (subCommand === "connect") {
        if (args.length < 4) return ctx.reply("Gunakan: `/server connect <url> <apikey> <nama_server>`\nContoh: `/server connect http://192.168.1.5:3000/v5 rahasia123 MyPC`", { parse_mode: "Markdown" });
        const url = args[1];
        const apiKey = args[2];
        const serverName = args[3].substring(0, 10); // Max 10 huruf
        await addPrivateServer(userId, url, apiKey, serverName);
        return ctx.reply(`✅ Private Server *${serverName}* berhasil didaftarkan!\n\nKetik \`/server switch ${serverName}\` untuk memindahkan pemrosesan AI ke server kamu.`, { parse_mode: "Markdown" });
      } 
      else if (subCommand === "guide") {
        const guideText = `🎓 *PANDUAN MEMBUAT PRIVATE SERVER AI SENDIRI*\n\n` +
          `Dengan ini, kamu bisa memindahkan "Otak AI" bot ini ke PC atau Laptop kamu sendiri. Ini membuat pemrosesan pesan lebih aman dan terpisah dari server pusat!\n\n` +
          `*Langkah Instalasi:*\n` +
          `1. Download file \`server.zip\` yang aku kirimkan di bawah ini.\n` +
          `2. Ekstrak (Unzip) file tersebut di Komputer/VPS kamu.\n` +
          `3. Buka Terminal/CMD di folder tersebut dan ketik: \`npm install\`\n` +
          `4. Setelah selesai, jalankan: \`node server.js\`\n` +
          `5. Ikuti *Setup Wizard* di layarmu (Masukkan Port & Gemini API Key).\n` +
          `6. Setelah servermu menyala, salin pesan di bawah ini dan kirim ke aku untuk menghubungkan akun Telegram-mu ke komputermu:\n\n` +
          `\`/server connect http://<IP_KOMPUTER_KAMU>:<PORT>/v5 <PASSWORD_YANG_KAMU_BUAT> MyPrivateNode\``;
        
        await ctx.reply(guideText, { parse_mode: "Markdown" });
        
        try {
          const fs = await import("fs");
          const path = await import("path");
          const { fileURLToPath } = await import("url");
          const __dirname = path.dirname(fileURLToPath(import.meta.url));
          const zipPath = path.join(__dirname, "..", "dist", "server.zip");
          
          if (fs.existsSync(zipPath)) {
            await ctx.replyWithDocument({ source: zipPath, filename: "Elynisia_Private_Server.zip" });
          } else {
            await ctx.reply("❌ File server.zip belum di-compile oleh Admin. Hubungi CEO.");
          }
        } catch (err) {
           console.error(err);
        }
        return;
      }
      else if (subCommand === "list") {
        const config = await getActiveServerConfig(userId);
        let msg = `🌐 *DAFTAR SERVER KAMU*\n\n1. *Global Server* (Elynisia Cloud)${config.mode === "global" ? " 🟢(Aktif)" : ""}\n`;
        if (config.name) {
          msg += `2. *${config.name}* (Private Server)${config.mode === "private" ? " 🟢(Aktif)" : ""}\n   URL: \`${config.url}\``;
        } else {
          msg += `\nKamu belum mendaftarkan Private Server.`;
        }
        return ctx.reply(msg, { parse_mode: "Markdown" });
      }
      else if (subCommand === "switch") {
        const target = args[1];
        if (!target) return ctx.reply("Gunakan: `/server switch <global/nama_server>`", { parse_mode: "Markdown" });
        const mode = await switchServerMode(userId, target);
        return ctx.reply(`🔄 Koneksi dialihkan ke: *${mode === 'global' ? 'Global Server' : target}*`, { parse_mode: "Markdown" });
      } 
      else {
        return ctx.reply("Daftar Perintah Server:\n- `/server connect <url> <apikey> <nama>`\n- `/server list`\n- `/server switch <nama|global>`", { parse_mode: "Markdown" });
      }
    } catch (err) {
      return ctx.reply(`❌ Server Error: ${err.message}`);
    }
  });

  // Admin testing commands
  bot.command("giveitem", async (ctx) => {
    const userId = ctx.from.id;
    const role = await getUserRole(userId);
    if (role !== "owner" && role !== "admin") {
      return ctx.reply("❌ Perintah ini hanya untuk Admin/Owner.");
    }

    const args = ctx.payload.trim().split(/\s+/);
    if (args.length < 2) {
      return ctx.reply("Format: `/giveitem <userId> <nama_item> [jumlah]`", { parse_mode: "Markdown" });
    }

    const targetUser = args[0];
    const itemName = args.slice(1, args.length - 1).join(" ") || args[1];
    const lastArg = parseInt(args[args.length - 1]);
    let qty = 1;
    let finalItemName = itemName;
    
    if (!isNaN(lastArg)) {
      qty = lastArg;
      if (args.length > 2) {
        finalItemName = args.slice(1, args.length - 1).join(" ");
      }
    } else {
      finalItemName = args.slice(1).join(" ");
    }

    try {
      await giveItemToUser(targetUser, finalItemName, qty);
      return ctx.reply(`✅ Berhasil memberikan item *${finalItemName}* (x${qty}) ke user ID \`${targetUser}\`.`, { parse_mode: "Markdown" });
    } catch (err) {
      return ctx.reply(`❌ Gagal memberikan item: ${err.message}`);
    }
  });

  bot.command("givemoney", async (ctx) => {
    const userId = ctx.from.id;
    const role = await getUserRole(userId);
    if (role !== "owner" && role !== "admin") {
      return ctx.reply("❌ Perintah ini hanya untuk Admin/Owner.");
    }

    const args = ctx.payload.trim().split(/\s+/);
    if (args.length < 3) {
      return ctx.reply("Format: `/givemoney <userId> <gems|gold|silver> <jumlah>`", { parse_mode: "Markdown" });
    }

    const targetUser = args[0];
    const currency = args[1];
    const amount = parseInt(args[2]);

    if (isNaN(amount) || amount <= 0) {
      return ctx.reply("Jumlah harus angka positif.");
    }

    try {
      await giveMoneyToUser(targetUser, currency, amount);
      return ctx.reply(`✅ Berhasil menambahkan \`${amount}\` ${currency.toUpperCase()} ke user ID \`${targetUser}\`.`, { parse_mode: "Markdown" });
    } catch (err) {
      return ctx.reply(`❌ Gagal memberikan uang: ${err.message}`);
    }
  });

  // Callback query handler for inline button actions (barter accept/decline)
  bot.on("callback_query", async (ctx) => {
    const callbackData = ctx.callbackQuery.data;
    const userId = ctx.from.id;
    const username = ctx.from.username || ctx.from.first_name || String(userId);

    if (callbackData.startsWith("ba_accept:")) {
      const barterId = callbackData.split(":")[1];
      try {
        const barter = await getGlobalDB().then(db => db.get("SELECT * FROM barter_offers WHERE id = ?", [barterId]));
        if (!barter) {
          return ctx.answerCbQuery("❌ Barter tidak ditemukan.", { show_alert: true });
        }
        if (String(barter.creator_id) !== String(userId)) {
          return ctx.answerCbQuery("❌ Hanya pemilik barter yang dapat menyetujui penawaran ini.", { show_alert: true });
        }

        const res = await acceptBarterDeal(barterId);
        await ctx.answerCbQuery("✅ Barter diterima!");
        await ctx.editMessageText(
          `✅ *Barter Berhasil Disetujui!*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `• *Barter ID:* \`${barterId}\`\n` +
          `• *Penerima:* @${res.bidderUsername}\n` +
          `• *Pertukaran:* \`${res.offeredItem}\` ⇆ \`${res.bidderOffer}\``,
          { parse_mode: "Markdown" }
        );

        await bot.telegram.sendMessage(
          res.bidderId,
          `🎉 *KABAR BAIK!*\n` +
          `Penawaran barter Anda pada ID \`${barterId}\` telah *DITERIMA* oleh @${barter.creator_username}!\n` +
          `Pertukaran \`${res.bidderOffer}\` dengan \`${res.offeredItem}\` telah diselesaikan secara otomatis. Check /inventory Anda!`,
          { parse_mode: "Markdown" }
        );
      } catch (err) {
        await ctx.answerCbQuery(`❌ Error: ${err.message}`, { show_alert: true });
      }
    } else if (callbackData.startsWith("ba_decline:")) {
      const barterId = callbackData.split(":")[1];
      try {
        const barter = await getGlobalDB().then(db => db.get("SELECT * FROM barter_offers WHERE id = ?", [barterId]));
        if (!barter) {
          return ctx.answerCbQuery("❌ Barter tidak ditemukan.", { show_alert: true });
        }
        if (String(barter.creator_id) !== String(userId)) {
          return ctx.answerCbQuery("❌ Hanya pemilik barter yang dapat menolak penawaran ini.", { show_alert: true });
        }

        const res = await declineBarterDeal(barterId);
        await ctx.answerCbQuery("❌ Penawaran ditolak!");
        await ctx.editMessageText(
          `❌ *Penawaran Barter Ditolak*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `Penawaran dari @${res.bidderUsername} telah ditolak. Barter ID \`${barterId}\` kini terbuka kembali untuk penawaran lain.`,
          { parse_mode: "Markdown" }
        );

        await bot.telegram.sendMessage(
          res.bidderId,
          `❌ *KABAR DUKA!*\n` +
          `Penawaran barter Anda pada ID \`${barterId}\` telah *DITOLAK* oleh @${res.creator_username}.\n` +
          `Item/uang yang Anda tawarkan telah dikembalikan ke saldo/inventory Anda.`,
          { parse_mode: "Markdown" }
        );
      } catch (err) {
        await ctx.answerCbQuery(`❌ Error: ${err.message}`, { show_alert: true });
      }
    }
  });

  // 3. User State Machine / Message Handler (Text, Photos, Audio, Document)
  bot.on("message", async (ctx) => {
    // Mode Grup Kolaborasi (Hanya proses jika bot di-tag atau direply)
    if (ctx.chat.type === "group" || ctx.chat.type === "supergroup") {
      const isMentioned = ctx.message.text && ctx.botInfo && ctx.message.text.includes(`@${ctx.botInfo.username}`);
      const isReplyToBot = ctx.message.reply_to_message && ctx.botInfo && ctx.message.reply_to_message.from.username === ctx.botInfo.username;
      
      if (!isMentioned && !isReplyToBot) {
        return; // Abaikan pesan grup yang tidak ditujukan ke bot
      }
    }

    const userId = ctx.from.id;
    let text = ctx.message.text || ctx.message.caption || "";
    
    // Admin Ticketing Reply System
    if (ctx.message.reply_to_message && String(userId) === String(process.env.OWNER_ID)) {
      const repliedText = ctx.message.reply_to_message.text || ctx.message.reply_to_message.caption || "";
      if (repliedText.includes("🎫 *TICKET BARU* [#") || repliedText.includes("TICKET BARU")) {
        const match = repliedText.match(/\[#(\d+)\]/);
        if (match && match[1]) {
          const targetUserId = match[1];
          if (text) {
             await bot.telegram.sendMessage(targetUserId, `👨‍💻 *BALASAN CUSTOMER SUPPORT*\n\n${text}`, { parse_mode: "Markdown" }).catch(() => {});
             return ctx.reply("✅ Balasan terkirim ke user!");
          }
        }
      }
    }
    
    let contentArray = [];

    if (text) {
      contentArray.push({ type: "text", text: text });
    }

    if (ctx.message.photo) {
      const photo = ctx.message.photo[ctx.message.photo.length - 1]; // Highest resolution
      try {
        const fileLink = await ctx.telegram.getFileLink(photo.file_id);
        if (!text) {
            text = "User attached an image.";
            contentArray.push({ type: "text", text: text });
        }
        contentArray.push({
          type: "image_url",
          image_url: { url: fileLink.href }
        });
      } catch (err) {
        console.error("Gagal get image link:", err);
      }
    }

    if (ctx.message.voice || ctx.message.audio || ctx.message.document) {
      try {
        const fileObj = ctx.message.voice || ctx.message.audio || ctx.message.document;
        const fileId = fileObj.file_id;
        let fileName = fileObj.file_name || `file_${Date.now()}`;
        if (ctx.message.voice && !fileName.endsWith('.ogg')) fileName += '.ogg';

        const fileLink = await ctx.telegram.getFileLink(fileId);
        
        // Simpan file ke workspace lokal agar AI bisa baca langsung
        const root = getUserWorkspaceRoot(userId);
        const filePath = path.join(root, fileName);
        
        const response = await fetch(fileLink.href);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(filePath, Buffer.from(buffer));
        
        const attachInfo = `\n[File Terlampir: "${fileName}" berhasil disimpan di workspace lokal pada direktori "Workspaces/${userId}/${fileName}". Jangan gunakan tool web fetch untuk URL telegram. Langsung saja gunakan tool file system seperti view_file, shell_exec, atau read_file ke file lokal tersebut.]`;
        
        if (contentArray.length > 0 && contentArray[0].type === "text") {
          contentArray[0].text += attachInfo;
          text += attachInfo;
        } else {
          text = `User mengirimkan file bernama "${fileName}". File ini telah disimpan di komputer lokal pada direktori "Workspaces/${userId}/${fileName}". Silakan akses file tersebut secara langsung menggunakan tool sistem file (misal: baca isi file dengan perintah shell/cat/view_file), jangan coba mengambilnya menggunakan HTTP/Web fetch.`;
          contentArray.push({ type: "text", text: text });
        }
      } catch (err) {
        console.error("Gagal mendownload dan memproses file:", err);
      }
    }

    text = text.trim();
    if (!text && contentArray.length === 0) return; // ignore if totally empty

    // We will use finalContent to pass to taskManager
    const finalContent = contentArray.length > 1 ? contentArray : text;

    // Check wizard state machine (only if text is present and it's a simple string, but we can just use `text`)
    const stateObj = userStates.get(String(userId));
    if (stateObj) {
      if (stateObj.state === "waiting_role_name") {
        stateObj.roleName = text;
        stateObj.state = "waiting_role_limit";
        userStates.set(String(userId), stateObj);
        return ctx.reply("limit");
      } else if (stateObj.state === "waiting_role_limit") {
        const isLimitOn = text.toLowerCase() === "on";
        const roleName = stateObj.roleName;
        
        await setCustomRoleLimit(roleName, isLimitOn);
        userStates.delete(String(userId));
        return ctx.reply(`Custom role *${roleName}* created with limit *${isLimitOn ? "on" : "off"}*`, {
          parse_mode: "Markdown",
        });
      }
    }

    // Check if it is a Workspace Shell command
    if (text.startsWith("$")) {
      const cmdLine = text.substring(1).trim();
      if (!cmdLine) {
        const root = getUserWorkspaceRoot(userId);
        const cwd = getUserCwd(userId);
        const relCwd = path.relative(root, cwd) || ".";
        return ctx.reply(`💻 Workspace Shell aktif. CWD: \`${relCwd}\`\nContoh: \`$ls\`, \`$cd folder\`, \`$node app.js\``, { parse_mode: "Markdown" });
      }

      try {
        // Security checks (Bypass for Owner/Private Server Host)
        const isOwner = String(userId) === String(process.env.OWNER_ID);
        const lower = cmdLine.toLowerCase();
        
        if (!isOwner) {
          if (lower.includes("/etc") || lower.includes("/sys") || lower.includes("/proc") || lower.includes("/usr") || lower.includes("/dev")) {
            throw new Error("Akses ditolak: Dilarang mengakses direktori sistem.");
          }
          if (lower.includes("rm") && (lower.includes("-rf") || lower.includes("-f") || lower.includes("-r"))) {
            if (lower.includes("/") && !lower.includes(`workspaces/${userId}`) && !lower.includes("./")) {
              throw new Error("Akses ditolak: Dilarang menghapus file di luar folder workspace Anda.");
            }
          }
        }

        // Handle $cd as stateful command
        if (lower.startsWith("cd")) {
          const parts = cmdLine.split(/\s+/).slice(1);
          const target = parts.join(" ") || "";
          if (!target || target === "~" || target === "/") {
            // cd tanpa argumen atau cd ~ -> kembali ke root workspace
            resetUserCwd(userId);
            const root = getUserWorkspaceRoot(userId);
            return ctx.reply(`📂 *Kembali ke root workspace:* \`Workspaces/${userId}\``, { parse_mode: "Markdown" });
          }
          const res = setUserCwd(userId, target);
          if (!res.ok) return ctx.reply(res.error, { parse_mode: "Markdown" });
          return ctx.reply(`📂 *Direktori diubah ke:* \`${res.relPath}\``, { parse_mode: "Markdown" });
        }

        // Ensure workspace dir exists
        const userWorkspaceDir = getUserCwd(userId);
        const root = getUserWorkspaceRoot(userId);

        // Auto-initialize package.json in workspace if user runs npm command and no package.json exists locally
        if (lower.startsWith("npm")) {
          const pkgPath = path.join(userWorkspaceDir, "package.json");
          const rootPkgPath = path.join(root, "package.json");
          if (!fs.existsSync(pkgPath) && !fs.existsSync(rootPkgPath)) {
            const defaultPkg = {
              name: `workspace-user-${userId}`,
              version: "1.0.0",
              private: true,
              description: "User isolated workspace",
              dependencies: {}
            };
            fs.writeFileSync(pkgPath, JSON.stringify(defaultPkg, null, 2), "utf8");
          }
        }

        // Check disk limit before write operations
        const writeCmds = ["touch", "mkdir", "cp", "mv", "wget", "curl", "npm", "git clone", "unzip", "tar"];
        const isWriteOp = writeCmds.some(w => lower.startsWith(w));
        if (isWriteOp && await isDiskFull(userId)) {
          return ctx.reply(`❌ *Disk penuh!* Batas disk workspace Anda tercapai.\n💡 Beli lebih banyak disk di \`/shop\` → \`sys_disk_gold\` atau \`sys_disk_gems\`.`, { parse_mode: "Markdown" });
        }

        const relCwd = path.relative(root, userWorkspaceDir) || ".";

        // Isolated env so npm and node resolve to user workspace node_modules
        const localNodeModules = path.join(userWorkspaceDir, "node_modules");
        const envConfig = {
          ...process.env,
          NODE_PATH: localNodeModules,
          npm_config_prefix: userWorkspaceDir
        };

        exec(cmdLine, { cwd: userWorkspaceDir, env: envConfig, timeout: 30000 }, (error, stdout, stderr) => {
          let output = "";
          if (stdout) output += stdout;
          if (stderr) output += `\n*Stderr:*\n\`\`\`\n${stderr}\n\`\`\``;
          if (error && !stdout && !stderr) output += `\n*Error:*\n\`\`\`\n${error.message}\n\`\`\``;

          if (!output.trim()) {
            output = "_(perintah selesai dijalankan tanpa keluaran)_";
          }

          ctx.reply(
            `💻 *WORKSPACE SHELL*\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `📂 *CWD:* \`${relCwd}\`\n` +
            `⌨️ *Perintah:* \`$ ${cmdLine}\`\n\n` +
            `*Keluaran:*\n\`\`\`\n${output.substring(0, 3000)}\n\`\`\``,
            { parse_mode: "Markdown" }
          ).catch(() => {});
        });
        return;
      } catch (err) {
        return ctx.reply(`❌ *Akses Ditolak:* ${err.message}`, { parse_mode: "Markdown" });
      }
    }

    // Check if it is a command registered dynamically by plugins
    if (text.startsWith("/")) {
      const parts = text.split(/\s+/);
      const cmdName = parts[0].substring(1).split("@")[0].toLowerCase();
      const payload = parts.slice(1).join(" ");
      
      const regCmd = registry.getCommand(userId, cmdName);
      if (regCmd) {
        if (regCmd.promptTemplate) {
          text = regCmd.promptTemplate.replace(/\{\{args\}\}/g, payload);
          ctx.reply(`_Menjalankan command plugin: ${cmdName}..._`, { parse_mode: "Markdown" }).catch(() => {});
          // fallthrough to AI agent logic below
        } else {
          ctx.payload = payload;
          try {
            await regCmd.handler(ctx);
          } catch (err) {
            console.error(`[Telegram Plugin Command Error] /${cmdName}:`, err.message);
            await ctx.reply(`❌ Error: ${err.message}`);
          }
          return;
        }
      }
    }

    // SERVER ROUTING (GLOBAL VS PRIVATE SERVER)
    try {
      const { getActiveServerConfig } = await import("../core/accounts.js");
      const serverConfig = await getActiveServerConfig(userId);
      
      if (serverConfig.mode === "private") {
        await ctx.sendChatAction("typing");
        const fetch = (await import("node-fetch")).default;
        
        // Mem-bypass sistem Global AI dan melempar payload langsung ke Server Private User
        const response = await fetch(serverConfig.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serverConfig.apiKey}`
          },
          body: JSON.stringify({
            api_key: serverConfig.apiKey,
            user_id: userId,
            username: ctx.from.username || "Player",
            message: finalContent,
            chat_id: ctx.chat.id
          }),
          timeout: 60000 // Timeout 60 detik
        });
        
        if (!response.ok) throw new Error(`HTTP Error ${response.status} dari Private Server`);
        const data = await response.json();
        
        const replyText = data.reply || data.response || data.text || JSON.stringify(data);
        return ctx.reply(replyText, { parse_mode: "Markdown" });
      }
    } catch (err) {
      console.error("[Proxy Private Server Error]", err);
      return ctx.reply(`❌ Gagal menghubungi Private Server kamu:\n\`${err.message}\`\n\nUntuk kembali ke Global AI, ketik \`/server switch global\`.`, { parse_mode: "Markdown" });
    }

    // Menggunakan Multi-User Parallel Task Queue System
    const chatId = await getOrSetActiveChat(userId);
    taskManager.enqueueUserMessage(userId, finalContent, ctx, chatId);
  });
}

export async function startBot() {
  if (!bot) return;
  console.log("[Telegram] Launching bot...");
  bot.launch();
  console.log("[Telegram] Bot is running successfully.");

  try {
    const fs = await import("fs");
    const path = await import("path");
    const { fileURLToPath } = await import("url");
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const statusFile = path.join(__dirname, "..", "memory", "status.json");
    fs.writeFileSync(statusFile, JSON.stringify({
      pid: process.pid,
      startTime: startTime
    }));
  } catch (err) {}
}

async function displayInventory(ctx, userId, username, page) {
  try {
    const economy = await getOrCreateUserEconomy(userId, username);
    const inventory = await getUserInventory(userId);
    
    const limitPerPage = 5;
    const totalPages = Math.ceil(inventory.length / limitPerPage) || 1;
    
    if (page > totalPages) {
      return ctx.reply(`Halaman tidak valid. Total halaman: ${totalPages}`);
    }

    let invStr = "_Inventory Anda kosong._";
    if (inventory.length > 0) {
      const pageItems = inventory.slice((page - 1) * limitPerPage, page * limitPerPage);
      invStr = pageItems.map(item => `📦 *ID:* \`${item.id}\` | *${item.item_name}* (x${item.quantity})`).join("\n");
    }

    const limitStr = (economy.tokens ?? 10000).toLocaleString() + " Token";

    await ctx.reply(
      `🎒 *INVENTORY & PROFIL ELYNISIA (Hal ${page}/${totalPages})*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 *User:* @${username}\n` +
      `📊 *Level:* \`${economy.level}\` (Exp: ${economy.exp} / ${economy.level * 100})\n` +
      `🎟 *Token Limit:* \`${limitStr}\`\n\n` +
      `💰 *SALDO KEUANGAN*\n` +
      `• 💎 *Gems:* \`${economy.gems}\`\n` +
      `• 🪙 *Gold:* \`${economy.gold}\`\n` +
      `• 🥈 *Silver:* \`${economy.silver}\`\n\n` +
      `📦 *BARANG INVENTORY*\n` +
      `${invStr}\n\n` +
      `💡 *Navigasi & Pintasan:*\n` +
      `• Ketik \`/inv [halaman]\` untuk melihat halaman lain (misal: \`/inv 2\`)\n` +
      `• Hapus barang: \`/inv delete <id_item_inventory>\`\n` +
      `• Kelola skill agen: \`/inv manage skill\``,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    await ctx.reply(`❌ Gagal memuat inventory: ${err.message}`);
  }
}
