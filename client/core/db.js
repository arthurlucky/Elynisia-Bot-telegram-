import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MEMORY_ROOT = path.join(__dirname, "..", "memory");

if (!fs.existsSync(MEMORY_ROOT)) {
  fs.mkdirSync(MEMORY_ROOT, { recursive: true });
}

function parseSelect(sql) {
  const parts = {
    cols: "*",
    table: "",
    where: null,
    orderBy: null,
    limit: null
  };

  const selectIdx = sql.indexOf("SELECT");
  const fromIdx = sql.indexOf("FROM");
  if (selectIdx === -1 || fromIdx === -1) return null;

  parts.cols = sql.slice(selectIdx + 6, fromIdx).trim();

  let rest = sql.slice(fromIdx + 4).trim();

  const whereIdx = rest.indexOf("WHERE");
  const orderIdx = rest.indexOf("ORDER BY");
  const limitIdx = rest.indexOf("LIMIT");

  let tableEnd = rest.length;
  if (whereIdx !== -1) tableEnd = Math.min(tableEnd, whereIdx);
  if (orderIdx !== -1) tableEnd = Math.min(tableEnd, orderIdx);
  if (limitIdx !== -1) tableEnd = Math.min(tableEnd, limitIdx);

  parts.table = rest.slice(0, tableEnd).trim();

  rest = rest.slice(tableEnd).trim();

  if (rest.startsWith("WHERE")) {
    let whereEnd = rest.length;
    const nextOrder = rest.indexOf("ORDER BY");
    const nextLimit = rest.indexOf("LIMIT");
    if (nextOrder !== -1) whereEnd = Math.min(whereEnd, nextOrder);
    if (nextLimit !== -1) whereEnd = Math.min(whereEnd, nextLimit);

    parts.where = rest.slice(5, whereEnd).trim();
    rest = rest.slice(whereEnd).trim();
  }

  if (rest.startsWith("ORDER BY")) {
    let orderEnd = rest.length;
    const nextLimit = rest.indexOf("LIMIT");
    if (nextLimit !== -1) orderEnd = Math.min(orderEnd, nextLimit);

    parts.orderBy = rest.slice(8, orderEnd).trim();
    rest = rest.slice(orderEnd).trim();
  }

  if (rest.startsWith("LIMIT")) {
    parts.limit = parseInt(rest.slice(5).trim());
  }

  return parts;
}

function evaluateWhere(row, whereClause, params) {
  if (!whereClause) return true;

  let paramIdx = 0;
  let expr = whereClause.replace(/\?/g, () => {
    const val = params[paramIdx++];
    if (typeof val === "string") {
      return `'${val.replace(/'/g, "\\'")}'`;
    }
    return val;
  });

  expr = expr.replace(/\bAND\b/gi, "&&")
             .replace(/\bOR\b/gi, "||")
             .replace(/=/g, "===")
             .replace(/!=====/g, "!==")
             .replace(/<====/g, "<=")
             .replace(/>====/g, ">=");

  // Substitute column names with row.colName references
  Object.keys(row).forEach(key => {
    const regex = new RegExp(`\\b${key}\\b`, 'g');
    expr = expr.replace(regex, `row.${key}`);
  });

  try {
    const fn = new Function("row", `return !!(${expr});`);
    return fn(row);
  } catch (err) {
    return false;
  }
}

/**
 * Pure JavaScript SQLite emulation class.
 * Emulates sqlite3 asynchronous run/get/all/exec interface on top of JSON files.
 * This completely avoids node-gyp native addon compilation issues in Termux.
 */
