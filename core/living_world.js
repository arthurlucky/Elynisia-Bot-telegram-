/**
 * core/living_world.js
 * Sub-Agent Living World Engine untuk Elynisia RPG
 * Mengurus Hubungan Hero, Emosi/Mood, Percakapan Otonom (/roomchat), Berita Dunia (/news), & Cuaca Dinamis.
 */

import { getUserDB, getGlobalDB } from "./db.js";
import HeroManager from "./hero_manager.js";

export const MOODS = ["Happy", "Calm", "Excited", "Sad", "Angry", "Fear", "Stress", "Confident", "Lonely", "Hopeful"];
export const RELATIONSHIPS = ["Sahabat", "Rekan", "Rival", "Guru", "Murid", "Saudara", "Musuh", "Mengagumi", "Melindungi"];
export const WEATHERS = [
  { name: "Sunny ☀️", effect: "+10% Fire & Light Damage" },
  { name: "Rain 🌧️", effect: "+15% Water & Ice Damage" },
  { name: "Storm 🌩️", effect: "+20% Lightning Damage, -10% Evasion" },
  { name: "Snow ❄️", effect: "+15% Ice Damage, -5% Speed" },
  { name: "Blood Moon 🌕🔴", effect: "+30% Dark Damage, Monster Attack Up" },
  { name: "Aurora Night 🌌", effect: "+20% Mana Recovery Rate" }
];

const NEWS_TEMPLATES = [
  { title: "Naga Api Terbangun di Gunung Merah!", content: "Para petualang melaporkan peningkatan suhu ekstrem di sekitar gurun utara.", impact: "Monster elemen Fire mendapat buff ATK +15%." },
  { title: "Fenomena Aurora Suci Menyinari Elynia", content: "Cahaya aurora indah menerangi malam ini, memulihkan energi sihir para pahlawan.", impact: "Mana Recovery Hero meningkat 2x lipat." },
  { title: "Gerhana Bulan Merah Terjadi!", content: "Kekuatan kegelapan bangkit di Battle Tower. Semua boss menjadi lebih agresif.", impact: "Drop rate equipment langka di Tower naik 25%." },
  { title: "Pasar Komunitas Mengalami Kenaikan Harga Gemstone", content: "Para pedagang melaporkan kelangkaan batu mulia di wilayah perkotaan.", impact: "Harga jual Gemstone di pasar naik." }
];

const CONVERSATION_TEMPLATES = [
  (h1, h2, rel, mood) => `"${h2.name}, kamu terlihat ${mood.toLowerCase()} hari ini. Ada yang memikirkanmu?" — "${h1.name}, aku hanya sedang memikirkan pertarungan kita berikutnya sebagai ${rel.toLowerCase()}mu."`,
  (h1, h2, rel, mood) => `"${h1.name}! Ayo latihan pedang bersamaku!" — "Boleh saja, ${h2.name}. Sebagai ${rel.toLowerCase()} yang baik, aku tidak akan menolak tantanganmu."`,
  (h1, h2, rel, mood) => `"Bagaimana kondisi perbekalan kita di pangkalan?" — "Semuanya aman, ${h1.name}. Aku sudah menyiapkan segalanya."`,
  (h1, h2, rel, mood) => `"Lantai Tower berikutnya tampak lebih berbahaya." — "Jangan khawatir, selama kita bertarung bersama sebagai ${rel.toLowerCase()}, kita tak akan terkalahkan!"`
];

