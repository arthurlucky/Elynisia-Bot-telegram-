# markdown_report_writer

**Metadata**
- **name:** markdown_report_writer
- **deskripsi:** Menyusun laporan atau dokumentasi teknis dalam format Markdown yang rapi dan terstruktur — bisa dari data mentah, hasil analisis, kode, atau ringkasan percakapan.
- **author:** EMORA Skill Factory (auto-generated)
- **versi:** 1.0.0

## 🎯 Trigger
Gunakan skill ini ketika user meminta:
- "Buatin laporan dari hasil analisis ini"
- "Dokumentasiin project ini ke README"
- "Rangkum percakapan ini jadi dokumen"
- "Buatin report harian/mingguan dari data ini"
- "Bikin dokumentasi teknis untuk API ini"

## 🛠️ Langkah-langkah (Workflow)
1. **Kumpulkan Sumber Data:**
   - Baca semua file relevan (`read_file`) yang perlu masuk ke laporan: hasil audit, kode, log, config, dsb.
   - Kalau ada data dari percakapan saat ini (mis. hasil analisis yang baru dijalankan), gunakan langsung tanpa re-read.
2. **Tentukan Struktur Laporan:**
   - Sesuaikan dengan jenis dokumen yang diminta:
     - **README.md**: Project Overview → Installation → Usage → API Reference → Contributing.
     - **Laporan Audit/Analisis**: Executive Summary → Temuan (diurutkan urgensi) → Detail per Temuan → Rekomendasi → Penutup.
     - **Laporan Harian/Mingguan**: Ringkasan → Pencapaian → Hambatan → Rencana Selanjutnya.
     - **Dokumentasi Teknis API**: Deskripsi → Endpoint per endpoint (method, path, param, response, contoh).
3. **Tulis Konten:**
   - Gunakan Markdown yang konsisten: heading hierarkis (`##`, `###`), tabel untuk data tabular, code block (dengan language hint) untuk kode, bold untuk hal penting, bullet list untuk daftar.
   - Gunakan `datetime` (action: now) untuk timestamp laporan kalau relevan.
   - Jaga bahasa: jelas, ringkas, dan konsisten dengan bahasa yang digunakan user (Bahasa Indonesia / English).
4. **Simpan:**
   - Tulis hasil ke file yang sesuai dengan `write_file` — tanyakan nama file kalau user belum menyebutkannya. Default yang umum: `REPORT.md`, `README.md`, `DOCS.md`, atau nama berbasis tanggal (`report-YYYY-MM-DD.md`).
5. **Konfirmasi:**
   - Beritahu user nama file, ukuran, dan ringkasan singkat isi laporan yang baru dibuat.

## 🧰 Tools yang Digunakan
- `read_file` → kumpulkan sumber data.
- `datetime` → timestamp laporan.
- `write_file` → simpan dokumen Markdown.

## 📝 Contoh Penggunaan
**User:** "Tolong buatin README.md buat project EMORA ini dong, lengkap."
**Emora:** (list_files untuk memahami struktur → read_file SOUL.md, AGENT.md, package.json, .env.example → tulis README.md lengkap dengan instalasi, cara pakai, konfigurasi gateway, dsb).

## ⚠️ Catatan/Limitasi
- Kualitas laporan bergantung pada kualitas sumber data yang tersedia. Kalau data sumber tidak lengkap, Emora akan menulis placeholder yang jelas ("[ISIAN USER]") daripada mengarang fakta.
- Untuk dokumen yang SANGAT panjang (mis. dokumentasi API dengan puluhan endpoint), lebih baik gunakan project_manager untuk memecahnya jadi task per-seksi agar tidak kelebihan konteks dalam satu run.
