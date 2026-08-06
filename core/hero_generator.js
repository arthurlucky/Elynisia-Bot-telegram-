/**
 * core/hero_generator.js
 * Sub-Agent Hero & Lore Generator untuk Elynisia RPG
 * Menghasilkan Hero unik secara prosedural lengkap dengan identitas, statistik, class, lore, & cerita multi-halaman.
 */

import crypto from "crypto";

const HERO_FIRST_NAMES = [
  "Alsera", "Kira", "Valen", "Aeliana", "Darian", "Elysia", "Zane", "Lyra", 
  "Caelum", "Vespera", "Ignis", "Sylvia", "Orion", "Talia", "Rune", "Astrid",
  "Freya", "Gideon", "Mireia", "Kaelen", "Rowan", "Seraphina", "Theron", "Zephyr"
];

const HERO_SURNAMES = [
  "Of Country", "Solareth", "Vanguard", "Nightshade", "Stormbreaker", "Ironheart",
  "Silverwing", "Flameborne", "Shadowweaver", "Frostfall", "Dawnseeker", "Bloodfang"
];

const NICKNAMES = [
  "The Flame Knight", "Shadow Stalker", "Storm Bringer", "Silent Assassin",
  "Guardian of Light", "Frost Sovereign", "Nature Whisperer", "Void Walker",
  "Dragon Slayer", "Blade Dancer", "Celestial Oracle", "Abyss Hunter"
];

const COUNTRIES = ["Solareth", "Glacia", "Ignia", "Sylvana", "Umbra", "Aetheria", "Terrania", "Volcania"];
const RACES = ["Human", "Elf", "High Elf", "Beastkin", "Dragonkin", "Demon", "Celestial", "Spirit", "Dwarf"];
const GENDERS = ["Male", "Female"];
const PERSONALITIES = ["Calm", "Aggressive", "Cheerful", "Cold", "Fearless", "Greedy", "Loyal", "Lazy"];
const HOBBIES = ["Membaca Kitab Kuno", "Berburu Monster", "Melatih Pedang", "Membuat Ramuan", "Tidur di Bawah Pohon", "Mengoleksi Permata"];
const LIKES = ["Daging Bakar", "Kemenangan", "Keheningan", "Kawan Setia", "Cahaya Bulan", "Petualangan"];
const DISLIKES = ["Pengkhianatan", "Sayur Pahit", "Kebisingan", "Kekalahan", "Hawa Panas", "Kedengkian"];
const WEAKNESSES = ["Terlalu Emosional", "Lupa Arah Jalur", "Kurang Percaya Diri", "Mudah Tergiur Harta", "Ceroboh"];

const ELEMENTS = ["Fire", "Water", "Ice", "Earth", "Wind", "Lightning", "Holy", "Dark", "Nature", "Metal", "Poison", "Void", "Light"];

const CLASSES = [
  "Knight", "Mage", "Priest", "Guardian", "Paladin", 
  "Dragon Knight", "Rune Master", "Spirit Tamer", "Necromancer", "Assassin"
];

const GROWTH_TYPES = ["Fast Growth", "Balanced", "Late Bloom", "Legendary", "Ancient"];

export const HERO_RARITIES = [
  { name: "Common", weight: 40, baseStat: 15, baseStar: 1 },
  { name: "Uncommon", weight: 30, baseStat: 22, baseStar: 1 },
  { name: "Rare", weight: 15, baseStat: 30, baseStar: 2 },
  { name: "Epic", weight: 9, baseStat: 45, baseStar: 3 },
  { name: "Legendary", weight: 4, baseStat: 65, baseStar: 4 },
  { name: "Mythic", weight: 1.5, baseStat: 90, baseStar: 5 },
  { name: "Unique", weight: 0.4, baseStat: 120, baseStar: 5 },
  { name: "Divine", weight: 0.1, baseStat: 160, baseStar: 6 }
];

function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedChoice(list) {
  const totalWeight = list.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  for (const item of list) {
    if (random < item.weight) return item;
    random -= item.weight;
  }
  return list[0];
}

