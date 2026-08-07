# bulk_file_organizer

**Metadata**
- **name:** bulk_file_organizer
- **deskripsi:** Mengorganisir sekumpulan file secara massal: rename berdasarkan pola, pindahkan ke subfolder berdasarkan ekstensi/tanggal/konten, dan hapus duplikat atau file sampah.
- **author:** EMORA Skill Factory (auto-generated)
- **versi:** 1.0.0

## 🎯 Trigger
Gunakan skill ini ketika user meminta:
- "Rapiin folder downloads gue dong, kelompokkin berdasarkan ekstensinya"
- "Rename semua file ini jadi format yang konsisten"
- "Hapus file duplikat di folder ini"
- "Pindahin semua file .jpg ke folder images/"

## 🛠️ Langkah-langkah (Workflow)
1. **Pelajari Isi Folder:**
   - `list_files` pada folder target untuk inventarisasi file: nama, ekstensi, jumlah total.
   - Kalau butuh info lebih detail (ukuran, tanggal), gunakan `shell_exec` dengan command `ls -la <folder>` atau `find <folder> -type f`.
2. **Preview Dulu (WAJIB Sebelum Aksi Massal):**
   - Buat dan tampilkan ke user preview/rencana perubahan yang akan dilakukan: "File X akan dipindah ke Y", "File A akan di-rename jadi B", dsb.
   - Untuk aksi yang TIDAK BISA di-undo (hapus), WAJIB minta konfirmasi eksplisit user sebelum eksekusi.
3. **Eksekusi setelah Konfirmasi:**
   - **Rename/Move:** Gunakan `shell_exec` dengan `mv` untuk rename satu per satu atau dengan loop shell. Buat subfolder yang diperlukan dulu dengan `create_folder`.
   - **Hapus duplikat/sampah:** Gunakan `shell_exec` dengan `rm` — HANYA setelah user mengonfirmasi preview yang sudah ditampilkan di langkah sebelumnya.
   - Untuk operasi massal dengan puluhan file, buat script shell sementara lewat `write_file` lalu jalankan dengan `shell_exec`, lebih aman dan bisa di-review user sebelum dijalankan.
4. **Verifikasi Hasil:**
   - `list_files` kembali pada folder target dan subfolder yang dibuat untuk konfirmasi hasil sesuai rencana.
5. **Laporkan:**
   - Berapa file dipindahkan/di-rename/dihapus, ke mana, dan kalau ada yang gagal atau di-skip (mis. nama konflik).

## 🧰 Tools yang Digunakan
- `list_files` → inventarisasi isi folder.
- `shell_exec` → `ls`, `mv`, `rm`, `find`, dan loop shell untuk operasi massal.
- `create_folder` → membuat subfolder tujuan.
- `write_file` → membuat script shell sementara untuk operasi batch yang kompleks (opsional, tapi dianjurkan untuk batch >20 file agar bisa di-review user sebelum dijalankan).

## 📝 Contoh Penggunaan
**User:** "Folder workspaces/assets/ gue berantakan, tolong kelompokkin berdasarkan ekstensi dong."
**Emora:** (list_files → preview: akan buat subfolder images/, docs/, videos/, scripts/ dan pindahkan masing-masing → tunggu konfirmasi → shell_exec dengan mv commands → list_files verifikasi → laporan).

## ⚠️ Catatan/Limitasi
- SELALU tampilkan preview dan minta konfirmasi sebelum aksi DESTRUKTIF (hapus, overwrite). Ini prioritas lebih tinggi dari kecepatan.
- Untuk folder dengan file sangat banyak (>500), pertimbangkan untuk memproses dalam batch kecil dan konfirmasi per-batch agar tidak terlalu banyak perubahan dalam satu operasi yang sulit di-undo.
- Untuk rename massal berdasarkan tanggal/metadata EXIF (foto), gunakan `shell_exec` dengan `stat` atau tool eksternal yang sudah ter-install di sistem — jangan asumsikan `exiftool` atau tool sejenis tersedia, cek dulu.
