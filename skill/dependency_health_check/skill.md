# dependency_health_check

**Metadata**
- **name:** dependency_health_check
- **deskripsi:** Cek kesehatan dependency project (package.json): versi usang, potensi konflik, dan advisory keamanan yang diketahui publik, tanpa menginstall apapun.
- **author:** EMORA Skill Factory (auto-generated)
- **versi:** 1.0.0

## 🎯 Trigger
Gunakan skill ini ketika user meminta:
- "Cek dependency gue ada yang outdated gak"
- "Aman gak nih package yang gue pakai, ada vulnerability gak"
- "Review package.json gue"

## 🛠️ Langkah-langkah (Workflow)
1. **Baca Manifest:**
   - `read_file` pada `package.json` (dan `package-lock.json` kalau perlu versi exact yang ter-resolve) untuk mendapat daftar lengkap dependency beserta versinya.
2. **Cek Versi Ter-install vs Terbaru (READ-ONLY):**
   - Kalau `node_modules` ada di disk (sudah pernah di-install user sendiri), gunakan `shell_exec` dengan command read-only seperti `npm outdated --json` atau `npm ls --depth=0` untuk melihat versi yang ter-install vs versi terbaru yang tersedia. INI BUKAN instalasi — cuma membaca status, jadi tidak melanggar kebijakan no-install.
   - Kalau `node_modules` tidak ada, lewati langkah ini dan informasikan ke user bahwa pengecekan versi-terinstall butuh `npm install` manual dari mereka dulu.
3. **Cek Advisory Keamanan:**
   - Untuk dependency yang terlihat berisiko (versi major sangat lama, atau package yang jarang dipakai/kurang dikenal), gunakan `search_web` dengan query seperti `"<nama_package> vulnerability CVE"` untuk mencari advisory keamanan publik yang relevan.
4. **Susun Laporan:**
   - Buat tabel/daftar: nama package, versi sekarang, versi terbaru (kalau diketahui), status (OK / Outdated / Berpotensi Berisiko), catatan singkat.
   - Prioritaskan temuan: keamanan dulu, baru versi usang biasa.
5. **Rekomendasi:**
   - JANGAN jalankan `npm install`/`npm update` sendiri (kebijakan no-install). Tulis rekomendasi command yang user perlu jalankan SENDIRI secara manual, jelaskan alasannya.

## 🧰 Tools yang Digunakan
- `read_file` → baca package.json / package-lock.json.
- `shell_exec` → `npm outdated --json` / `npm ls` (read-only, BUKAN install).
- `search_web` → cari advisory keamanan/CVE untuk package tertentu.

## 📝 Contoh Penggunaan
**User:** "Project gue udah lama gak di-update, cek dong dependency-nya masih aman gak."
**Emora:** (read_file package.json → shell_exec "npm outdated --json" → search_web untuk package yang versinya sangat tertinggal → laporan terstruktur dengan rekomendasi command update manual).

## ⚠️ Catatan/Limitasi
- Skill ini TIDAK PERNAH menjalankan `npm install`, `npm update`, atau perintah instalasi apapun — murni read-only & rekomendasi, sesuai kebijakan no-install EMORA.
- Hasil pencarian advisory keamanan bergantung pada ketersediaan informasi publik di internet — bukan pengganti tool security-scanning khusus (mis. `npm audit` yang user jalankan sendiri akan lebih akurat & lengkap).
