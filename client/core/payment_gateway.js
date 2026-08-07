import { getOrCreateUserEconomy } from "./economy.js";
import { getUserDB } from "./db.js";
import { topupRevenueCounter } from "../../server/core/metrics.js";

// Menggunakan API KEY dari environment variable agar aman
const API_KEY = process.env.RAMASHOP_API_KEY || "YOUR_API_KEY";
const BASE_URL = "https://ramashop.my.id/api/public";

/**
 * Cek saldo merchant di Ramashop
 */
export async function checkMerchantBalance() {
  try {
    const res = await fetch(`${BASE_URL}/balance`, {
      headers: { "X-API-Key": API_KEY }
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error("Error cek saldo merchant:", err);
    return null;
  }
}

/**
 * Membuat tiket deposit QRIS
 */
export async function createQrisDeposit(amount) {
  try {
    const res = await fetch(`${BASE_URL}/deposit/create`, {
      method: "POST",
      headers: {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: parseInt(amount),
        method: "qris"
      })
    });
    
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.error("Error create deposit:", err);
    throw err;
  }
}

/**
 * Memonitor status deposit dan menambahkan saldo otomatis jika berhasil.
 * (Polling dijalankan tanpa blocking thread utama)
 */
export function monitorDeposit(userId, depositId, amount, botInstance, chatId) {
  let attempts = 0;
  const maxAttempts = 60; // 60 * 10 detik = 10 menit batas waktu

  const interval = setInterval(async () => {
    attempts++;
    
    try {
      const res = await fetch(`${BASE_URL}/deposit/status/${depositId}`, {
        headers: { "X-API-Key": API_KEY }
      });
      const statusRes = await res.json();
      
      // Mengasumsikan respons API memiliki struktur: { data: { status: 'success' | 'already' | 'pending' } }
      const status = statusRes?.data?.status;

      if (status === "success") {
        console.log(`✅ Deposit ${depositId} berhasil untuk user ${userId}`);
        clearInterval(interval);
        
        // Track Metric Revenue Perusahaan
        topupRevenueCounter.inc(parseInt(amount));
        
        // Tambahkan saldo ke economy user
        // Konversi: Rp 1 = 1 Gems (bisa disesuaikan rate-nya)
        const gemsReward = parseInt(amount);
        
        const db = await getUserDB(userId);
        const economy = await getOrCreateUserEconomy(userId);
        
        const newGems = (economy.gems || 0) + gemsReward;
        await db.run("UPDATE economy SET gems = ? WHERE id = 1", [newGems]);
        
        // Notifikasi ke user
        if (botInstance && chatId) {
          botInstance.telegram.sendMessage(
            chatId, 
            `🎉 *TOPUP BERHASIL!*\n\nPembayaran sebesar Rp${amount.toLocaleString()} telah diverifikasi.\n💎 *+${gemsReward.toLocaleString()} Gems* ditambahkan ke akunmu!`,
            { parse_mode: "Markdown" }
          ).catch(console.error);
        }
      } 
      else if (status === "already") {
        console.log(`⚠️ Deposit ${depositId} sudah diproses sebelumnya.`);
        clearInterval(interval);
      }
      
      // Hentikan polling jika sudah melewati batas waktu (10 menit)
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        if (botInstance && chatId) {
          botInstance.telegram.sendMessage(
            chatId, 
            `⏳ Waktu pembayaran QRIS untuk tiket \`${depositId}\` telah habis (10 menit). Silakan buat tiket topup baru jika ingin melanjutkan.`,
            { parse_mode: "Markdown" }
          ).catch(console.error);
        }
      }
      
    } catch (err) {
      console.error(`Error cek status deposit ${depositId}:`, err);
    }
  }, 10000); // Cek setiap 10 detik
}
