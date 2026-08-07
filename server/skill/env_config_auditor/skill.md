# env_config_auditor

**Metadata**
- **name:** env_config_auditor
- **deskripsi:** Audit keamanan konfigurasi project: cari secret/API key yang ke-hardcode di kode, pastikan .env tidak ter-commit ke git, dan beri rekomendasi perbaikan.
- **author:** EMORA Skill Factory (auto-generated)
- **versi:** 1.0.0

## 🎯 Trigger
Gunakan skill ini ketika user meminta:
- "Cek apakah ada API key yang bocor di kode gue"
- "Audit keamanan config project ini"
- "Aman gak nih kalau gue push ke GitHub?"
- "Review .env dan .gitignore gue"

## 🛠️ Langkah-langkah (Workflow)
1. **Cek .gitignore:**
   - `read_file` pada `.gitignore`, pastikan `.env` (dan variannya seperti `.env.local`) ada di daftar.
2. **Cari Secret yang Hardcode:**
   - Gunakan `search_text` dengan query seperti `"api_key"`, `"apikey"`, `"secret"`, `"password"`, `"token"`, `"Bearer "`, `"sk-"` (umum untuk OpenAI-style key) untuk menyisir seluruh kode.
   - Untuk tiap hasil, `read_file` pada baris sekitarnya untuk menilai: apakah ini benar-benar nilai rahasia yang di-hardcode, atau hanya nama variabel/contoh placeholder yang aman.
3. **Bandingkan dengan .env:**
   - `read_file` pada `.env.example` (kalau ada) — pastikan semua secret yang dipakai kode SEHARUSNYA datang dari `process.env.X`, bukan string literal.
4. **Cek Riwayat Git (kalau relevan):**
   - Kalau user khawatir secret SUDAH ter-commit sebelumnya, gunakan `git_manager` (action: log) untuk melihat riwayat — informasikan bahwa secret yang sudah pernah ter-commit tetap ada di histori git walau filenya sudah dihapus sekarang, dan perlu di-rotate (ganti key-nya), bukan cuma dihapus dari kode.
5. **Laporkan & Rekomendasi:**
   - Buat laporan terstruktur: file & baris yang bermasalah, tingkat keparahan, rekomendasi perbaikan (pindahkan ke `.env`, tambahkan ke `.gitignore`, rotate key yang sudah pernah ter-expose).
   - Kalau user setuju, terapkan perbaikan (pindahkan literal ke `.env`, update kode pakai `process.env.X`) dengan `write_file`.

## 🧰 Tools yang Digunakan
- `read_file` → cek `.gitignore`, `.env.example`, baca konteks sekitar temuan.
- `search_text` → menyisir seluruh kode mencari pola secret yang hardcode.
- `git_manager` (action: log) → cek apakah secret pernah ter-commit di histori.
- `write_file` → menerapkan perbaikan (memindahkan secret ke `.env`).

## 📝 Contoh Penggunaan
**User:** "Sebelum gue push ke GitHub, tolong cek dulu ada yang bocor gak."
**Emora:** (search_text "api_key" → search_text "secret" → ketemu hardcoded Tavily key di `tools/search_web.js` → laporkan lokasi + severity HIGH → tawarkan perbaikan pindah ke `.env`).

## ⚠️ Catatan/Limitasi
- Ini audit berbasis pola teks (bukan secret-scanning canggih), jadi bisa ada false positive (string yang kebetulan mirip key tapi bukan) maupun false negative (key yang di-obfuscate/encode). Tetap sarankan user double-check manual untuk project yang sangat sensitif.
- Kalau secret SUDAH ter-commit ke histori git publik, hapus dari kode SAJA TIDAK CUKUP — key itu harus dianggap bocor permanen dan WAJIB di-rotate (generate ulang) di provider-nya.
