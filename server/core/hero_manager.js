/**
 * core/hero_manager.js
 * Hero Manager & Gacha System untuk Elynisia RPG
 */

import { getUserDB, getGlobalDB } from "../../client/core/db.js";
import { getOrCreateUserEconomy, saveUserEconomy } from "../../client/core/economy.js";
import HeroGenerator, { HERO_RARITIES } from "./hero_generator.js";

export class HeroManager {
  /**
   * Mengambil semua Hero milik Commander
   */
  static async getUserHeroes(userId) {
    const db = await getUserDB(userId);
    return db.all("SELECT * FROM user_heroes WHERE user_id = ? ORDER BY star DESC, level DESC", [String(userId)]);
  }

  /**
   * Mengambil detail 1 Hero milik Commander
   */
  static async getHeroDetail(userId, heroId) {
    const db = await getUserDB(userId);
    return db.get("SELECT * FROM user_heroes WHERE user_id = ? AND hero_id = ?", [String(userId), heroId]);
  }

  /**
   * Menyimpan Hero baru ke database Commander
   */
  static async addHeroToUser(userId, hero) {
    const db = await getUserDB(userId);
    await db.run(
      `INSERT INTO user_heroes (
        hero_id, user_id, name, surname, nickname, country, race, gender, age, height,
        personality, hobby, likes, dislikes, weakness, theme_color, class_name, element,
        rarity, star, growth_type, level, exp, hp, max_hp, mana, max_mana, atk, matk,
        def, mdef, speed, crit_rate, crit_dmg, affinity, trust, dialog_summon, lore,
        background_json, skills_json, equipment_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        hero.hero_id, String(userId), hero.name, hero.surname, hero.nickname, hero.country, hero.race, hero.gender, hero.age, hero.height,
        hero.personality, hero.hobby, hero.likes, hero.dislikes, hero.weakness, hero.theme_color, hero.class_name, hero.element,
        hero.rarity, hero.star, hero.growth_type, hero.level, hero.exp, hero.hp, hero.max_hp, hero.mana, hero.max_mana, hero.atk, hero.matk,
        hero.def, hero.mdef, hero.speed, hero.crit_rate, hero.crit_dmg, hero.affinity, hero.trust, hero.dialog_summon, hero.lore,
        hero.background_json, hero.skills_json, hero.equipment_json, hero.created_at
      ]
    );
    return hero;
  }

  /**
   * GACHA SYSTEM (/gacha basic|premium|super)
   */
  static async pullGacha(userId, bannerType = "basic", count = 1) {
    const globalDb = await getGlobalDB();
    const economy = await getOrCreateUserEconomy(userId);

    // Biaya gacha per pull
    const costs = {
      basic: { currency: "silver", amount: 100 },
      premium: { currency: "gold", amount: 10 },
      super: { currency: "gems", amount: 1 }
    };

    const cost = costs[bannerType] || costs.basic;
    const totalCost = cost.amount * count;

    if (economy[cost.currency] < totalCost) {
      throw new Error(`Mata uang ${cost.currency.toUpperCase()} Anda tidak cukup! Butuh ${totalCost} ${cost.currency.toUpperCase()}.`);
    }

    // Potong saldo
    economy[cost.currency] -= totalCost;
    await saveUserEconomy(globalDb, economy);

    const results = [];
    for (let i = 0; i < count; i++) {
      let rarityOverride = null;
      if (bannerType === "premium") {
        rarityOverride = ["Rare", "Epic", "Legendary", "Mythic"][Math.floor(Math.random() * 4)];
      } else if (bannerType === "super") {
        rarityOverride = ["Epic", "Legendary", "Mythic", "Unique", "Divine"][Math.floor(Math.random() * 5)];
      }

      const hero = HeroGenerator.generateHero(rarityOverride);
      await this.addHeroToUser(userId, hero);
      results.push(hero);
    }

    return { results, costUsed: `${totalCost} ${cost.currency.toUpperCase()}` };
  }

  /**
   * HERO UP STAR (/hero upstar <hero_id>)
   */
  static async upStarHero(userId, heroId) {
    const db = await getUserDB(userId);
    const hero = await this.getHeroDetail(userId, heroId);

    if (!hero) throw new Error(`Hero ID '${heroId}' tidak ditemukan di koleksi Anda!`);
    if (hero.star >= 7) throw new Error(`Hero ${hero.name} sudah mencapai Star Maksimal (7 Star)!`);

    const newStar = hero.star + 1;
    const atkBonus = Math.floor(hero.atk * 0.25) + 20;
    const defBonus = Math.floor(hero.def * 0.20) + 15;
    const hpBonus = Math.floor(hero.max_hp * 0.30) + 200;

    const newAtk = hero.atk + atkBonus;
    const newDef = hero.def + defBonus;
    const newHp = hero.hp + hpBonus;
    const newMaxHp = hero.max_hp + hpBonus;

    // Cek jika Star 3 tercapai -> Unlock Class jika belum ada
    let newClass = hero.class_name;
    if (newStar >= 3 && (newClass === "None" || !newClass)) {
      const classes = ["Knight", "Mage", "Priest", "Guardian", "Paladin", "Assassin"];
      newClass = classes[Math.floor(Math.random() * classes.length)];
    }

    await db.run(
      "UPDATE user_heroes SET star = ?, atk = ?, def = ?, hp = ?, max_hp = ?, class_name = ? WHERE user_id = ? AND hero_id = ?",
      [newStar, newAtk, newDef, newHp, newMaxHp, newClass, String(userId), heroId]
    );

    return {
      name: `${hero.name} ${hero.surname}`,
      oldStar: hero.star,
      newStar,
      atkBonus,
      defBonus,
      hpBonus,
      newClass
    };
  }

  /**
   * HERO SYNTHESIZE (/hero synthesize <target_hero_id> <material_hero_id_1> ...)
   */
  static async synthesizeHero(userId, targetHeroId, materialHeroIds = []) {
    const db = await getUserDB(userId);
    const target = await this.getHeroDetail(userId, targetHeroId);
    if (!target) throw new Error(`Hero target '${targetHeroId}' tidak ditemukan!`);

    let expGained = 0;
    let count = 0;

    for (const matId of materialHeroIds) {
      if (matId === targetHeroId) continue;
      const mat = await this.getHeroDetail(userId, matId);
      if (mat) {
        expGained += mat.star * 150 + mat.level * 20;
        await db.run("DELETE FROM user_heroes WHERE user_id = ? AND hero_id = ?", [String(userId), matId]);
        count++;
      }
    }

    if (count === 0) throw new Error("Tidak ada Hero material valid yang dikonsumsi.");

    const newExp = target.exp + expGained;
    let newLevel = target.level;
    let reqExp = newLevel * 100;
    while (newExp >= reqExp) {
      newLevel++;
      reqExp = newLevel * 100;
    }

    await db.run("UPDATE user_heroes SET exp = ?, level = ? WHERE user_id = ? AND hero_id = ?", [newExp, newLevel, String(userId), targetHeroId]);

    return { targetName: target.name, count, expGained, newLevel };
  }

  /**
   * GIVE ITEM TO HERO (/giveitem <hero_id> <item_id>)
   */
  static async giveItemToHero(userId, heroId, itemName) {
    const db = await getUserDB(userId);
    const globalDb = await getGlobalDB();

    const hero = await this.getHeroDetail(userId, heroId);
    if (!hero) throw new Error(`Hero ID '${heroId}' tidak ditemukan!`);

    const inv = await globalDb.get("SELECT * FROM inventory WHERE user_id = ? AND item_name = ? AND quantity > 0", [String(userId), itemName]);
    if (!inv) throw new Error(`Item '${itemName}' tidak tersedia di Inventory Commander Anda!`);

    // Tambah stat bonus ke Hero
    const atkAdd = itemName.includes("Pedang") || itemName.includes("Sword") ? 25 : 5;
    const defAdd = itemName.includes("Perisai") || itemName.includes("Armor") ? 20 : 5;

    await db.run(
      "UPDATE user_heroes SET atk = atk + ?, def = def + ? WHERE user_id = ? AND hero_id = ?",
      [atkAdd, defAdd, String(userId), heroId]
    );

    // Potong item dari inventory
    if (inv.quantity <= 1) {
      await globalDb.run("DELETE FROM inventory WHERE id = ?", [inv.id]);
    } else {
      await globalDb.run("UPDATE inventory SET quantity = quantity - 1 WHERE id = ?", [inv.id]);
    }

    return { heroName: hero.name, itemName, atkAdd, defAdd };
  }

  /**
   * HITUNG SINERGI ELEMEN & EFEK FORMASI PARTY
   */
  static getPartySynergy(partyHeroes = []) {
    if (partyHeroes.length === 0) return { bonuses: [], dmgMultiplier: 1.0, defMultiplier: 1.0, comboTitle: null };

    // Hitung frekuensi elemen
    const elemCounts = {};
    for (const h of partyHeroes) {
      const elem = h.element || "Physical";
      elemCounts[elem] = (elemCounts[elem] || 0) + 1;
    }

    const bonuses = [];
    let dmgMultiplier = 1.0;
    let defMultiplier = 1.0;

    for (const [elem, count] of Object.entries(elemCounts)) {
      if (count >= 3) {
        bonuses.push(`🔥 Sinergi 3x ${elem} (+30% ${elem} Damage Aura)`);
        dmgMultiplier += 0.30;
      } else if (count === 2) {
        bonuses.push(`✨ Sinergi 2x ${elem} (+15% ${elem} Damage Aura)`);
        dmgMultiplier += 0.15;
      }
    }

    // Hero Combo Ultimate Check (jika ada minimal 2 hero dengan kelas/elemen kuat)
    let comboTitle = null;
    if (partyHeroes.length >= 2) {
      const names = partyHeroes.map(h => h.name).join(" & ");
      comboTitle = `✨ UNLEASHED COMBO: Cross Elemental Burst (${names})`;
    }

    return { bonuses, dmgMultiplier, defMultiplier, comboTitle };
  }
}

export default HeroManager;
