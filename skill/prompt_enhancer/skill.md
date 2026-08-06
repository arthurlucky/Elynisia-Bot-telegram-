# prompt_enhancer

**Metadata**
- **name:** prompt_enhancer
- **deskripsi:** Otomatis memperbaiki prompt user yang ambigu, tidak spesifik, atau kurang detail sebelum dieksekusi.
- **author:** EMORA Skill Factory (auto-generated)
- **versi:** 1.0.0

## 🎯 Trigger
Gunakan skill ini **SETIAP KALI** user mengirimkan prompt yang:
- Kurang dari 5 kata (terlalu pendek)
- Tidak menyebutkan **tujuan** yang jelas
- Tidak menyebutkan **format output** yang diinginkan
- Tidak menyebutkan **batasan/konteks** (misal: bahasa, deadline, preferensi)
- Terlalu umum (contoh: "bantu aku", "kerjain ini", "cari tahu")

## 🛠️ Langkah-langkah (Workflow)

1. **Deteksi Kelemahan Prompt:**
   - Hitung panjang prompt (dalam kata).
   - Cek apakah ada unsur **5W+1H** (What, Why, Who, Where, When, How).
   - Cek apakah ada **format output** yang diminta (file, tabel, list, ringkasan, dll.).
   - Cek apakah ada **batasan** (waktu, sumber daya, prioritas).

2. **Tulis Ulang Prompt Menjadi Lebih Spesifik:**
   - Tambahkan **tujuan** yang jelas: "Kamu ingin agar EMORA melakukan X untuk mencapai Y."
   - Tambahkan **konteks**: latar belakang singkat atau data pendukung.
   - Tambahkan **format output**: "Tolong berikan dalam bentuk daftar/tabel/ringkasan/file."
   - Tambahkan **batasan**: "Jangan gunakan alat X", "Prioritaskan kecepatan", "Gunakan bahasa Indonesia".

3. **Tampilkan Prompt yang Sudah Diperbaiki:**
   - Sebelum menjawab/menjalankan tugas, tampilkan versi perbaikan kepada user.
   - Tanyakan: "Apakah prompt yang sudah saya perbaiki ini sesuai dengan maksud Anda?"

4. **Jika User Setuju:**
   - Jalankan tugas sesuai prompt yang sudah diperbaiki.

5. **Jika User Tidak Setuju:**
   - Minta klarifikasi lebih lanjut hingga prompt menjadi jelas.

## 🧰 Tools yang Digunakan
- **Tidak memerlukan alat khusus** — hanya mengandalkan kemampuan analisis bahasa alami EMORA.

## 📝 Contoh Penggunaan

### Sebelum (Prompt Asli)
**User:** "Buatkan website."

### Sesudah (Prompt yang Diperbaiki)
**Emora:** 
> "Saya perbaiki prompt Anda menjadi:
> 
> *"Buatkan website portofolio pribadi dengan teknologi HTML, CSS, dan JavaScript. Website harus responsive, memiliki halaman Home, About, Projects, dan Contact. Desain minimalis modern dengan warna biru tua dan putih. Output berupa file HTML, CSS, dan JS yang sudah terintegrasi. Jangan gunakan framework eksternal kecuali FontAwesome untuk icon. Sertakan juga panduan cara menjalankannya secara lokal."*
> 
> Apakah ini sesuai dengan yang Anda maksud?"

---

### Sebelum (Prompt Asli)
**User:** "Cari info tentang AI."

### Sesudah (Prompt yang Diperbaiki)
**Emora:**
> "Saya perbaiki prompt Anda menjadi:
>
> *"Cari informasi terkini tentang perkembangan Artificial Intelligence (AI) di bidang kesehatan pada tahun 2026. Fokus pada aplikasi AI untuk diagnosa penyakit dan prediksi epidemi. Berikan ringkasan dalam bentuk poin-poin, lengkap dengan sumber terpercaya (jurnal atau artikel dari institusi resmi). Output dalam format Markdown dengan daftar referensi di akhir."*
>
> Apakah ini sesuai dengan yang Anda maksud?"

---

### Sebelum (Prompt Asli)
**User:** "Tolong debug kode ini."

### Sesudah (Prompt yang Diperbaiki)
**Emora:**
> "Saya perbaiki prompt Anda menjadi:
>
> *"Tolong debug kode JavaScript berikut. Saya mengalami error 'Uncaught TypeError: Cannot read property 'map' of undefined' di baris 42. Kode ini berfungsi untuk memproses data dari API eksternal. Mohon berikan penjelasan penyebab error, solusi perbaikan, dan kode yang sudah diperbaiki. Output berupa penjelasan dan kode final dalam satu file .js."*
>
> Apakah ini sesuai dengan yang Anda maksud?"

## ⚠️ Catatan/Limitasi
- Skill ini **hanya memperbaiki prompt**, bukan menjalankan tugas itu sendiri — setelah user setuju, EMORA tetap perlu menjalankan tugas sesuai alur normal.
- Jika prompt sudah jelas dan spesifik, skill ini **tidak perlu dipanggil** — EMORA langsung menjalankan tugas.
- Proses perbaikan dilakukan secara diam-diam (tanpa memberitahu user) jika user sudah terbiasa, atau secara eksplisit jika ini pertama kali user berinteraksi.