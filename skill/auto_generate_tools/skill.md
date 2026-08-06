# Skill: auto_generate_tools

**Deskripsi:** Skill untuk menciptakan tool baru bagi EMORA dengan melakukan riset mendalam melalui analisis kode tool yang sudah ada di folder `../tools/` dan mencari referensi teknis terbaru melalui web.

**Versi:** 1.1.0
**Author:** EMORA Skill Factory (Enhanced by User)

## Trigger
Gunakan skill ini ketika user meminta pembuatan tool baru, penambahan fitur pada tool yang ada, atau ketika dibutuhkan fungsionalitas sistem yang belum tersedia di toolset saat ini.

## Langkah-langkah Eksekusi

### 1. Fase Riset Internal (Local Reference)
- Lakukan `list_files` pada folder `../tools/` untuk melihat tool apa saja yang sudah tersedia.
- Baca beberapa file tool yang memiliki kemiripan fungsi atau struktur menggunakan `read_file`.
- Analisis pola implementasi:
    - Cara penggunaan `DynamicStructuredTool`.
    - Definisi schema input menggunakan `zod`.
    - Cara penanganan path menggunakan `resolveWorkspacePath`.
    - Standar error handling yang digunakan.


### 2. Fase Riset Eksternal (Web Reference)
- Gunakan `search_web` untuk mencari dokumentasi modul, library, atau API yang dibutuhkan untuk fungsi tool baru tersebut.
- Cari "best practice" implementasi fitur tersebut di bahasa pemrograman yang digunakan (misal: Node.js/TypeScript).
- Gunakan `fetch_page` untuk membaca detail dokumentasi modul agar penggunaan parameter dan method-nya akurat.

### 3. Fase Desain & Komposisi
- Tentukan nama tool (snake_case).
- Rancang schema input menggunakan `zod` berdasarkan hasil riset web dan internal.
- Tulis logika fungsi utama dengan menggabungkan pola kode dari `../tools/` dan referensi teknis dari web.

### 4. Fase Implementasi & Verifikasi
- Tulis file tool baru ke folder `../tools/` menggunakan `write_file`.
- Pastikan syntax benar dan tidak ada typo pada import modul.
- Verifikasi apakah tool baru tersebut sudah mengikuti standar arsitektur tool EMORA.

## Tools yang Digunakan
- `list_files`, `read_file` & `shell_exec`  (untuk referensi internal `../tools/`)
- `search_web` & `fetch_page` (untuk referensi modul/library eksternal)
- `write_file` atau `shell_exec` (untuk menyimpan tool baru)


## Contoh Penggunaan
**User:** "Bro, buatin tool buat auto-convert file CSV ke JSON."
**EMORA:** 
1. Cek `../tools/` apakah ada tool file manager lain.
2. Search web tentang library `csvtojson` atau modul bawaan Node.js.
3. Buat tool `csv_to_json.ts` dengan standar yang sama dengan tool lainnya.

## Catatan/Limitasi
- Selalu pastikan modul yang direkomendasikan dari web sudah terinstall atau bisa diinstall via `shell_exec`.
- Jangan mengubah tool yang sudah ada tanpa backup atau konfirmasi user.
- Ketika ingin menyimpan tools yang baru dibuat, gunakan `shell_exec` untuk mengedit dan analisis cara pendaftaran tools pada  `core/tools.js`, fungsinya agar tools yang baru dibuat terdaftar dan dapat digunakan
