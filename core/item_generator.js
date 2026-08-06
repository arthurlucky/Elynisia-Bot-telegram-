/**
 * core/item_generator.js
 * Sub-Agent Item, Lore, & Family Generator untuk Elynisia RPG
 */

import { getGlobalDB } from "./db.js";
import crypto from "crypto";

export const RARITIES = [
  { name: "Trash", weight: 35, multiplier: 0.8 },
  { name: "Common", weight: 30, multiplier: 1.0 },
  { name: "Uncommon", weight: 15, multiplier: 1.3 },
  { name: "Rare", weight: 10, multiplier: 1.7 },
  { name: "Super Rare", weight: 5, multiplier: 2.2 },
  { name: "Epic", weight: 3, multiplier: 3.0 },
  { name: "Legendary", weight: 1.5, multiplier: 4.5 },
  { name: "Mythic", weight: 0.4, multiplier: 6.5 },
  { name: "Unique", weight: 0.08, multiplier: 9.0 },
  { name: "Divine", weight: 0.015, multiplier: 13.0 },
  { name: "Transcendent", weight: 0.005, multiplier: 20.0 }
];

export const CATEGORIES = [
  "Sword", "Great Sword", "Katana", "Staff", "Wand", "Bow", "Crossbow",
  "Shield", "Armor", "Helmet", "Boots", "Gloves", "Necklace", "Ring",
  "Potion", "Material", "Rune", "Artifact", "Relic", "Scroll", "Food"
];

const FAMILIES = [
  {
    name: "Dragon of Hell",
    theme: "Fire & Infernal",
    loreSuffix: "ditempa dari darah naga penguasa neraka terdalam.",
    bonus2: "+15% Fire Damage",
    bonus4: "+30% Fire Damage",
    bonus6: "Unlock Skill: Dragon Hell Flame",
    bonus8: "Unlock Passive: Dragon King's Blood"
  },
  {
    name: "Frostbite Sovereign",
    theme: "Ice & Glacier",
    loreSuffix: "membeku dalam keabadian puncak es tertinggi.",
    bonus2: "+15% Ice Damage",
    bonus4: "+30% Ice Damage & Slow Effect",
    bonus6: "Unlock Skill: Glacial Avalanche",
    bonus8: "Unlock Passive: Frozen Heart Protection"
  },
  {
    name: "Shadow Wraith",
    theme: "Dark & Void",
    loreSuffix: "tercipta dari bayangan para ksatria yang terlupakan.",
    bonus2: "+20% Critical Rate",
    bonus4: "+40% Critical Damage",
    bonus6: "Unlock Skill: Shadow Step Slash",
    bonus8: "Unlock Passive: Immortal Shade"
  },
  {
    name: "Celestial Seraph",
    theme: "Light & Holy",
    loreSuffix: "diberkati oleh cahaya suci para dewa pelindung.",
    bonus2: "+25% Healing Effect",
    bonus4: "+35% Holy Shield Absorption",
    bonus6: "Unlock Skill: Divine Judgment",
    bonus8: "Unlock Passive: Angelic Resurrection"
  }
];

const LORE_TEMPLATES = [
  "Ditempa di masa purba saat dunia dilanda perang besar.",
  "Konon disimpan dalam dada monster legendaris selama ribuan tahun.",
  "Memancarkan aura kuat yang membuat musuh bergidik ketakutan.",
  "Dibuat oleh pandai besi legendaris menggunakan bahan yang sudah punah.",
  "Senjata ini menyerap energi dari setiap musuh yang dikalahkannya."
];

function weightedChoice(list) {
  const totalWeight = list.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  for (const item of list) {
    if (random < item.weight) return item;
    random -= item.weight;
  }
  return list[0];
}

export class ItemGenerator {
  static config = {
    intervalHours: 5,
    itemsPerBatch: 10
  };

  /**
   * Hasilkan 1 Item spesifik atau acak
   */
  static generateItem(familyOverride = null) {
    const rarityObj = weightedChoice(RARITIES);
    const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const family = familyOverride || FAMILIES[Math.floor(Math.random() * FAMILIES.length)];

    const id = `ITM-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const name = `${family.name} ${category}`;

    const mult = rarityObj.multiplier;
    const baseStat = Math.floor((Math.random() * 15 + 5) * mult);

    const isWeapon = ["Sword", "Great Sword", "Katana", "Staff", "Wand", "Bow", "Crossbow"].includes(category);
    const isArmor = ["Shield", "Armor", "Helmet", "Boots", "Gloves"].includes(category);
    const isAccessory = ["Necklace", "Ring", "Rune", "Artifact", "Relic"].includes(category);

    const atk = isWeapon ? baseStat * 2 : isAccessory ? Math.floor(baseStat * 0.5) : 0;
    const def = isArmor ? baseStat * 2 : isAccessory ? Math.floor(baseStat * 0.5) : 0;
    const magic = category === "Staff" || category === "Wand" || isAccessory ? Math.floor(baseStat * 1.5) : 0;
    const crit = isWeapon || isAccessory ? Math.floor(Math.random() * 10 * mult) : 0;
    const speed = isWeapon || category === "Boots" ? Math.floor(Math.random() * 8 * mult) : 0;

    // Kalkulasi Harga berdasarkan Stat & Rarity
    const statSum = atk + def + magic + crit + speed;
    const price = Math.floor((statSum * 15 + 50) * mult);

    const baseLore = LORE_TEMPLATES[Math.floor(Math.random() * LORE_TEMPLATES.length)];
    const lore = `"${name} — ${baseLore} Senjata ini ${family.loreSuffix}"`;

    const setBonus = {
      family: family.name,
      set2: family.bonus2,
      set4: family.bonus4,
      set6: family.bonus6,
      set8: family.bonus8
    };

    return {
      id,
      name,
      category,
      rarity: rarityObj.name,
      family: family.name,
      atk,
      def,
      magic,
      crit,
      speed,
      price,
      lore,
      set_bonus_json: JSON.stringify(setBonus),
      generated_at: Date.now(),
      generator_version: "v1.0-subagent",
      status: "available"
    };
  }

  /**
   * Hasilkan sekelompok item (Item Batch Generation)
   */
  static async generateBatch(count = 10) {
    const db = await getGlobalDB();
    const generated = [];

    // Pilih 1 Family acak untuk tema batch ini
    const selectedFamily = FAMILIES[Math.floor(Math.random() * FAMILIES.length)];

    for (let i = 0; i < count; i++) {
      const item = this.generateItem(selectedFamily);
      await db.run(
        `INSERT INTO items_database (id, name, category, rarity, family, atk, def, magic, crit, speed, price, lore, set_bonus_json, generated_at, generator_version, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id, item.name, item.category, item.rarity, item.family,
          item.atk, item.def, item.magic, item.crit, item.speed,
          item.price, item.lore, item.set_bonus_json, item.generated_at,
          item.generator_version, item.status
        ]
      );
      generated.push(item);
    }

    return { family: selectedFamily.name, count: generated.length, items: generated };
  }

  /**
   * Inisialisasi Scheduler Pembuat Item Otomatis
   */
  static startAutoGenerator() {
    const intervalMs = this.config.intervalHours * 60 * 60 * 1000;
    setInterval(async () => {
      try {
        console.log("[Sub-Agent ItemGenerator] Generating new item batch...");
        await this.generateBatch(this.config.itemsPerBatch);
      } catch (err) {
        console.error("[Sub-Agent ItemGenerator Error]", err.message);
      }
    }, intervalMs);
  }
}

export default ItemGenerator;
