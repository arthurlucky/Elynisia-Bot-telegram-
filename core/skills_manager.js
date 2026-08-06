import { getUserDB, getGlobalDB } from "./db.js";
import { getOrCreateUserEconomy, saveUserEconomy } from "./economy.js";

// Procedural RPG Skill Name Generator
export function generateEvolvedName(baseName, element, type, stage) {
  const prefixes = {
    fire: ["Inferno", "Blazing", "Crimson", "Solar", "Volcanic", "Pyre", "Promethean", "Supernova"],
    water: ["Tidal", "Abyssal", "Torrential", "Oceanic", "Tsunami", "Hydro", "Cascade"],
    ice: ["Frostbite", "Glacial", "Boreal", "Absolute Zero", "Cryo", "Blizzard", "Permafrost"],
    wind: ["Cyclone", "Tempest", "Gale", "Zephyr", "Hurricane", "Aero", "Skyward"],
    earth: ["Tectonic", "Seismic", "Geode", "Obsidian", "Lithic", "Terrene", "Granite"],
    lightning: ["Volt", "Thunderbolt", "Storm", "Fulminating", "Plasma", "Galvanic", "Static"],
    holy: ["Divine", "Sacred", "Miraculous", "Seraphic", "Celestial", "Hallowed", "Sanctified"],
    dark: ["Umbral", "Void", "Shadow", "Eldritch", "Obscure", "Abyssal", "Eclipse", "Nocturnal"],
    poison: ["Venomous", "Toxic", "Noxious", "Miasmic", "Blighted", "Viperous", "Corrosive"],
    nature: ["Sylvan", "Verdant", "Overgrowth", "Spore", "Wildwood", "Botanical", "Foliage"],
    void: ["Singularity", "Null", "Ethereal", "Void-bent", "Cosmic", "Astral", "Spatial"]
  };

  const suffixes = {
    attack: ["Burst", "Strike", "Nova", "Cataclysm", "Apocalypse", "Collapse", "Torrent", "Rain", "Sphere", "Slash", "Rage", "Impact"],
    defense: ["Wall", "Dome", "Aegis", "Fortress", "Bastion", "Ward", "Sanctuary", "Barrier", "Shield", "Bulwark"],
    recovery: ["Blessing", "Regeneration", "Grace", "Rebirth", "Restoration", "Salvation", "Heal", "Sanctuary", "Prayer"]
  };

  const el = element ? element.toLowerCase() : "fire";
  const ty = type ? type.toLowerCase() : "attack";

  const prefList = prefixes[el] || ["Aura", "Ether", "Mystic"];
  const suffList = suffixes[ty] || ["Sphere", "Blast", "Pulse"];

  const pref = prefList[Math.floor((Math.random() * prefList.length))];
  const suff = suffList[Math.floor((Math.random() * suffList.length))];

  return `${pref} ${suff}`;
}

// Masteries array for rank mapping
const MASTERIES = [
  { rank: "Novice", req: 0 },
  { rank: "Beginner", req: 10 },
  { rank: "Intermediate", req: 30 },
  { rank: "Advanced", req: 60 },
  { rank: "Expert", req: 100 },
  { rank: "Master", req: 150 },
  { rank: "Grandmaster", req: 220 },
  { rank: "Legend", req: 300 },
  { rank: "Mythic", req: 400 },
  { rank: "Transcendent", req: 500 }
];

