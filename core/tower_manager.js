/**
 * core/tower_manager.js
 * Tower RPG World, Quest, Boss, Progress, & Party Manager
 */

import { getUserDB, getGlobalDB } from "./db.js";
import { getOrCreateUserEconomy, saveUserEconomy } from "./economy.js";

const MONSTER_POOL = {
  normal: ["Goblin Penjaga", "Serigala Malam", "Penyihir Hutan", "Golem Batu", "Salamander Api", "Arwah Gentayangan", "Harpy Petir"],
  boss: ["Raja Goblin", "Naga Api Purba", "Panglima Iblis", "Ratu Es Abadi", "Dewa Petir Kuno", "Seraphim Hitam"]
};

const QUEST_DESCS = [
  "Kalahkan pemburu yang mengancam gerbang lantai ini.",
  "Lindungi kristal kuno dari serbuan makhluk rawa.",
  "Bebaskan ruangan dari pengaruh kegelapan abadi.",
  "Temukan pecahan rune yang tersimpan di dalam sarang monster."
];

export class TowerManager {
  /**
   * Mengambil atau membuat state Tower untuk user
   */
  static async getUserState(userId) {
    const db = await getUserDB(userId);
    let state = await db.get("SELECT * FROM user_tower_state WHERE user_id = ?", [String(userId)]);
    const economy = await getOrCreateUserEconomy(userId);
    const maxHp = 100 + (economy.level || 1) * 15;
    const maxMana = 100 + (economy.level || 1) * 5;

    if (!state) {
      await db.run(
        "INSERT INTO user_tower_state (user_id, floor, room_idx, quest_progress, in_battle, hp, max_hp, mana, max_mana, monster_hp, monster_name) VALUES (?, ?, 0, 0, 0, ?, ?, ?, ?, 0, '')",
        [String(userId), economy.tower_floor || 1, maxHp, maxHp, maxMana, maxMana]
      );
      state = await db.get("SELECT * FROM user_tower_state WHERE user_id = ?", [String(userId)]);
    } else {
      let dirty = false;
      if (state.hp === undefined || state.hp === null) { state.hp = maxHp; dirty = true; }
      if (state.max_hp === undefined || state.max_hp === null) { state.max_hp = maxHp; dirty = true; }
      if (state.mana === undefined || state.mana === null) { state.mana = maxMana; dirty = true; }
      if (state.max_mana === undefined || state.max_mana === null) { state.max_mana = maxMana; dirty = true; }
      if (state.floor === undefined || state.floor === null) { state.floor = economy.tower_floor || 1; dirty = true; }

      if (dirty) {
        await this.saveState(userId, state);
      }
    }
    return state;
  }

  /**
   * Menyimpan perubahan state Tower user
   */
  static async saveState(userId, patch) {
    const db = await getUserDB(userId);
    const current = await this.getUserState(userId);
    const m = { ...current, ...patch };

    await db.run(
      "UPDATE user_tower_state SET floor = ?, room_idx = ?, quest_progress = ?, in_battle = ?, hp = ?, max_hp = ?, mana = ?, max_mana = ?, monster_hp = ?, monster_name = ? WHERE user_id = ?",
      [m.floor, m.room_idx, m.quest_progress, m.in_battle ? 1 : 0, m.hp, m.max_hp, m.mana, m.max_mana, m.monster_hp, m.monster_name, String(userId)]
    );
  }

  /**
   * Hasilkan data Room & Quest dinamis (Dynamic Quest & Sub-Agent Generator)
   */
  static getRoomInfo(floor, roomIdx) {
    const isBoss = (roomIdx + 1) % 5 === 0;
    const roomId = `RM${Math.floor(100 + Math.random() * 899)}-TOWER-${String(floor).padStart(2, '0')}`;
    
    const monsterName = isBoss 
      ? MONSTER_POOL.boss[Math.floor(Math.random() * MONSTER_POOL.boss.length)]
      : MONSTER_POOL.normal[Math.floor(Math.random() * MONSTER_POOL.normal.length)];

    const targetKills = isBoss ? 1 : Math.min(10, Math.floor(3 + (floor * 0.2)));
    const questTitle = isBoss ? `⚔️ [BOSS] Kalahkan ${monsterName}` : `Tumpas ${targetKills}x ${monsterName}`;
    const questDesc = isBoss ? `Bos penjaga gerbang lantai ${floor}! Gunakan seluruh kemampuanmu.` : QUEST_DESCS[Math.floor(Math.random() * QUEST_DESCS.length)];

    return {
      roomId,
      floor,
      roomIdx: roomIdx + 1,
      isBoss,
      monsterName,
      monsterHp: (80 + floor * 25) * (isBoss ? 3 : 1),
      monsterAtk: (10 + floor * 4) * (isBoss ? 1.5 : 1),
      questTitle,
      questDesc,
      targetKills,
      difficulty: isBoss ? "🔥 Boss Room" : floor > 10 ? "Hard" : "Normal",
      recommendedParty: isBoss ? "2 - 4 Player" : "1 - 2 Player"
    };
  }

