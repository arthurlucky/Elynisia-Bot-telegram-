# api_integration_helper

**Metadata**
- **name:** api_integration_helper
- **deskripsi:** Integrasikan API pihak ketiga ke dalam project: baca dokumentasinya, buat wrapper module, simpan kredensial di .env, dan uji coba pemanggilannya.
- **author:** EMORA Skill Factory (auto-generated)
- **versi:** 1.0.0

## 🎯 Trigger
Gunakan skill ini ketika user meminta:
- "Integrasikan API X ke project ini"
- "Buatkan wrapper buat panggil API pembayaran/cuaca/dll"
- "Gimana cara connect ke API Y, tolong setupin"
- "Tambahin fitur yang manggil API eksternal"

## 🛠️ Langkah-langkah (Workflow)
1. **Riset Dokumentasi:**
   - Gunakan `search_web` untuk menemukan dokumentasi resmi API tersebut.
   - Gunakan `fetch_page` pada URL dokumentasi yang relevan (endpoint, auth method, format request/response) untuk membaca detailnya.
2. **Cek Struktur Project:**
   - Gunakan `list_files` dan `read_file` (mis. package.json) untuk memahami konvensi project — folder mana yang biasa dipakai untuk integrasi eksternal (mis. `services/`, `lib/`, `tools/`).
3. **Setup Kredensial:**
   - Jangan PERNAH hardcode API key di kode. Tambahkan variabel baru ke `.env` / `.env.example` lewat `write_file` (append, jangan timpa file yang sudah ada — baca isinya dulu dengan `read_file`).
4. **Buat Wrapper Module:**
   - Tulis satu file module (mis. `services/<nama_api>.js`) yang membungkus pemanggilan API: base URL, header auth, fungsi-fungsi per endpoint, error handling yang jelas.
   - Ikuti gaya kode yang sudah ada di project (zero-dependency kalau project punya kebijakan minim dependency — cek skill bahasa pemrograman terkait kalau ada di katalog).
5. **Uji Coba:**
   - Kalau project punya cara menjalankan script (`node`, `npm run`, dll), gunakan `shell_exec` untuk testing pemanggilan satu endpoint sederhana, pastikan response sesuai ekspektasi.
   - JANGAN install dependency baru lewat npm/pip — kalau API butuh SDK resmi, gunakan `fetch`/`https` bawaan, atau informasikan ke user untuk install manual.
6. **Laporkan:**
   - Jelaskan ke user file apa yang dibuat, variabel `.env` apa yang perlu diisi user sendiri (terutama API key/secret), dan cara pakainya.

## 🧰 Tools yang Digunakan
- `search_web` → cari dokumentasi API.
- `fetch_page` → baca detail endpoint/auth dari URL dokumentasi.
- `list_files`, `read_file` → memahami struktur & konvensi project.
- `write_file` → membuat wrapper module dan update `.env`/`.env.example`.
- `shell_exec` → testing pemanggilan API (tanpa install package baru).

## 📝 Contoh Penggunaan
**User:** "Tolong integrasiin API OpenWeather ke project gue, gw mau bikin endpoint cek cuaca."
**Emora:** (search_web "OpenWeather API docs" → fetch_page ke dokumentasi resmi → buat `services/openweather.js` dengan fungsi `getWeather(city)` → tambah `OPENWEATHER_API_KEY=` ke `.env.example` → laporkan ke user untuk isi API key-nya sendiri).

## ⚠️ Catatan/Limitasi
- Skill ini TIDAK PERNAH menginstall package/SDK baru (kebijakan no-install EMORA) — selalu pakai `fetch`/modul bawaan Node, atau minta user install manual.
- Kalau API butuh OAuth flow kompleks (redirect, refresh token, dll), jelaskan keterbatasan ke user — implementasi penuh mungkin butuh konfirmasi langkah demi langkah, bukan sekali jalan.
- Selalu ingatkan user untuk TIDAK commit `.env` berisi key asli ke git (cek `.gitignore` sudah benar).