export class SkillsManager {
  /**
   * Seed default skills if user has none
   */
  static async seedDefaultSkills(userId) {
    const db = await getUserDB(userId);
    const existing = await db.all("SELECT * FROM rpg_skills");
    
    if (existing.length === 0) {
      const defaults = [
        {
          skill_key: "slash",
          name: "Slash",
          category: "normal",
          type: "attack",
          element: "Void",
          rarity: "Normal",
          max_level: 50,
          cooldown: 0,
          cost_value: 0,
          cost_type: "stamina",
          is_equipped: 1
        },
        {
          skill_key: "fireball",
          name: "Fireball",
          category: "normal",
          type: "attack",
          element: "Fire",
          rarity: "Normal",
          max_level: 50,
          cooldown: 3,
          cost_value: 15,
          cost_type: "mana",
          is_equipped: 1
        },
        {
          skill_key: "heal",
          name: "Heal",
          category: "normal",
          type: "recovery",
          element: "Holy",
          rarity: "Normal",
          max_level: 50,
          cooldown: 5,
          cost_value: 20,
          cost_type: "mana",
          is_equipped: 1
        },
        {
          skill_key: "barrier",
          name: "Barrier",
          category: "normal",
          type: "defense",
          element: "Light",
          rarity: "Normal",
          max_level: 50,
          cooldown: 2,
          cost_value: 10,
          cost_type: "mana",
          is_equipped: 0
        }
      ];

      for (const s of defaults) {
        await db.run(
          "INSERT OR REPLACE INTO rpg_skills (skill_key, name, category, type, element, rarity, level, exp, max_level, cooldown, cost_value, cost_type, is_equipped, mastery, mastery_points, evolution_stage) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, ?, 'Novice', 0, 1)",
          [
            s.skill_key,
            s.name,
            s.category,
            s.type,
            s.element,
            s.rarity,
            s.max_level,
            s.cooldown,
            s.cost_value,
            s.cost_type,
            s.is_equipped
          ]
        );
      }
    }
  }

  /**
   * Get all user skills (auto-seeding if empty)
   */
  static async getUserSkills(userId) {
    await this.seedDefaultSkills(userId);
    const db = await getUserDB(userId);
    return db.all("SELECT * FROM rpg_skills");
  }

  /**
   * Get specific skill
   */
  static async getSkill(userId, skillKey) {
    const db = await getUserDB(userId);
    return db.get("SELECT * FROM rpg_skills WHERE skill_key = ? OR LOWER(name) = ?", [skillKey.toLowerCase(), skillKey.toLowerCase()]);
  }

  /**
   * Equip skill
   */
  static async equipSkill(userId, skillKey) {
    const db = await getUserDB(userId);
    const skill = await this.getSkill(userId, skillKey);
    if (!skill) throw new Error("Skill tidak ditemukan.");

    if (skill.is_equipped === 1) {
      throw new Error("Skill ini sudah terpasang.");
    }

    const activeSkills = await db.all("SELECT * FROM rpg_skills WHERE is_equipped = 1");
    if (activeSkills.length >= 4) {
      throw new Error("Maksimal 4 skill aktif yang dapat dipasang. Lepaskan salah satu terlebih dahulu.");
    }

    await db.run("UPDATE rpg_skills SET is_equipped = 1 WHERE skill_key = ?", [skill.skill_key]);
    return skill;
  }

  /**
   * Unequip skill
   */
  static async unequipSkill(userId, skillKey) {
    const db = await getUserDB(userId);
    const skill = await this.getSkill(userId, skillKey);
    if (!skill) throw new Error("Skill tidak ditemukan.");

    if (skill.is_equipped === 0) {
      throw new Error("Skill ini tidak terpasang.");
    }

    await db.run("UPDATE rpg_skills SET is_equipped = 0 WHERE skill_key = ?", [skill.skill_key]);
    return skill;
  }

