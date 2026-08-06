# auto_code_reviewer

**Metadata**
- **name:** auto_code_reviewer
- **deskripsi:** Melakukan audit kode secara otomatis untuk mendeteksi bug, celah keamanan, dan memberikan saran optimasi berdasarkan best practice.
- **author:** EMORA Skill Factory (auto-generated)
- **versi:** 1.0.0

## 🎯 Trigger
Gunakan skill ini ketika user meminta:
- "Review kode gue"
- "Cek apakah ada bug di project ini"
- "Optimasi kode gue biar lebih clean"
- "Audit keamanan file X"

## 🛠️ Langkah-langkah (Workflow)
1. **Discovery Phase:**
   - Gunakan `list_files` untuk memetakan seluruh struktur project.
   - Identifikasi file utama (entry point) dan file logika bisnis.
2. **Analysis Phase:**
   - Baca isi file menggunakan `read_file`.
   - Analisis kode berdasarkan kriteria:
     - **Correctness:** Apakah ada logic error atau potensi crash?
     - **Security:** Apakah ada hardcoded API key, SQL injection, atau celah keamanan lainnya?
     - **Performance:** Apakah ada loop yang tidak efisien atau memory leak?
     - **Readability:** Apakah penamaan variabel jelas dan mengikuti standar (misal: camelCase untuk JS)?
3. **Reporting Phase:**
   - Buat laporan terstruktur yang berisi:
     - **Issue:** Apa masalahnya.
     - **Location:** File dan baris berapa.
     - **Severity:** (Low/Medium/High/Critical).
     - **Recommendation:** Saran perbaikan.
     - **Code Snippet:** Contoh kode setelah diperbaiki.
4. **Execution Phase (Optional):**
   - Jika user setuju, terapkan perbaikan menggunakan `write_file`.

## 🧰 Tools yang Digunakan
- `list_files` $\rightarrow$ Untuk mapping project.
- `read_file` $\rightarrow$ Untuk analisis konten kode.
- `write_file` $\rightarrow$ Untuk menerapkan perbaikan.
- `shell_exec` $\rightarrow$ Untuk menjalankan linter atau test (jika tersedia).

## 📝 Contoh Penggunaan
**User:** "Bro, tolong review project Express API gue di folder `api-server`, cek apakah ada yang bisa dioptimasi."
**Emora:** (Menjalankan `list_files` $\rightarrow$ `read_file` $\rightarrow$ Memberikan laporan audit $\rightarrow$ Menawarkan perbaikan).

## ⚠️ Catatan/Limitasi
- Analisis dilakukan secara statis (Static Analysis), bukan runtime.
- Untuk project skala sangat besar, fokuskan review pada file yang paling krusial terlebih dahulu.
- Selalu sarankan user untuk melakukan backup atau commit git sebelum menerapkan perubahan otomatis.
