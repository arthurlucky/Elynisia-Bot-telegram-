/**
 * core/battle_engine.js
 * Engine Pertarungan Turn-Based Hero Party vs Monster/Boss Tower RPG Elynisia
 */

import { getGlobalDB } from "../../client/core/db.js";
import { getOrCreateUserEconomy, saveUserEconomy } from "../../client/core/economy.js";
import HeroManager from "./hero_manager.js";
import TowerManager from "./tower_manager.js";

export class BattleEngine {
  /**
   * Jalankan 1 Turn Pertarungan (Hero Party Commander vs Monster/Boss)
   */
  static async executeTurn(userId, action = "attack", skillKey = null) {
    const state = await TowerManager.getUserState(userId);
    const room = TowerManager.getRoomInfo(state.floor, state.room_idx);
    const globalDb = await getGlobalDB();
    const economy = await getOrCreateUserEconomy(userId);

    // Ambil koleksi Hero Commander
    const heroes = await HeroManager.getUserHeroes(userId);
    if (heroes.length === 0) {
      throw new Error("Anda belum memiliki Hero untuk bertarung! Silakan rekrut Hero terlebih dahulu via `/gacha basic` atau `/gacha premium`.");
    }

    // Party aktif: Maksimal 4 Hero teratas di koleksi
    const party = heroes.slice(0, 4);
    const leader = party[0];

    // Hitung Elemental Synergy
    const synergy = HeroManager.getPartySynergy(party);

    // Hitung akumulasi statistik dari Party Hero
    const partyMaxHp = party.reduce((sum, h) => sum + (h.max_hp || 100), 0);
    const partyMaxMana = party.reduce((sum, h) => sum + (h.max_mana || 50), 0);
    const partyAtk = Math.floor(party.reduce((sum, h) => sum + (h.atk || 15), 0) * synergy.dmgMultiplier);
    const partyDef = Math.floor(party.reduce((sum, h) => sum + (h.def || 10), 0) * synergy.defMultiplier);

    let monsterHp = state.monster_hp > 0 ? state.monster_hp : room.monsterHp;
    let heroHp = state.hp > 0 ? Math.min(state.hp, partyMaxHp) : partyMaxHp;
    let heroMana = state.mana > 0 ? Math.min(state.mana, partyMaxMana) : partyMaxMana;
    let battleLogs = [];

    if (synergy.bonuses.length > 0) {
      battleLogs.push(`⚡ *PARTY SYNERGY:* ${synergy.bonuses.join(" | ")}`);
    }

    // --- TURN 1: HERO PARTY ACTION ---
    let heroDmg = Math.floor(partyAtk * (0.9 + Math.random() * 0.3));

    if (action === "skill") {
      const manaCost = 20;
      if (heroMana < manaCost) {
        throw new Error(`Mana Party tidak cukup! Membutuhkan ${manaCost} Mana (Tersedia: ${heroMana}).`);
      }
      heroMana -= manaCost;
      heroDmg = Math.floor(partyAtk * 1.8);
      monsterHp -= heroDmg;

      if (synergy.comboTitle) {
        battleLogs.push(`${synergy.comboTitle} → **${heroDmg} DMG** melumat musuh!`);
      } else {
        battleLogs.push(`✨ Leader *${leader.name} ${leader.surname}* memimpin Party melancarkan skill kombinasi elemen *${leader.element}* sebesar **${heroDmg} DMG**!`);
      }
    } else {
      // Normal Attack Party
      monsterHp -= heroDmg;
      battleLogs.push(`⚔️ Tim Hero Commander (@${party.map(h => h.name).join(", ")}) melancarkan serbuan fisik sebesar **${heroDmg} DMG** pada *${room.monsterName}*!`);
    }

    // Cek jika Monster mati
    if (monsterHp <= 0) {
      const newProgress = state.quest_progress + 1;
      const isQuestComplete = newProgress >= room.targetKills;

      // Reward EXP & Silver
      const expReward = 20 + state.floor * 10;
      const silverReward = 15 + state.floor * 8;

      economy.exp += expReward;
      economy.silver += silverReward;

      let levelUpStr = "";
      if (economy.exp >= economy.level * 100) {
        economy.level += 1;
        economy.gold += 10;
        levelUpStr = `\n🎉 *COMMANDER LEVEL UP!* Anda naik ke Level ${economy.level}! (+10 Gold)`;
      }

      await saveUserEconomy(globalDb, economy);

      if (isQuestComplete) {
        await TowerManager.saveState(userId, {
          floor: state.floor + (room.isBoss ? 1 : 0),
          room_idx: room.isBoss ? 0 : state.room_idx + 1,
          quest_progress: 0,
          in_battle: 0,
          hp: partyMaxHp,
          max_hp: partyMaxHp,
          mana: partyMaxMana,
          max_mana: partyMaxMana,
          monster_hp: 0
        });
      } else {
        await TowerManager.saveState(userId, {
          quest_progress: newProgress,
          in_battle: 0,
          hp: heroHp,
          max_hp: partyMaxHp,
          mana: heroMana,
          max_mana: partyMaxMana,
          monster_hp: 0
        });
      }

      return {
        status: "victory",
        monsterName: room.monsterName,
        expReward,
        silverReward,
        levelUpStr,
        isQuestComplete,
        newFloor: room.isBoss ? state.floor + 1 : state.floor,
        logs: battleLogs
      };
    }

    // --- TURN 2: MONSTER COUNTER ATTACK ---
    const rawMonsterDmg = Math.floor(room.monsterAtk * (0.8 + Math.random() * 0.4));
    const actualMonsterDmg = Math.max(5, rawMonsterDmg - Math.floor(partyDef * 0.3));
    heroHp -= actualMonsterDmg;
    battleLogs.push(`💥 *${room.monsterName}* membalas dan memberikan **${actualMonsterDmg} DMG** pada barisan Party Hero Anda!`);

    // Cek jika Party KO (Hero Knock Out - TANPA Reset Level Commander)
    if (heroHp <= 0) {
      await TowerManager.saveState(userId, {
        in_battle: 0,
        hp: Math.floor(partyMaxHp * 0.3), // Pulihkan 30% HP setelah KO
        max_hp: partyMaxHp,
        mana: partyMaxMana,
        max_mana: partyMaxMana,
        monster_hp: 0
      });

      return {
        status: "defeat",
        monsterName: room.monsterName,
        penaltyMsg: `💀 *PARTY HERO KNOCK OUT (KO)!*\nTim Hero Anda dikalahkan oleh *${room.monsterName}*. Hero Anda dievakuasi dan HP dipulihkan sebesar 30%.\n💡 Gunakan ramuan via \`/use\` atau perkuat Hero Anda via \`/hero upstar\`!`,
        logs: battleLogs
      };
    }

    // Simpan sisa pertarungan
    await TowerManager.saveState(userId, {
      in_battle: 1,
      hp: heroHp,
      max_hp: partyMaxHp,
      mana: heroMana,
      max_mana: partyMaxMana,
      monster_hp: monsterHp
    });

    return {
      status: "ongoing",
      monsterName: room.monsterName,
      monsterHp,
      monsterMaxHp: room.monsterHp,
      playerHp: heroHp,
      playerMaxHp: partyMaxHp,
      playerMana: heroMana,
      playerMaxMana: partyMaxMana,
      logs: battleLogs
    };
  }
}

export default BattleEngine;
