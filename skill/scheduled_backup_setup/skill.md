# scheduled_backup_setup

**Metadata**
- **name:** scheduled_backup_setup
- **deskripsi:** Setup backup terjadwal otomatis untuk folder/file penting, menggabungkan backup_manager dan scheduler agar berjalan berkala tanpa campur tangan manual.
- **author:** EMORA Skill Factory (auto-generated)
- **versi:** 1.0.0

## 🎯 Trigger
Gunakan skill ini ketika user meminta:
- "Backup folder X tiap hari dong"
- "Setup backup otomatis buat database/project ini"
- "Gue mau ada backup berkala biar gak takut kehilangan data"

## 🛠️ Langkah-langkah (Workflow)
1. **Konfirmasi Target & Frekuensi:**
   - Pastikan jelas: folder/file apa yang mau di-backup, dan seberapa sering (per X jam/hari). Catatan: `scheduler` butuh `interval_seconds`, jadi konversikan permintaan user (mis. "tiap hari" = 86400 detik) ke detik.
2. **Backup Pertama (Baseline):**
   - Jalankan `backup_manager` (action: create, target: "<path>") sekali secara manual dulu untuk memastikan target valid dan backup berhasil sebelum dijadwalkan otomatis.
3. **Jadwalkan:**
   - Gunakan `scheduler` (action: start_job) dengan:
     - `job_id` deskriptif, mis. `backup_<nama_folder>`.
     - `session_id` dari [INFO SYSTEM] supaya notifikasi hasil backup terkirim ke chat user (WhatsApp/Telegram) kalau ada.
     - `interval_seconds` sesuai frekuensi yang diminta (minimal 10 detik, tapi untuk backup realistis biasanya ribuan detik/jam-an).
     - `count` sesuai durasi yang masuk akal (mis. backup harian selama sebulan = count 30) — JANGAN biarkan default 1 kalau user maunya backup BERULANG terus-menerus, hitung count yang cukup besar (mis. 90-365) untuk mensimulasikan "selamanya" dalam batas wajar.
     - `prompt` berisi instruksi: panggil `backup_manager` (action: create, target: "<path>") lalu balas ringkas hasilnya, atau balas `SILENT_ABORT` kalau target tidak ditemukan.
4. **Bersihkan Backup Lama (Opsional):**
   - Kalau user khawatir backup menumpuk dan menuhin disk, tawarkan untuk juga menjadwalkan `backup_manager` (action: clean) secara berkala, ATAU jelaskan bahwa user bisa cek daftar backup kapan saja lewat `backup_manager` (action: list) dan minta Emora membersihkan manual.
5. **Konfirmasi ke User:**
   - Jelaskan job_id yang dibuat, jadwalnya, dan cara menghentikannya (`scheduler` action: stop_job dengan job_id yang sama) kalau suatu saat tidak diperlukan lagi.

## 🧰 Tools yang Digunakan
- `backup_manager` → membuat, melihat daftar, dan membersihkan backup.
- `scheduler` → menjadwalkan eksekusi backup_manager secara berkala.

## 📝 Contoh Penggunaan
**User:** "Backup folder workspaces/ gue tiap 6 jam dong, jalan terus aja."
**Emora:** (backup_manager create target="workspaces" sebagai baseline → scheduler start_job job_id="backup_workspaces" interval_seconds=21600 count=120 prompt="Jalankan backup_manager action=create target=workspaces, balas ringkas hasilnya." → konfirmasi ke user).

## ⚠️ Catatan/Limitasi
- `scheduler` berjalan selama proses EMORA tetap hidup — kalau proses di-restart, job terjadwal ini perlu dijadwalkan ulang (scheduler tidak persist ke disk).
- Backup disimpan sebagai .zip di folder `/backups` di project root — pastikan ada cukup ruang disk kalau target backup besar dan frekuensinya tinggi.
