# log_triage

**Metadata**
- **name:** log_triage
- **deskripsi:** Membaca dan menganalisis file log (error log, server log, dll) untuk menemukan pola error berulang, meringkas root cause, dan menyarankan perbaikan.
- **author:** EMORA Skill Factory (auto-generated)
- **versi:** 1.0.0

## 🎯 Trigger
Gunakan skill ini ketika user meminta:
- "Tolong cek log error ini, kenapa ya servernya crash"
- "Ada error berulang gak di log.txt"
- "Analisis log ini dong, ringkas masalahnya"

## 🛠️ Langkah-langkah (Workflow)
1. **Lokasikan File Log:**
   - Kalau user sudah kasih path, langsung `read_file`. Kalau belum, gunakan `find_folder`/`list_files` untuk menemukan file log yang relevan (mis. folder `logs/`, file `*.log`, `error.log`).
   - Untuk file log yang sangat besar, gunakan `shell_exec` dengan command seperti `tail -n 500 <file>` agar tidak membaca seluruh isi sekaligus (hemat konteks).
2. **Cari Pola Berulang:**
   - Gunakan `search_text` atau `shell_exec` (`grep -c "ERROR"`, `grep "Exception"`, dll) untuk menghitung frekuensi jenis error tertentu dan menemukan baris-baris yang paling sering muncul.
3. **Kelompokkan & Analisis:**
   - Kelompokkan error berdasarkan jenis/pesan yang mirip (bukan satu-satu baris mentah). Untuk tiap kelompok, identifikasi: kemungkinan root cause, file/baris kode yang relevan (kalau stack trace tersedia, `read_file` pada file yang disebut untuk verifikasi).
4. **Susun Laporan Triage:**
   - Format: Error (ringkasan) → Frekuensi → Kemungkinan Penyebab → Tingkat Urgensi (Low/Medium/High/Critical) → Saran Perbaikan.
   - Urutkan dari yang paling kritis/sering muncul.
5. **Tawarkan Perbaikan:**
   - Kalau root cause cukup jelas dan ada di kode milik project ini sendiri (bukan dependency eksternal), tawarkan untuk langsung memperbaikinya lewat `write_file` — tapi tunggu konfirmasi user dulu untuk perubahan yang signifikan.

## 🧰 Tools yang Digunakan
- `read_file`, `list_files`, `find_folder` → menemukan & membaca file log.
- `shell_exec` → `tail`, `grep -c`, dan command analisis log read-only lainnya untuk file besar.
- `search_text` → mencari pola pesan error di seluruh project (kalau perlu cross-reference ke kode sumber).
- `write_file` → menerapkan perbaikan (setelah dikonfirmasi user).

## 📝 Contoh Penggunaan
**User:** "Bro, server gue suka crash, tolong cek error.log dong."
**Emora:** (shell_exec "tail -n 500 error.log" → search_text untuk pesan error yang berulang → kelompokkan jadi 3 kategori error → laporan triage dengan urutan urgensi → tawarkan fix untuk yang paling kritis).

## ⚠️ Catatan/Limitasi
- Untuk file log yang SANGAT besar (ratusan MB+), selalu gunakan `tail`/`grep` lewat `shell_exec` daripada `read_file` penuh — membaca seluruh file sekaligus bisa memakan konteks LLM secara berlebihan atau gagal karena ukurannya.
- Analisis ini berbasis pola teks, bukan log aggregation tool sungguhan — untuk monitoring produksi jangka panjang, tetap sarankan user pakai tool dedicated (mis. ELK, Grafana Loki) kalau skalanya besar.