export class HeroGenerator {
  /**
   * Menghasilkan Hero Unik Prosedural
   */
  static generateHero(rarityOverride = null) {
    const rarityObj = rarityOverride ? HERO_RARITIES.find(r => r.name === rarityOverride) || HERO_RARITIES[0] : weightedChoice(HERO_RARITIES);
    const star = rarityObj.baseStar;
    const name = choice(HERO_FIRST_NAMES);
    const surname = choice(HERO_SURNAMES);
    const nickname = choice(NICKNAMES);

    // Formating Hero ID: XXXX-UXXXX-XXXX
    const p1 = name.substring(0, 4).toUpperCase().padEnd(4, 'X');
    const p2 = `U${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
    const p3 = crypto.randomBytes(2).toString("hex").toUpperCase();
    const heroId = `${p1}-${p2}-${p3}`;

    const country = choice(COUNTRIES);
    const race = choice(RACES);
    const gender = choice(GENDERS);
    const age = Math.floor(Math.random() * 80) + 16;
    const height = Math.floor(Math.random() * 50) + 145;
    const personality = choice(PERSONALITIES);
    const element = choice(ELEMENTS);
    const growthType = choice(GROWTH_TYPES);

    // Hero dibawah Star 3 belum memiliki Class
    const heroClass = star >= 3 ? choice(CLASSES) : "None";

    const baseStat = rarityObj.baseStat;
    const hp = baseStat * 10 + Math.floor(Math.random() * 50);
    const mana = baseStat * 3 + Math.floor(Math.random() * 20);
    const atk = baseStat * 2 + Math.floor(Math.random() * 10);
    const matk = heroClass === "Mage" || heroClass === "Priest" ? atk * 1.5 : Math.floor(atk * 0.6);
    const def = baseStat + Math.floor(Math.random() * 8);
    const mdef = baseStat + Math.floor(Math.random() * 8);
    const speed = Math.floor(Math.random() * 15) + 10;
    const critRate = Math.floor(Math.random() * 10) + 5;
    const critDmg = 150 + Math.floor(Math.random() * 30);

    const colors = ["#FF4500", "#1E90FF", "#32CD32", "#FFD700", "#8A2BE2", "#FF1493", "#00CED1"];
    const themeColor = choice(colors);

    const dialogSummon = `"Saya ${name} ${surname}, ${nickname}. Perintahkan saya, Commander!"`;
    const lore = `${name} berasal dari ${country}. Sebagai seorang ${race} berpribadian ${personality}, ia dikenal akan keberaniannya di medan perang.`;

    // Multi-page Story Generator (Unlock berdasarkan Star)
    const storyPages = [
      `[Halaman 1] ${name} lahir di desa kecil di ${country}. Sejak kecil ia sudah tertarik dengan kekuatan elemen ${element}.`,
      `[Halaman 2] Saat melatih diri di perbatasan, ${name} berhasil mengalahkan sekelompok bandit tunggal dan mendapatkan gelar ${nickname}.`,
      `[Halaman 3] Menginjak usia dewasa, ${name} secara resmi diangkat menjadi ${heroClass} dan mengabdi pada keadilan dunia Elynia.`,
      `[Halaman 4] Dalam pertempuran di Battle Tower, ${name} membangkitkan potensi tersembunyi yang membuatnya semakin disegani.`,
      `[Halaman 5] Legenda menyebutkan bahwa ${name} pernah menahan gempuran ribuan monster legion seorang diri selama tiga hari tiga malam.`,
      `[Halaman 6] Menembus batas kegelapan, ${name} mendapatkan pengakuan langsung dari para dewa pelindung Elynia.`,
      `[Halaman 7] Sebagai puncak pahlawan sejati (7 Star), ${name} berdiri bersama Commander untuk menaklukkan puncak tertinggi Tower!`
    ];

    // Skills Prosedural
    const skills = [
      { name: `${element} Strike`, type: "attack", cd: 0, cost: 0, desc: `Serangan fisik bermuatan elemen ${element}` },
      { name: `${element} Burst`, type: "skill", cd: 2, cost: 15, desc: `Ledakan elemen ${element} yang memberikan damage besar` },
      { name: `${name}'s Judgment`, type: "ultimate", cd: 4, cost: 35, desc: `Skill puncak ${nickname} yang menghancurkan musuh` }
    ];

    return {
      hero_id: heroId,
      name,
      surname,
      nickname,
      country,
      race,
      gender,
      age,
      height,
      personality,
      hobby: choice(HOBBIES),
      likes: choice(LIKES),
      dislikes: choice(DISLIKES),
      weakness: choice(WEAKNESSES),
      theme_color: themeColor,
      class_name: heroClass,
      element,
      rarity: rarityObj.name,
      star,
      growth_type: growthType,
      level: 1,
      exp: 0,
      hp,
      max_hp: hp,
      mana,
      max_mana: mana,
      atk,
      matk,
      def,
      mdef,
      speed,
      crit_rate: critRate,
      crit_dmg: critDmg,
      affinity: 0,
      trust: 0,
      dialog_summon: dialogSummon,
      lore,
      background_json: JSON.stringify(storyPages),
      skills_json: JSON.stringify(skills),
      equipment_json: JSON.stringify({ weapon: null, armor: null, helmet: null, gloves: null, boots: null, ring: null, necklace: null }),
      created_at: Date.now()
    };
  }
}

export default HeroGenerator;
