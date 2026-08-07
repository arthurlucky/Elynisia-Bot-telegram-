# changelog_generator

**Metadata**
- **name:** changelog_generator
- **deskripsi:** Membuat atau memperbarui CHANGELOG.md secara terstruktur berdasarkan riwayat commit git terbaru.
- **author:** EMORA Skill Factory (auto-generated)
- **versi:** 1.0.0

## 🎯 Trigger
Gunakan skill ini ketika user meminta:
- "Buatin changelog dari commit-commit terakhir"
- "Update CHANGELOG.md buat rilis ini"
- "Rangkum perubahan dari commit kemarin sampai sekarang"

## 🛠️ Langkah-langkah (Workflow)
1. **Ambil Riwayat Commit:**
   - Gunakan `git_manager` (action: log) untuk melihat commit terbaru. Kalau butuh rentang spesifik (mis. sejak tag/versi tertentu), gunakan `shell_exec` dengan command git yang sesuai (mis. `git log v1.0.0..HEAD --oneline`) — masih dalam batas aman shell_exec (read-only git command).
2. **Kelompokkan Perubahan:**
   - Kelompokkan commit berdasarkan jenisnya, idealnya dari prefix conventional commit kalau dipakai project ini (`feat:`, `fix:`, `chore:`, `docs:`, dst). Kalau project tidak pakai konvensi itu, kelompokkan berdasarkan isi pesan commit secara semantik (Fitur Baru / Perbaikan Bug / Lainnya).
3. **Baca CHANGELOG.md yang Ada:**
   - `read_file` pada `CHANGELOG.md` kalau sudah ada, supaya entri baru ditambahkan dengan format & gaya yang konsisten dengan yang sudah ada (bukan ditimpa total).
4. **Tulis Entri Baru:**
   - Format umum: heading versi/tanggal, lalu sub-bagian `### Added`, `### Fixed`, `### Changed` berisi bullet point ringkasan tiap perubahan (bahasa manusia, bukan copy-paste pesan commit mentah kalau pesannya kurang jelas).
   - Gunakan `datetime` (action: now) untuk tanggal entri kalau user tidak menyebutkan tanggal/versi spesifik.
5. **Simpan:**
   - `write_file` untuk menulis ulang `CHANGELOG.md` dengan entri baru ditambahkan di PALING ATAS (urutan terbaru dulu), entri lama tetap dipertahankan di bawahnya.

## 🧰 Tools yang Digunakan
- `git_manager` (action: log) → ambil riwayat commit.
- `shell_exec` → git log dengan rentang/format kustom kalau diperlukan.
- `read_file` → baca CHANGELOG.md yang sudah ada (kalau ada).
- `datetime` → tanggal entri changelog.
- `write_file` → simpan CHANGELOG.md yang sudah diperbarui.

## 📝 Contoh Penggunaan
**User:** "Gue mau rilis versi baru, buatin entri changelog dari 10 commit terakhir."
**Emora:** (git_manager log → kelompokkan jadi Added/Fixed → datetime now → tulis ulang CHANGELOG.md dengan entri baru di atas).

## ⚠️ Catatan/Limitasi
- Kualitas changelog sangat bergantung pada kualitas pesan commit aslinya — kalau pesan commit tidak jelas/generic (mis. "update"), Emora akan menjelaskan ketidakjelasan ini ke user alih-alih mengarang detail yang tidak ada di commit.
- Tidak otomatis melakukan commit/push perubahan CHANGELOG.md itu sendiri — itu langkah terpisah lewat `git_manager` kalau diminta.