  /**
   * HERO PARTY KNOCK OUT (KO) HANDLER
   * Apabila HP Party mencapai 0: Hero dievakuasi tanpa reset level/inventory Commander.
   */
  static async handleHeroKO(userId) {
    const state = await this.getUserState(userId);
    await this.saveState(userId, {
      in_battle: 0,
      hp: Math.floor(state.max_hp * 0.3),
      mana: state.max_mana,
      monster_hp: 0
    });
    return "💀 *PARTY HERO KNOCK OUT!* Tim Hero Anda dikalahkan. Hero berhasil dievakuasi kembali ke pangkalan.";
  }

  /**
   * PARALLEL TOWER EXPEDITION SYSTEM
   * Mengirim Party Hero ke lantai yang sudah pernah dilewati (cleared floors)
   */
  static async startExpedition(userId, targetFloor, heroIds = []) {
    const db = await getUserDB(userId);
    const state = await this.getUserState(userId);
    const highestClearedFloor = Math.max(1, state.floor - 1);

    if (targetFloor > highestClearedFloor) {
      throw new Error(`Lantai ${targetFloor} belum pernah Anda lewati! Ekspedisi paralel hanya berlaku pada lantai yang sudah dibersihkan (Maks. Lantai ${highestClearedFloor}).`);
    }

    // Cek batas ekspedisi aktif
    const activeExps = await db.all("SELECT * FROM tower_expeditions WHERE user_id = ? AND status = 'running'", [String(userId)]);
    if (activeExps.length >= 3) {
      throw new Error("Batas maksimum 3 Ekspedisi Paralel aktif secara bersamaan telah tercapai!");
    }

    const durationMs = 2 * 60 * 1000; // 2 Menit durasi ekspedisi
    const startTime = Date.now();
    const rewardExp = targetFloor * 30 + Math.floor(Math.random() * 20);
    const rewardSilver = targetFloor * 25 + Math.floor(Math.random() * 15);
    const rewardItems = ["Batu Besi", "Ramuan HP", "Permata Hijau"][Math.floor(Math.random() * 3)];

    const rewardObj = { exp: rewardExp, silver: rewardSilver, item: rewardItems };

    await db.run(
      "INSERT INTO tower_expeditions (user_id, floor, hero_ids_json, start_time, duration_ms, status, reward_json) VALUES (?, ?, ?, ?, ?, 'running', ?)",
      [String(userId), targetFloor, JSON.stringify(heroIds), startTime, durationMs, JSON.stringify(rewardObj)]
    );

    return {
      floor: targetFloor,
      durationMinutes: 2,
      rewardPreview: `+${rewardExp} EXP | +${rewardSilver} Silver | Item: ${rewardItems}`
    };
  }

  /**
   * Ambil daftar ekspedisi user
   */
  static async getUserExpeditions(userId) {
    const db = await getUserDB(userId);
    const exps = await db.all("SELECT * FROM tower_expeditions WHERE user_id = ? ORDER BY id DESC", [String(userId)]);
    const now = Date.now();

    return exps.map(e => {
      const elapsed = now - e.start_time;
      const isReady = elapsed >= e.duration_ms;
      const remainingSec = Math.max(0, Math.ceil((e.duration_ms - elapsed) / 1000));
      return {
        ...e,
        isReady: e.status === "completed" || isReady,
        remainingSec
      };
    });
  }

  /**
   * Klaim hasil Ekspedisi Paralel
   */
  static async claimExpedition(userId, expeditionId) {
    const db = await getUserDB(userId);
    const globalDb = await getGlobalDB();
    const exp = await db.get("SELECT * FROM tower_expeditions WHERE user_id = ? AND id = ?", [String(userId), expeditionId]);

    if (!exp) throw new Error(`Ekspedisi ID ${expeditionId} tidak ditemukan!`);
    if (exp.status === "claimed") throw new Error("Ekspedisi ini sudah pernah diklaim.");

    const elapsed = Date.now() - exp.start_time;
    if (elapsed < exp.duration_ms && exp.status !== "completed") {
      const remainingSec = Math.ceil((exp.duration_ms - elapsed) / 1000);
      throw new Error(`Ekspedisi di Lantai ${exp.floor} belum selesai! Sisa waktu: ${remainingSec} detik.`);
    }

    const rewards = JSON.parse(exp.reward_json || "{}");
    const economy = await getOrCreateUserEconomy(userId);

    economy.exp += rewards.exp || 0;
    economy.silver += rewards.silver || 0;
    await saveUserEconomy(globalDb, economy);

    if (rewards.item) {
      const existing = await globalDb.get("SELECT * FROM inventory WHERE user_id = ? AND item_name = ?", [String(userId), rewards.item]);
      if (existing) {
        await globalDb.run("UPDATE inventory SET quantity = quantity + 1 WHERE id = ?", [existing.id]);
      } else {
        await globalDb.run("INSERT INTO inventory (user_id, item_name, quantity) VALUES (?, ?, 1)", [String(userId), rewards.item]);
      }
    }

    await db.run("UPDATE tower_expeditions SET status = 'claimed' WHERE id = ?", [expeditionId]);

    return {
      floor: exp.floor,
      exp: rewards.exp,
      silver: rewards.silver,
      item: rewards.item
    };
  }
}

export default TowerManager;