  /**
   * Upgrade skill using gemstone from inventory & gold/exp
   */
  static async upgradeSkill(userId, skillKey) {
    const db = await getUserDB(userId);
    const globalDb = await getGlobalDB();
    
    const skill = await this.getSkill(userId, skillKey);
    if (!skill) throw new Error("Skill tidak ditemukan.");

    if (skill.level >= skill.max_level) {
      throw new Error("Skill sudah mencapai level maksimum.");
    }

    // Determine required gemstone based on current level
    let requiredGem = "White Gem";
    const lv = skill.level;
    if (lv >= 11 && lv <= 20) requiredGem = "Blue Gem";
    else if (lv >= 21 && lv <= 30) requiredGem = "Light Green Gem";
    else if (lv >= 31 && lv <= 40) requiredGem = "Green Gem";
    else if (lv >= 41) requiredGem = "Dark Green Gem";

    // Check inventory for the required gemstone
    const inventoryItem = await globalDb.get(
      "SELECT * FROM inventory WHERE user_id = ? AND LOWER(item_name) = ? AND quantity > 0",
      [String(userId), requiredGem.toLowerCase()]
    );

    if (!inventoryItem) {
      throw new Error(`Kebutuhan Gemstone tidak terpenuhi: Memerlukan *1x ${requiredGem}* untuk upgrade.`);
    }

    const goldCost = lv * 10;
    const economy = await getOrCreateUserEconomy(userId);
    if (economy.gold < goldCost) {
      throw new Error(`Gold tidak mencukupi: Memerlukan *${goldCost} Gold* 🪙.`);
    }

    // Deduct cost and gemstone
    economy.gold -= goldCost;
    await saveUserEconomy(globalDb, economy);

    const newQty = inventoryItem.quantity - 1;
    if (newQty <= 0) {
      await globalDb.run("DELETE FROM inventory WHERE id = ?", [inventoryItem.id]);
    } else {
      await globalDb.run("UPDATE inventory SET quantity = ? WHERE id = ?", [newQty, inventoryItem.id]);
    }

    // Upgrade skill
    const nextLevel = lv + 1;
    await db.run("UPDATE rpg_skills SET level = ? WHERE skill_key = ?", [nextLevel, skill.skill_key]);

    return { skillName: skill.name, nextLevel, requiredGem, goldCost };
  }

  /**
   * Evolve skill to advanced version
   */
  static async evolveSkill(userId, skillKey) {
    const db = await getUserDB(userId);
    const skill = await this.getSkill(userId, skillKey);
    if (!skill) throw new Error("Skill tidak ditemukan.");

    if (skill.level < 10 * skill.evolution_stage) {
      throw new Error(`Persyaratan evolusi belum terpenuhi: Level minimal *${10 * skill.evolution_stage}*.`);
    }

    const nextStage = skill.evolution_stage + 1;
    const evolvedName = generateEvolvedName(skill.name, skill.element, skill.type, nextStage);

    await db.run(
      "UPDATE rpg_skills SET name = ?, evolution_stage = ?, category = 'advanced', rarity = ?, cooldown = ? WHERE skill_key = ?",
      [
        evolvedName,
        nextStage,
        nextStage >= 3 ? "Legendary" : "Rare",
        Math.max(1, skill.cooldown - 1),
        skill.skill_key
      ]
    );

    return { oldName: skill.name, evolvedName, nextStage };
  }

  /**
   * Trigger skill usage effects: EXP +25, Mastery points +1, checks level & mastery rank upgrades
   */
  static async useSkill(userId, skillKey) {
    const db = await getUserDB(userId);
    const skill = await this.getSkill(userId, skillKey);
    if (!skill) return null;

    let nextExp = skill.exp + 25;
    let nextLevel = skill.level;
    const expReq = skill.level * 100;
    let leveledUp = false;

    if (nextExp >= expReq && nextLevel < skill.max_level) {
      nextExp -= expReq;
      nextLevel++;
      leveledUp = true;
    }

    const nextMasteryPoints = skill.mastery_points + 1;
    
    // Determine mastery rank
    let currentMastery = "Novice";
    for (const m of MASTERIES) {
      if (nextMasteryPoints >= m.req) {
        currentMastery = m.rank;
      }
    }

    await db.run(
      "UPDATE rpg_skills SET level = ?, exp = ?, mastery = ?, mastery_points = ? WHERE skill_key = ?",
      [nextLevel, nextExp, currentMastery, nextMasteryPoints, skill.skill_key]
    );

    return {
      skillName: skill.name,
      leveledUp,
      nextLevel,
      currentMastery,
      masteryUpgraded: currentMastery !== skill.mastery
    };
  }