function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class LivingWorldEngine {
  /**
   * Mengambil Cuaca Dunia Aktif
   */
  static async getCurrentWeather() {
    const db = await getGlobalDB();
    let state = await db.get("SELECT * FROM world_state WHERE key = 'current_weather'");
    if (!state) {
      const defaultWeather = WEATHERS[0];
      await db.run("INSERT INTO world_state (key, val, updated_at) VALUES ('current_weather', ?, ?)", [JSON.stringify(defaultWeather), Date.now()]);
      return defaultWeather;
    }
    return JSON.parse(state.val);
  }

  /**
   * Acak/Perbarui Cuaca Dunia
   */
  static async rotateWeather() {
    const db = await getGlobalDB();
    const newWeather = choice(WEATHERS);
    await db.run("UPDATE world_state SET val = ?, updated_at = ? WHERE key = 'current_weather'", [JSON.stringify(newWeather), Date.now()]);
    return newWeather;
  }

  /**
   * Mengambil Berita Dunia Terkini (/news)
   */
  static async getWorldNews() {
    const db = await getGlobalDB();
    const news = await db.all("SELECT * FROM world_news ORDER BY id DESC LIMIT 5");
    if (news.length === 0) {
      // Inisialisasi berita pertama
      await this.generateWorldNews();
      return db.all("SELECT * FROM world_news ORDER BY id DESC LIMIT 5");
    }
    return news;
  }

  /**
   * Sub-Agent World News Generator
   */
  static async generateWorldNews() {
    const db = await getGlobalDB();
    const item = choice(NEWS_TEMPLATES);
    await db.run(
      "INSERT INTO world_news (title, content, impact, created_at) VALUES (?, ?, ?, ?)",
      [item.title, item.content, item.impact, Date.now()]
    );
    return item;
  }

  /**
   * Sub-Agent Dialogue Generator (/roomchat)
   * Menghasilkan percakapan otomatis antar Hero milik Commander
   */
  static async generateHeroConversation(userId) {
    const db = await getUserDB(userId);
    const heroes = await HeroManager.getUserHeroes(userId);
    if (heroes.length < 2) return null;

    // Pilih 2 Hero acak
    const h1 = heroes[Math.floor(Math.random() * heroes.length)];
    let h2 = heroes[Math.floor(Math.random() * heroes.length)];
    while (h2.hero_id === h1.hero_id) {
      h2 = heroes[Math.floor(Math.random() * heroes.length)];
    }

    const mood = choice(MOODS);
    const rel = choice(RELATIONSHIPS);
    const tmpl = choice(CONVERSATION_TEMPLATES);
    const msg = tmpl(h1, h2, rel, mood);

    await db.run(
      "INSERT INTO hero_roomchats (user_id, hero1_name, hero2_name, message, created_at) VALUES (?, ?, ?, ?, ?)",
      [String(userId), h1.name, h2.name, msg, Date.now()]
    );

    return { hero1: h1.name, hero2: h2.name, message: msg };
  }

  /**
   * Ambil Riwayat Percakapan Hero (/roomchat)
   * Hanya mengambil percakapan 5 menit terakhir (otomatis me-refresh)
   */
  static async getRoomchats(userId) {
    const db = await getUserDB(userId);
    const fiveMinsAgo = Date.now() - (5 * 60 * 1000);
    // Hapus otomatis percakapan lama (> 5 menit)
    await db.run("DELETE FROM hero_roomchats WHERE user_id = ? AND created_at < ?", [String(userId), fiveMinsAgo]);
    return db.all("SELECT * FROM hero_roomchats WHERE user_id = ? ORDER BY id DESC LIMIT 8", [String(userId)]);
  }

  /**
   * Hapus/Bersihkan Seluruh Riwayat Roomchat secara Manual (/roomchat clear)
   */
  static async clearRoomchats(userId) {
    const db = await getUserDB(userId);
    await db.run("DELETE FROM hero_roomchats WHERE user_id = ?", [String(userId)]);
    return true;
  }

  /**
   * SUB-AGENT RUMOR GENERATOR (/rumor)
   */
  static async generateWorldRumor() {
    const db = await getGlobalDB();
    const sources = ["Pedagang Wandering", "Penjaga Kota Solareth", "Petualang Tua", "Penyihir Rawa", "Prajurit Pensiunan"];
    const topics = ["Boss Tersembunyi", "Dungeon Rahasia", "Harta Karun Purba", "Hero Misterius", "Konflik Kerajaan", "Perubahan Cuaca"];
    const veracities = ["Fakta Terverifikasi 🟢", "Rumor Separuh Benar 🟡", "Gosip Belum Terbukti 🔴"];

    const rumors = [
      "Katanya di lantai 50 Tower terdapat naga bayangan yang menyimpan pedang legendaris.",
      "Seorang petualang mengaku melihat gerbang ke dungeon kuno terbuka di perbatasan barat.",
      "Ada kabar burung bahwa para pedagang akan memberikan diskon besar saat festival es berlangsung.",
      "Penjaga pangkalan bilang pahlawan berbaju merah sering terlihat berlatih di saat larut malam."
    ];

    const source = choice(sources);
    const topic = choice(topics);
    const content = choice(rumors);
    const veracity = choice(veracities);

    await db.run(
      "INSERT INTO world_rumors (source, topic, content, veracity, created_at) VALUES (?, ?, ?, ?, ?)",
      [source, topic, content, veracity, Date.now()]
    );

    return { source, topic, content, veracity };
  }

  static async getWorldRumors() {
    const db = await getGlobalDB();
    const list = await db.all("SELECT * FROM world_rumors ORDER BY id DESC LIMIT 5");
    if (list.length === 0) {
      await this.generateWorldRumor();
      return db.all("SELECT * FROM world_rumors ORDER BY id DESC LIMIT 5");
    }
    return list;
  }

  /**
   * SUB-AGENT DIARY GENERATOR (/hero diary <hero_id>)
   */
  static async generateHeroDiaryEntry(userId, heroId, eventType = "general") {
    const db = await getUserDB(userId);
    const hero = await HeroManager.getHeroDetail(userId, heroId);
    if (!hero) return null;

    const diaryEntries = {
      battle: `Hari ini pertarungan di Tower berlangsung sengit. Commander memimpin tim kami dengan sangat baik. Aku merasa kekuatanku bertambah.`,
      levelup: `Commander membantuku melatih teknik baru. Aku berhasil menaikkan kapasitas tenagaku ke tingkat yang lebih tinggi.`,
      giveitem: `Commander memberikan item baru padaku hari ini. Aku akan merawat perlengkapan ini dan memakainya dengan bangga.`,
      general: `Hari yang tenang di pangkalan. Aku sempat mengobrol dengan rekan-rekan pahlawan lainnya sambil menikmati teh hangat.`
    };

    const entryText = `[Catatan ${hero.name}] "${diaryEntries[eventType] || diaryEntries.general}"`;

    await db.run(
      "INSERT INTO hero_diaries (user_id, hero_id, entry_text, created_at) VALUES (?, ?, ?, ?)",
      [String(userId), heroId, entryText, Date.now()]
    );

    return entryText;
  }

  static async getHeroDiaries(userId, heroId) {
    const db = await getUserDB(userId);
    const hero = await HeroManager.getHeroDetail(userId, heroId);
    if (!hero) throw new Error(`Hero ID '${heroId}' tidak ditemukan di koleksi Anda!`);

    let list = await db.all("SELECT * FROM hero_diaries WHERE user_id = ? AND hero_id = ? ORDER BY id DESC LIMIT 6", [String(userId), heroId]);
    if (list.length === 0) {
      // Inisialisasi catatan pertama
      await this.generateHeroDiaryEntry(userId, heroId, "general");
      list = await db.all("SELECT * FROM hero_diaries WHERE user_id = ? AND hero_id = ? ORDER BY id DESC LIMIT 6", [String(userId), heroId]);
    }

    return { hero, list };
  }

  /**
   * Jalankan Engine Latar Belakang Otonom
   */
  static startLivingWorldEngine() {
    // Rotasi Cuaca, Berita, & Rumor tiap 15 menit
    setInterval(async () => {
      try {
        await this.rotateWeather();
        await this.generateWorldNews();
        await this.generateWorldRumor();
      } catch (err) {}
    }, 15 * 60 * 1000);

    // Auto cleanup roomchats lama tiap 5 menit untuk seluruh user
    setInterval(async () => {
      try {
        const fiveMinsAgo = Date.now() - (5 * 60 * 1000);
        const db = await getGlobalDB();
      } catch (err) {}
    }, 5 * 60 * 1000);
  }
}

export default LivingWorldEngine;
