/**
 * db_postgres.js
 * Modul Database Enterprise untuk PostgreSQL dan Redis
 * (Pengganti db.js yang menggunakan SQLite)
 */

import { Pool } from "pg";
import Redis from "ioredis";

// Inisialisasi PostgreSQL Pool
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "elynisia",
  password: process.env.DB_PASS || "mysecretpassword",
  database: process.env.DB_NAME || "elynisia_db",
  port: parseInt(process.env.DB_PORT) || 5432,
  max: 20, // Max koneksi dalam pool (cocok untuk PM2 Cluster)
  idleTimeoutMillis: 30000,
});

// Inisialisasi Redis Client
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

redis.on("connect", () => console.log("[Redis] Connected for Session & Caching"));
pool.on("connect", () => console.log("[PostgreSQL] Connected for Persistent Storage"));

/**
 * Menjalankan Query PostgreSQL (Wrapper agar mirip dengan sqlite3)
 */
async function queryDB(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    // console.log(`[DB] executed query`, { text, duration, rows: res.rowCount });
    return res;
  } catch (err) {
    console.error(`[DB Error] query: ${text}`, err);
    throw err;
  }
}

/**
 * Mendapatkan Global DB instance (mirip dengan getGlobalDB di db.js lama)
 * Di Postgres, kita tidak butuh file terpisah per user, cukup gunakan tabel yang sama
 * dengan kolom user_id. Namun untuk menjaga kompatibilitas API sementara:
 */
export async function getGlobalDB() {
  return {
    run: async (sql, params = []) => {
      // Convert SQLite ? to Postgres $1, $2
      let counter = 1;
      const pgSql = sql.replace(/\?/g, () => `$${counter++}`);
      const res = await queryDB(pgSql, params);
      return { lastID: res.insertId, changes: res.rowCount };
    },
    get: async (sql, params = []) => {
      let counter = 1;
      const pgSql = sql.replace(/\?/g, () => `$${counter++}`);
      const res = await queryDB(pgSql, params);
      return res.rows[0];
    },
    all: async (sql, params = []) => {
      let counter = 1;
      const pgSql = sql.replace(/\?/g, () => `$${counter++}`);
      const res = await queryDB(pgSql, params);
      return res.rows;
    }
  };
}

/**
 * Membaca data sementara yang butuh diakses kilat
 * (Sangat cocok untuk Cooldown Skill atau Mode Chat yang diakses terus menerus)
 */
export async function getCache(key) {
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

export async function setCache(key, value, expireSeconds = 3600) {
  await redis.set(key, JSON.stringify(value), "EX", expireSeconds);
}

// Inisialisasi Tabel Postgres (Dijalankan saat bot boot up)
export async function initPostgresTables() {
  const schema = `
    CREATE TABLE IF NOT EXISTS global_settings (
      key VARCHAR(255) PRIMARY KEY,
      val TEXT NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY,
      username VARCHAR(255),
      role VARCHAR(50) DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS economy (
      user_id BIGINT PRIMARY KEY REFERENCES users(id),
      gold BIGINT DEFAULT 0,
      gems BIGINT DEFAULT 0,
      tokens BIGINT DEFAULT 10000
    );
  `;
  await queryDB(schema);
  console.log("✅ PostgreSQL schema initialized");
}