  /**
   * Get 3 daily skills consistently rotated based on date seed
   */
  static getDailySkills() {
    const allShopSkills = [
      { skill_key: "windblade", name: "Wind Blade", category: "normal", type: "attack", element: "Wind", rarity: "Rare", cooldown: 2, cost_value: 10, cost_type: "mana", price: 20 },
      { skill_key: "regeneration", name: "Regeneration", category: "normal", type: "recovery", element: "Nature", rarity: "Rare", cooldown: 4, cost_value: 12, cost_type: "mana", price: 20 },
      { skill_key: "shielddome", name: "Shield Dome", category: "normal", type: "defense", element: "Earth", rarity: "Rare", cooldown: 3, cost_value: 15, cost_type: "mana", price: 25 },
      { skill_key: "thunderstrike", name: "Thunder Strike", category: "normal", type: "attack", element: "Lightning", rarity: "Epic", cooldown: 3, cost_value: 18, cost_type: "mana", price: 35 },
      { skill_key: "shadowstep", name: "Shadow Step", category: "normal", type: "defense", element: "Dark", rarity: "Rare", cooldown: 3, cost_value: 15, cost_type: "mana", price: 25 },
      { skill_key: "ironwall", name: "Iron Wall", category: "normal", type: "defense", element: "Earth", rarity: "Epic", cooldown: 4, cost_value: 20, cost_type: "mana", price: 35 },
      { skill_key: "viperbite", name: "Viper Bite", category: "normal", type: "attack", element: "Poison", rarity: "Rare", cooldown: 2, cost_value: 8, cost_type: "stamina", price: 20 },
      { skill_key: "blessing", name: "Blessing", category: "normal", type: "recovery", element: "Light", rarity: "Epic", cooldown: 5, cost_value: 25, cost_type: "mana", price: 40 }
    ];

    const todayDays = Math.floor(Date.now() / 86400000);
    let seed = todayDays;
    const lcg = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    const selected = [];
    const pool = [...allShopSkills];
    for (let i = 0; i < 3; i++) {
      const idx = Math.floor(lcg() * pool.length);
      selected.push(pool.splice(idx, 1)[0]);
    }
    return selected;
  }

  /**
   * Buy a daily skill
   */
  static async buyDailySkill(userId, skillKey) {
    const daily = this.getDailySkills();
    const s = daily.find(item => item.skill_key === skillKey.toLowerCase());
    if (!s) {
      throw new Error("Skill ini tidak tersedia di shop hari ini.");
    }

    const db = await getUserDB(userId);
    const globalDb = await getGlobalDB();

    // Check if player already owns the skill
    const owned = await db.get("SELECT * FROM rpg_skills WHERE skill_key = ?", [s.skill_key]);
    if (owned) {
      throw new Error("Anda sudah memiliki skill ini!");
    }

    const economy = await getOrCreateUserEconomy(userId);
    if (economy.gold < s.price) {
      throw new Error(`Gold Anda tidak mencukupi. Memerlukan *${s.price} Gold* 🪙.`);
    }

    // Deduct gold
    economy.gold -= s.price;
    await saveUserEconomy(globalDb, economy);

    // Save skill
    await db.run(
      "INSERT OR REPLACE INTO rpg_skills (skill_key, name, category, type, element, rarity, level, exp, max_level, cooldown, cost_value, cost_type, is_equipped, mastery, mastery_points, evolution_stage) VALUES (?, ?, ?, ?, ?, ?, 1, 0, 50, ?, ?, ?, 0, 'Novice', 0, 1)",
      [s.skill_key, s.name, s.category, s.type, s.element, s.rarity, s.cooldown, s.cost_value, s.cost_type]
    );

    return s;
  }
}

export default SkillsManager;
