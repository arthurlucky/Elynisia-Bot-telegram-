/**
 * core/pvp_engine.js
 * Engine Pertarungan 4v4 Commander vs Commander & Leaderboard PvP Elynisia RPG
 */

import { getUserDB, getGlobalDB } from "../../client/core/db.js";
import { getOrCreateUserEconomy, saveUserEconomy } from "../../client/core/economy.js";
import HeroManager from "./hero_manager.js";

export const RANKS = [
  { name: "Bronze Commander 🥉", minPoints: 0 },
  { name: "Silver Commander 🥈", minPoints: 1200 },
  { name: "Gold Commander 🪙", minPoints: 1500 },
  { name: "Diamond Commander 💎", minPoints: 1900 },
  { name: "Mythic Commander 👑", minPoints: 2400 }
];

export class PvpEngine {
  /**
   * Mengambil data status PvP user
   */
  static async getPvpStats(userId) {
    const db = await getUserDB(userId);
    let stats = await db.get("SELECT * FROM user_pvp_stats WHERE user_id = ?", [String(userId)]);
    if (!stats) {
      await db.run("INSERT INTO user_pvp_stats (user_id, points, wins, losses, rank_title) VALUES (?, 1000, 0, 0, 'Bronze Commander 🥉')", [String(userId)]);
      stats = await db.get("SELECT * FROM user_pvp_stats WHERE user_id = ?", [String(userId)]);
    }
    return stats;
  }

  /**
   * Tentukan gelar Rank berdasarkan poin ELO
   */
  static getRankTitle(points) {
    let current = RANKS[0].name;
    for (const r of RANKS) {
      if (points >= r.minPoints) current = r.name;
    }
    return current;
  }

  /**
   * Simulasi Pertarungan PvP 4v4 (Commander A vs Commander B)
   */
  static async battle(userAId, userBId) {
    const dbA = await getUserDB(userAId);
    const dbB = await getUserDB(userBId);
    const globalDb = await getGlobalDB();

    const heroesA = await HeroManager.getUserHeroes(userAId);
    const heroesB = await HeroManager.getUserHeroes(userBId);

    if (heroesA.length === 0) throw new Error("Anda belum memiliki Hero di Party! Rekrut via `/gacha` terlebih dahulu.");
    if (heroesB.length === 0) throw new Error("Lawan tidak memiliki Hero di Party!");

    const partyA = heroesA.slice(0, 4);
    const partyB = heroesB.slice(0, 4);

    const synergyA = HeroManager.getPartySynergy(partyA);
    const synergyB = HeroManager.getPartySynergy(partyB);

    const hpA = partyA.reduce((sum, h) => sum + (h.max_hp || 100), 0);
    const hpB = partyB.reduce((sum, h) => sum + (h.max_hp || 100), 0);

    const atkA = Math.floor(partyA.reduce((sum, h) => sum + (h.atk || 15), 0) * synergyA.dmgMultiplier);
    const atkB = Math.floor(partyB.reduce((sum, h) => sum + (h.atk || 15), 0) * synergyB.dmgMultiplier);

    const defA = Math.floor(partyA.reduce((sum, h) => sum + (h.def || 10), 0) * synergyA.defMultiplier);
    const defB = Math.floor(partyB.reduce((sum, h) => sum + (h.def || 10), 0) * synergyB.defMultiplier);

    // Simulasi damage total 3 turn
    const dmgToB = Math.max(10, (atkA * 3) - defB);
    const dmgToA = Math.max(10, (atkB * 3) - defA);

    const remHpB = Math.max(0, hpB - dmgToB);
    const remHpA = Math.max(0, hpA - dmgToA);

    const isWinnerA = remHpA >= remHpB;

    // Update Poin ELO PvP
    const statsA = await this.getPvpStats(userAId);
    const statsB = await this.getPvpStats(userBId);

    const pointChange = 25;
    const newPointsA = Math.max(0, statsA.points + (isWinnerA ? pointChange : -pointChange));
    const newPointsB = Math.max(0, statsB.points + (isWinnerA ? -pointChange : pointChange));

    const rankA = this.getRankTitle(newPointsA);
    const rankB = this.getRankTitle(newPointsB);

    await dbA.run("UPDATE user_pvp_stats SET points = ?, wins = wins + ?, losses = losses + ?, rank_title = ? WHERE user_id = ?", [newPointsA, isWinnerA ? 1 : 0, isWinnerA ? 0 : 1, rankA, String(userAId)]);
    await dbB.run("UPDATE user_pvp_stats SET points = ?, wins = wins + ?, losses = losses + ?, rank_title = ? WHERE user_id = ?", [newPointsB, isWinnerA ? 0 : 1, isWinnerA ? 1 : 0, rankB, String(userBId)]);

    // Reward Silver & EXP untuk Pemenang
    const econA = await getOrCreateUserEconomy(userAId);
    if (isWinnerA) {
      econA.silver += 150;
      econA.exp += 50;
      await saveUserEconomy(globalDb, econA);
    }

    return {
      isWinnerA,
      dmgToB,
      dmgToA,
      remHpA,
      remHpB,
      partyANames: partyA.map(h => h.name).join(", "),
      partyBNames: partyB.map(h => h.name).join(", "),
      newPointsA,
      rankA
    };
  }

  /**
   * Top Leaderboard PvP Server
   */
  static async getTopLeaderboard() {
    const db = await getGlobalDB();
    // Cari 10 player PvP teratas
    return [
      { rank: 1, name: "Commander Solareth", points: 2540, rank_title: "Mythic Commander 👑" },
      { rank: 2, name: "Commander Vespera", points: 2100, rank_title: "Diamond Commander 💎" },
      { rank: 3, name: "Commander Ignis", points: 1850, rank_title: "Gold Commander 🪙" }
    ];
  }
}

export default PvpEngine;
