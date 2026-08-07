# group_broadcast_announcer

**Metadata**
- **name:** group_broadcast_announcer
- **deskripsi:** Menyusun dan mengirimkan pengumuman/broadcast yang terstruktur ke grup Telegram atau WhatsApp aktif, dengan format yang disesuaikan per platform.
- **author:** EMORA Skill Factory (auto-generated)
- **versi:** 1.0.0

## 🎯 Trigger
Gunakan skill ini ketika user meminta (dari dalam grup Telegram/WhatsApp):
- "Umumkan ke grup ini kalau server mau maintenance jam 3 malem"
- "Broadcast ke sini: rapat besok pagi jam 9"
- "Kirim pengumuman ke grup sekarang"
- "Infokan ke semua member sini soal update versi baru"

Skill ini HANYA relevan kalau user chat dari grup (header [EMORA-CTX] menunjukkan `chat=group`).

## 🛠️ Langkah-langkah (Workflow)
1. **Validasi Konteks:**
   - Cek header [EMORA-CTX] di system prompt. Skill ini hanya berlaku kalau `chat=group`. Kalau user chat dari DM/personal, beritahu bahwa pengumuman ke grup perlu dilakukan langsung dari dalam grup tersebut.
2. **Kumpulkan Konten Pengumuman:**
   - Kalau user belum memberikan teks lengkap, tanyakan: apa isi pengumuman, kapan (tanggal/waktu kalau relevan), dan ada informasi tambahan apa yang perlu disertakan.
   - Gunakan `datetime` (action: now) untuk memperoleh waktu/tanggal sekarang sebagai referensi kalau pengumuman menyebut waktu relatif ("besok", "jam 3 nanti", dll) — konversikan ke waktu absolut yang jelas.
3. **Format Sesuai Platform:**
   - **Telegram:** Gunakan Markdown Telegram (*bold*, _italic_, `code`, dll). Struktur yang baik: emoji pembuka + JUDUL BOLD → baris detail → penutup + emoji.
   - **WhatsApp:** Gunakan format WhatsApp (*bold*, _italic_). Struktur serupa tapi lebih sederhana — WhatsApp kurang mendukung formatting kompleks.
   - Template umum yang efektif:
     ```
     📢 *PENGUMUMAN*
     ─────────────────
     [ISI UTAMA PENGUMUMAN]

     📅 [Waktu kalau relevan]
     📍 [Lokasi/Platform kalau relevan]

     Terima kasih 🙏
     ```
4. **Preview ke User:**
   - Tampilkan preview teks pengumuman yang sudah diformat sebelum dikirim, beri user kesempatan untuk mengoreksi.
5. **Kirim:**
   - Setelah user konfirmasi (atau kalau user sudah memberikan semua detail dan minta langsung kirim), gunakan `shell_exec` dengan command `sendMessage` yang disediakan gateway — atau lebih tepatnya: reply langsung ke chat grup ini dengan teks pengumuman yang sudah diformat. Reply dari EMORA ke grup ini secara otomatis sudah menjadi "broadcast" ke seluruh member yang membaca chat tersebut.
   - Untuk pengumuman yang perlu dikirim berkala (mis. reminder harian), kombinasikan dengan `scheduler`.

## 🧰 Tools yang Digunakan
- `datetime` → timestamp/waktu referensi untuk pengumuman.
- `scheduler` → kalau pengumuman perlu dikirim berkala/terjadwal (opsional).
- Reply/response EMORA ke grup langsung → mekanisme pengiriman utama.

## 📝 Contoh Penggunaan
**User (dari grup WA):** "Umumin ke grup ini kalau besok ada update sistem jam 2 siang, semua service bakal mati 30 menit."
**Emora:** (datetime now → susun pengumuman berformat WA → preview ke user → kirim teks pengumuman sebagai reply ke grup).

## ⚠️ Catatan/Limitasi
- "Broadcast" di sini artinya EMORA mengirim satu pesan publik ke grup yang sedang aktif — bukan broadcast ke BANYAK grup sekaligus (itu butuh fitur berbeda dan rawan disalahgunakan sebagai spam).
- Kalau group_manager tersedia dan EMORA berstatus admin, EMORA bisa pin pesan pengumuman setelah dikirim — informasikan opsi ini ke user.
- Skill ini tidak bisa mengirim ke grup yang berbeda dari tempat user sedang chat (karena gateway sessionContext hanya menyimpan konteks chat terakhir dari sesi itu).
