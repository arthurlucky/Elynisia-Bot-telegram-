/**
 * core/casino_engine.js
 * Engine Casino & Mini-Games (Wheel of Fortune /spin & Duel Dadu /dice) Elynisia RPG
 */

import { getGlobalDB, getUserDB } from "../../client/core/db.js";
import { getOrCreateUserEconomy, saveUserEconomy } from "../../client/core/economy.js";

const WHEEL_REWARDS = [
  { type: "silver", amount: 500, label: "500 Silver 🥈", weight: 35 },
  { type: "silver", amount: 1500, label: "1.500 Silver 🥈", weight: 25 },
  { type: "gold", amount: 10, label: "10 Gold 🪙", weight: 20 },
  { type: "gold", amount: 50, label: "50 Gold 🪙", weight: 10 },
  { type: "gems", amount: 1, label: "1 Gems 💎", weight: 8 },
  { type: "tokens", amount: 100000, label: "100.000 Token ⚡", weight: 2 }
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

export class CasinoEngine {
  /**
   * Spin Roda Keberuntungan Harian (/spin)
   */
  static async spinWheel(userId) {
    const db = await getUserDB(userId);
    const globalDb = await getGlobalDB();

    let history = await db.get("SELECT * FROM casino_history WHERE user_id = ?", [String(userId)]);
    if (!history) {
      await db.run("INSERT INTO casino_history (user_id, last_spin_time, total_spins) VALUES (?, 0, 0)", [String(userId)]);
      history = await db.get("SELECT * FROM casino_history WHERE user_id = ?", [String(userId)]);
    }

    const now = Date.now();
    const cooldownMs = 24 * 60 * 60 * 1000; // Cooldown 24 Jam
    if (now - history.last_spin_time < cooldownMs) {
      const remainingMs = cooldownMs - (now - history.last_spin_time);
      const hours = Math.floor(remainingMs / (1000 * 60 * 60));
      const mins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
      throw new Error(`Anda sudah memutar Wheel of Fortune hari ini! Silakan tunggu **${hours} jam ${mins} menit** lagi.`);
    }

    const prize = weightedChoice(WHEEL_REWARDS);
    const economy = await getOrCreateUserEconomy(userId);

    economy[prize.type] = (economy[prize.type] || 0) + prize.amount;
    await saveUserEconomy(globalDb, economy);

    await db.run(
      "UPDATE casino_history SET last_spin_time = ?, total_spins = total_spins + 1 WHERE user_id = ?",
      [now, String(userId)]
    );

    return prize;
  }

  /**
   * Duel Dadu Hoki (/dice <taruhan> <tebakan>)
   * tebakan: 'ganjil' | 'genap' | '1'..'6'
   */
  static async rollDice(userId, betAmount = 100, guess = "ganjil") {
    const globalDb = await getGlobalDB();
    const economy = await getOrCreateUserEconomy(userId);

    if (betAmount < 50) throw new Error("Batas taruhan minimal adalah 50 Silver.");
    if (economy.silver < betAmount) throw new Error(`Silver Anda tidak cukup! Membutuhkan ${betAmount} Silver.`);

    const diceRoll = Math.floor(Math.random() * 6) + 1;
    const isEven = diceRoll % 2 === 0;

    let isWin = false;
    let multiplier = 2.0;

    const normalizedGuess = guess.toLowerCase().trim();

    if (normalizedGuess === "ganjil" && !isEven) {
      isWin = true;
    } else if (normalizedGuess === "genap" && isEven) {
      isWin = true;
    } else if (parseInt(normalizedGuess) === diceRoll) {
      isWin = true;
      multiplier = 5.0; // Tebakan angka tepat dapat 5x lipat!
    }

    if (isWin) {
      const winAmount = Math.floor(betAmount * multiplier);
      economy.silver += winAmount - betAmount;
      await saveUserEconomy(globalDb, economy);
      return { isWin: true, diceRoll, winAmount, netGain: winAmount - betAmount };
    } else {
      economy.silver -= betAmount;
      await saveUserEconomy(globalDb, economy);
      return { isWin: false, diceRoll, lostAmount: betAmount };
    }
  }
}

export default CasinoEngine;
