import { getGlobalDB, getUserDB } from "./db.js";

// Menggunakan tabel settings di getGlobalDB() untuk menyimpan data akun dan server, 
// atau membuat tabel baru jika perlu. Untuk kemudahan kita simpan via JSON di getGlobalDB().

async function initAccountTables() {
  const db = await getGlobalDB();
  await db.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      account_id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT UNIQUE,
      username TEXT,
      password TEXT,
      created_at BIGINT
    )
  `);
  
  await db.run(`
    CREATE TABLE IF NOT EXISTS user_servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT UNIQUE,
      server_name TEXT,
      url TEXT,
      api_key TEXT,
      active_mode TEXT DEFAULT 'global'
    )
  `);
}

// Panggil inisialisasi tabel saat modul diload
initAccountTables().catch(console.error);

export async function registerAccount(telegramId, username, password) {
  const db = await getGlobalDB();
  const existing = await db.get("SELECT * FROM accounts WHERE telegram_id = ?", [String(telegramId)]);
  if (existing) throw new Error("Akun Telegram ini sudah terdaftar.");
  
  // Catatan: Di level produksi, password harus di-hash menggunakan bcrypt. 
  // Untuk blueprint ini, kita gunakan plaintext agar simpel.
  const res = await db.run(
    "INSERT INTO accounts (telegram_id, username, password, created_at) VALUES (?, ?, ?, ?)",
    [String(telegramId), username, password, Date.now()]
  );
  return res.lastID;
}

export async function loginAccount(telegramId, accountId, password) {
  const db = await getGlobalDB();
  const account = await db.get("SELECT * FROM accounts WHERE account_id = ? AND password = ?", [accountId, password]);
  if (!account) throw new Error("ID atau Password salah.");
  
  // Bind Telegram ID ke Akun ini (jika login dari device/telegram beda)
  await db.run("UPDATE accounts SET telegram_id = ? WHERE account_id = ?", [String(telegramId), accountId]);
  return account;
}

export async function addPrivateServer(telegramId, url, apiKey, serverName) {
  const db = await getGlobalDB();
  const existing = await db.get("SELECT * FROM user_servers WHERE telegram_id = ?", [String(telegramId)]);
  
  if (existing) {
    // Update server karena limit 1 per user
    await db.run(
      "UPDATE user_servers SET url = ?, api_key = ?, server_name = ? WHERE telegram_id = ?",
      [url, apiKey, serverName, String(telegramId)]
    );
  } else {
    await db.run(
      "INSERT INTO user_servers (telegram_id, url, api_key, server_name) VALUES (?, ?, ?, ?)",
      [String(telegramId), url, apiKey, serverName]
    );
  }
}

export async function switchServerMode(telegramId, modeName) {
  const db = await getGlobalDB();
  if (modeName.toLowerCase() === "global") {
    await db.run("UPDATE user_servers SET active_mode = 'global' WHERE telegram_id = ?", [String(telegramId)]);
    return "global";
  }
  
  const server = await db.get("SELECT * FROM user_servers WHERE telegram_id = ?", [String(telegramId)]);
  if (!server) throw new Error("Kamu belum mendaftarkan private server apapun.");
  if (server.server_name.toLowerCase() !== modeName.toLowerCase()) {
    throw new Error(`Server bernama '${modeName}' tidak ditemukan.`);
  }
  
  await db.run("UPDATE user_servers SET active_mode = 'private' WHERE telegram_id = ?", [String(telegramId)]);
  return "private";
}

export async function getActiveServerConfig(telegramId) {
  const db = await getGlobalDB();
  const server = await db.get("SELECT * FROM user_servers WHERE telegram_id = ?", [String(telegramId)]);
  
  if (!server || server.active_mode === "global") {
    return { mode: "global" };
  }
  return { mode: "private", url: server.url, apiKey: server.api_key, name: server.server_name };
}