export class SQLiteDB {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.data = {};
  }

  async open() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const content = fs.readFileSync(this.dbPath, "utf8");
        this.data = JSON.parse(content);
      } else {
        this.data = {};
      }
    } catch (err) {
      this.data = {};
    }
  }

  async save() {
    try {
      fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), "utf8");
    } catch (err) {
      console.error("[SQLite DB Emulation] Error saving database:", err.message);
    }
  }

  async exec(sql) {
    // We only need to support basic CREATE TABLE statements
    const lines = sql.split(";");
    for (const line of lines) {
      const match = line.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)/i);
      if (match) {
        const tableName = match[1];
        if (!this.data[tableName]) {
          this.data[tableName] = [];
        }
      }
    }
    await this.save();
  }

  async run(sql, params = []) {
    sql = sql.trim();
    let changes = 0;
    let lastID = undefined;

    // 1. INSERT OR REPLACE INTO settings / user_roles / custom_roles / plugins
    if (sql.match(/^INSERT OR REPLACE INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i)) {
      const match = sql.match(/^INSERT OR REPLACE INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
      const tableName = match[1];
      const cols = match[2].split(",").map(c => c.trim());
      
      const row = {};
      cols.forEach((col, i) => {
        row[col] = params[i];
      });

      if (!this.data[tableName]) this.data[tableName] = [];
      const table = this.data[tableName];

      // Define primary key keys
      let pkCol = "id";
      if (tableName === "settings") pkCol = "key";
      else if (tableName === "user_roles") pkCol = "user_id";
      else if (tableName === "custom_roles") pkCol = "name";
      else if (tableName === "plugins") pkCol = "id";
      else if (tableName === "profile_memory") pkCol = "key";
      else if (tableName === "user_economy") pkCol = "user_id";
      else if (tableName === "barter_offers") pkCol = "id";

      if (tableName === "user_skills") {
        const idx = table.findIndex(r => String(r.user_id) === String(row.user_id) && String(r.skill_name) === String(row.skill_name));
        if (idx !== -1) {
          table[idx] = { ...table[idx], ...row };
        } else {
          table.push(row);
        }
      } else {
        const pkVal = row[pkCol];
        const idx = table.findIndex(r => r[pkCol] === pkVal);
        if (idx !== -1) {
          table[idx] = { ...table[idx], ...row };
        } else {
          table.push(row);
        }
      }
      changes = 1;
    }
    // 2. INSERT OR IGNORE INTO settings
    else if (sql.match(/^INSERT OR IGNORE INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i)) {
      const match = sql.match(/^INSERT OR IGNORE INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
      const tableName = match[1];
      const cols = match[2].split(",").map(c => c.trim());
      
      const row = {};
      cols.forEach((col, i) => {
        row[col] = params[i];
      });

      if (!this.data[tableName]) this.data[tableName] = [];
      const table = this.data[tableName];

      let pkCol = "key";
      const pkVal = row[pkCol];
      const exists = table.some(r => r[pkCol] === pkVal);
      if (!exists) {
        table.push(row);
        changes = 1;
      }
    }
    // 3. INSERT INTO chats / messages / scheduler_jobs / task_queue / episodic_memory
    else if (sql.match(/^INSERT INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i)) {
      const match = sql.match(/^INSERT INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
      const tableName = match[1];
      const cols = match[2].split(",").map(c => c.trim());

      if (!this.data[tableName]) this.data[tableName] = [];
      const table = this.data[tableName];

      // Auto-increment ID
      let maxId = 0;
      table.forEach(r => {
        if (r.id && r.id > maxId) maxId = r.id;
      });
      lastID = maxId + 1;

      const row = { id: lastID };
      cols.forEach((col, i) => {
        row[col] = params[i];
      });

      table.push(row);
      changes = 1;
    }
    // 4. UPDATE task_queue SET status = ?, updated_at = ?, result = ? WHERE id = ?
    else if (sql.match(/^UPDATE\s+(\w+)\s+SET\s+([^WHERE]+)\s+WHERE\s+(.+)$/i)) {
      const match = sql.match(/^UPDATE\s+(\w+)\s+SET\s+([^WHERE]+)\s+WHERE\s+(.+)$/i);
      const tableName = match[1];
      const setPart = match[2];
      const wherePart = match[3];

      const setCols = setPart.split(",").map(s => s.split("=")[0].trim());
      const whereCol = wherePart.split("=")[0].trim();

      const setVals = params.slice(0, setCols.length);
      const whereVal = params[setCols.length];

      if (this.data[tableName]) {
        this.data[tableName].forEach(row => {
          if (String(row[whereCol]) === String(whereVal)) {
            setCols.forEach((col, idx) => {
              row[col] = setVals[idx];
            });
            changes++;
          }
        });
      }
    }
    // 5. UPDATE user_roles SET custom_limit = ? WHERE user_id = ?
    else if (sql.match(/^UPDATE\s+(\w+)\s+SET\s+custom_limit\s*=\s*\?\s+WHERE\s+user_id\s*=\s*\?/i)) {
      const tableName = "user_roles";
      const limitVal = params[0];
      const userId = params[1];
      if (this.data[tableName]) {
        this.data[tableName].forEach(row => {
          if (String(row.user_id) === String(userId)) {
            row.custom_limit = limitVal;
            changes++;
          }
        });
      }
    }
    // 6. DELETE FROM chats WHERE id = ? or DELETE FROM messages WHERE chat_id = ?
    else if (sql.match(/^DELETE FROM\s+(\w+)\s+WHERE\s+(\w+)\s*=\s*\?/i)) {
      const match = sql.match(/^DELETE FROM\s+(\w+)\s+WHERE\s+(\w+)\s*=\s*\?/i);
      const tableName = match[1];
      const col = match[2];
      const val = params[0];

      if (this.data[tableName]) {
        const initialLen = this.data[tableName].length;
        this.data[tableName] = this.data[tableName].filter(row => String(row[col]) !== String(val));
        changes = initialLen - this.data[tableName].length;
      }
    }

    await this.save();
    return { lastID, changes };
  }

  async get(sql, params = []) {
    sql = sql.trim();
    // 1. Specific settings query
    if (sql.match(/^SELECT\s+val\s+FROM\s+settings\s+WHERE\s+key\s*=\s*\?/i)) {
      const table = this.data["settings"] || [];
      const keyVal = params[0];
      const row = table.find(r => r.key === keyVal);
      return row ? { val: row.val } : undefined;
    }
    // 2. Specific user_roles queries
    if (sql.match(/^SELECT\s+role\s+FROM\s+user_roles\s+WHERE\s+user_id\s*=\s*\?/i)) {
      const table = this.data["user_roles"] || [];
      const userVal = params[0];
      const row = table.find(r => String(r.user_id) === String(userVal));
      return row ? { role: row.role } : undefined;
    }
    if (sql.match(/^SELECT\s+custom_limit\s+FROM\s+user_roles\s+WHERE\s+user_id\s*=\s*\?/i)) {
      const table = this.data["user_roles"] || [];
      const userVal = params[0];
      const row = table.find(r => String(r.user_id) === String(userVal));
      return row ? { custom_limit: row.custom_limit } : undefined;
    }

    // Generic select emulation
    const parsed = parseSelect(sql);
    if (parsed) {
      const tableName = parsed.table;
      const selectCols = parsed.cols;
      const whereClause = parsed.where;
      const orderBy = parsed.orderBy;
      const limitVal = parsed.limit;

      if (!this.data[tableName]) this.data[tableName] = [];
      let rows = [...this.data[tableName]];

      if (whereClause) {
        rows = rows.filter(r => evaluateWhere(r, whereClause, params));
      }

      if (orderBy) {
        const parts = orderBy.split(/\s+/);
        const col = parts[0];
        const dir = parts[1] ? parts[1].toUpperCase() : "ASC";
        rows.sort((a, b) => {
          if (dir === "DESC") return b[col] - a[col];
          return a[col] - b[col];
        });
      }

      if (limitVal !== null) {
        rows = rows.slice(0, limitVal);
      }

      if (rows.length === 0) return undefined;

      const row = rows[0];
      if (selectCols === "*") return row;

      const mapped = {};
      selectCols.split(",").forEach(c => {
        const col = c.trim();
        mapped[col] = row[col];
      });
      return mapped;
    }

    return undefined;
  }

  async all(sql, params = []) {
    sql = sql.trim();
    // Generic select emulation for all()
    const parsed = parseSelect(sql);
    if (parsed) {
      const tableName = parsed.table;
      const selectCols = parsed.cols;
      const whereClause = parsed.where;
      const orderBy = parsed.orderBy;
      const limitVal = parsed.limit;

      if (!this.data[tableName]) this.data[tableName] = [];
      let rows = [...this.data[tableName]];

      if (whereClause) {
        rows = rows.filter(r => evaluateWhere(r, whereClause, params));
      }

      if (orderBy) {
        const parts = orderBy.split(/\s+/);
        const col = parts[0];
        const dir = parts[1] ? parts[1].toUpperCase() : "ASC";
        rows.sort((a, b) => {
          if (dir === "DESC") return b[col] - a[col];
          return a[col] - b[col];
        });
      }

      if (limitVal !== null) {
        rows = rows.slice(0, limitVal);
      }

      return rows.map(r => {
        if (selectCols === "*") return r;
        const mapped = {};
        selectCols.split(",").forEach(c => {
          const col = c.trim();
          mapped[col] = r[col];
        });
        return mapped;
      });
    }

    return [];
  }

  async close() {
    await this.save();
  }
}

// Global Database Singleton
let globalDB = null;
export async function getGlobalDB() {
  if (globalDB) return globalDB;

  const dbPath = path.join(MEMORY_ROOT, "global.db");
  const db = new SQLiteDB(dbPath);
  await db.open();

  // Create global tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      val TEXT
    );
    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      custom_limit TEXT
    );
    CREATE TABLE IF NOT EXISTS custom_roles (
      name TEXT PRIMARY KEY,
      is_limit_on INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS plugins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      enabled INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS user_economy (
      user_id TEXT PRIMARY KEY,
      username TEXT,
      level INTEGER DEFAULT 1,
      exp INTEGER DEFAULT 0,
      gems INTEGER DEFAULT 0,
      gold INTEGER DEFAULT 0,
      silver INTEGER DEFAULT 0,
      tokens INTEGER DEFAULT 10000,
      tower_floor INTEGER DEFAULT 1,
      last_tower_time INTEGER DEFAULT 0,
      ports_limit INTEGER DEFAULT 1,
      ram_limit_mb INTEGER DEFAULT 500,
      disk_limit_mb INTEGER DEFAULT 500
    );
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      item_name TEXT,
      quantity INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS shop_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id TEXT,
      seller_username TEXT,
      item_name TEXT,
      quantity INTEGER DEFAULT 1,
      currency TEXT,
      price INTEGER
    );
    CREATE TABLE IF NOT EXISTS barter_offers (
      id TEXT PRIMARY KEY,
      creator_id TEXT,
      creator_username TEXT,
      offered_item TEXT,
      offered_quantity INTEGER DEFAULT 1,
      target_id TEXT,
      status TEXT DEFAULT 'open',
      bidder_id TEXT,
      bidder_username TEXT,
      bidder_offer TEXT,
      bidder_quantity INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS user_skills (
      user_id TEXT,
      skill_name TEXT,
      enabled INTEGER DEFAULT 1,
      PRIMARY KEY (user_id, skill_name)
    );
    CREATE TABLE IF NOT EXISTS items_database (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      rarity TEXT NOT NULL,
      family TEXT,
      atk INTEGER DEFAULT 0,
      def INTEGER DEFAULT 0,
      magic INTEGER DEFAULT 0,
      crit INTEGER DEFAULT 0,
      speed INTEGER DEFAULT 0,
      price INTEGER DEFAULT 0,
      lore TEXT,
      set_bonus_json TEXT,
      generated_at INTEGER,
      generator_version TEXT DEFAULT 'v1.0',
      owner_id TEXT,
      status TEXT DEFAULT 'available'
    );
    CREATE TABLE IF NOT EXISTS tower_parties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      leader_id TEXT NOT NULL,
      max_members INTEGER DEFAULT 4,
      members_json TEXT NOT NULL,
      created_at INTEGER
    );
  `);

  // Set default settings if not exists
  await db.run("INSERT OR IGNORE INTO settings (key, val) VALUES (?, ?)", ["privacy", "off"]);
  await db.run("INSERT OR IGNORE INTO settings (key, val) VALUES (?, ?)", ["default_limit", "50"]);

  globalDB = db;
  return globalDB;
}

// User Database Manager
const userDBs = new Map(); // userId -> SQLiteDB

export async function getUserDB(userId) {
  const strUserId = String(userId);
  if (userDBs.has(strUserId)) {
    return userDBs.get(strUserId);
  }

  const userDir = path.join(MEMORY_ROOT, strUserId);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  // Find existing database file in user folder
  const files = fs.readdirSync(userDir);
  let dbFile = files.find((f) => f.endsWith(".db"));

  if (!dbFile) {
    // Generate new random UUID db filename
    const uuid = crypto.randomUUID();
    dbFile = `${uuid}.db`;
  }

  const dbPath = path.join(userDir, dbFile);
  const db = new SQLiteDB(dbPath);
  await db.open();

  // Create user specific tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content_json TEXT NOT NULL,
      created_at INTEGER,
      FOREIGN KEY(chat_id) REFERENCES chats(id)
    );
    CREATE TABLE IF NOT EXISTS scheduler_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      schedule TEXT,
      prompt TEXT NOT NULL,
      last_run INTEGER DEFAULT 0,
      next_run INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active'
    );
    CREATE TABLE IF NOT EXISTS task_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER,
      updated_at INTEGER,
      result TEXT
    );
    CREATE TABLE IF NOT EXISTS episodic_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      importance INTEGER DEFAULT 1,
      content TEXT NOT NULL,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS profile_memory (
      key TEXT PRIMARY KEY,
      val TEXT,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS user_heroes (
      hero_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      surname TEXT NOT NULL,
      nickname TEXT NOT NULL,
      country TEXT NOT NULL,
      race TEXT NOT NULL,
      gender TEXT NOT NULL,
      age INTEGER DEFAULT 18,
      height INTEGER DEFAULT 170,
      personality TEXT NOT NULL,
      hobby TEXT NOT NULL,
      likes TEXT NOT NULL,
      dislikes TEXT NOT NULL,
      weakness TEXT NOT NULL,
      theme_color TEXT DEFAULT '#FF0000',
      class_name TEXT DEFAULT 'None',
      element TEXT NOT NULL,
      rarity TEXT NOT NULL,
      star INTEGER DEFAULT 1,
      growth_type TEXT DEFAULT 'Balanced',
      level INTEGER DEFAULT 1,
      exp INTEGER DEFAULT 0,
      hp INTEGER DEFAULT 100,
      max_hp INTEGER DEFAULT 100,
      mana INTEGER DEFAULT 50,
      max_mana INTEGER DEFAULT 50,
      atk INTEGER DEFAULT 15,
      matk INTEGER DEFAULT 10,
      def INTEGER DEFAULT 10,
      mdef INTEGER DEFAULT 8,
      speed INTEGER DEFAULT 10,
      crit_rate INTEGER DEFAULT 5,
      crit_dmg INTEGER DEFAULT 150,
      affinity INTEGER DEFAULT 0,
      trust INTEGER DEFAULT 0,
      dialog_summon TEXT,
      lore TEXT,
      background_json TEXT,
      skills_json TEXT,
      equipment_json TEXT,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS user_hero_parties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      party_name TEXT DEFAULT 'Party 1',
      hero_ids_json TEXT NOT NULL,
      formation_json TEXT
    );
    CREATE TABLE IF NOT EXISTS tower_expeditions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      floor INTEGER NOT NULL,
      hero_ids_json TEXT NOT NULL,
      start_time INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      status TEXT DEFAULT 'running',
      reward_json TEXT
    );
    CREATE TABLE IF NOT EXISTS hero_roomchats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      hero1_name TEXT NOT NULL,
      hero2_name TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS world_news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      impact TEXT NOT NULL,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS world_state (
      key TEXT PRIMARY KEY,
      val TEXT,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS world_rumors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      topic TEXT NOT NULL,
      content TEXT NOT NULL,
      veracity TEXT NOT NULL,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS hero_diaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      hero_id TEXT NOT NULL,
      entry_text TEXT NOT NULL,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS user_pvp_stats (
      user_id TEXT PRIMARY KEY,
      points INTEGER DEFAULT 1000,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      rank_title TEXT DEFAULT 'Bronze Commander'
    );
    CREATE TABLE IF NOT EXISTS casino_history (
      user_id TEXT PRIMARY KEY,
      last_spin_time INTEGER DEFAULT 0,
      total_spins INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      version INTEGER DEFAULT 1,
      content TEXT NOT NULL,
      metadata_json TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS artifact_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artifact_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      content TEXT NOT NULL,
      summary TEXT,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS user_marketplaces (
      name TEXT PRIMARY KEY,
      git_url TEXT NOT NULL,
      path TEXT NOT NULL,
      format TEXT NOT NULL,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS marketplace_plugins (
      id TEXT PRIMARY KEY,
      marketplace_name TEXT NOT NULL,
      name TEXT NOT NULL,
      version TEXT DEFAULT '1.0.0',
      description TEXT,
      author TEXT,
      source_url TEXT,
      permissions_json TEXT,
      category TEXT
    );
    CREATE TABLE IF NOT EXISTS rpg_skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_key TEXT NOT NULL,
      name TEXT NOT NULL,
      element TEXT NOT NULL,
      type TEXT NOT NULL,
      rarity TEXT NOT NULL,
      level INTEGER DEFAULT 1,
      exp INTEGER DEFAULT 0,
      evolution_stage INTEGER DEFAULT 1,
      cooldown INTEGER DEFAULT 0,
      cost_type TEXT DEFAULT 'mana',
      cost_value INTEGER DEFAULT 10,
      mastery_pts INTEGER DEFAULT 0,
      mastery_rank TEXT DEFAULT 'Novice',
      is_equipped INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS user_tower_state (
      user_id TEXT PRIMARY KEY,
      floor INTEGER DEFAULT 1,
      room_idx INTEGER DEFAULT 0,
      quest_progress INTEGER DEFAULT 0,
      in_battle INTEGER DEFAULT 0,
      hp INTEGER DEFAULT 100,
      max_hp INTEGER DEFAULT 100,
      mana INTEGER DEFAULT 100,
      max_mana INTEGER DEFAULT 100,
      monster_hp INTEGER DEFAULT 0,
      monster_name TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS user_equipment_slots (
      user_id TEXT,
      slot TEXT,
      item_id TEXT,
      item_name TEXT,
      stats_json TEXT,
      PRIMARY KEY (user_id, slot)
    );
  `);

  userDBs.set(strUserId, db);
  return db;
}
