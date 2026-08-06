

## Metadata

- **Nama:** environment_configuration_validator
- **Deskripsi:** Melakukan audit konfigurasi environment pada proyek dengan memeriksa file environment, source code, konfigurasi AI Agent, konfigurasi tools, serta layanan pihak ketiga untuk memastikan seluruh environment variable telah dikonfigurasi secara benar dan konsisten.
- **Author:** EMORA Skill Factory (auto-generated)
- **Versi:** 1.0.0

---

## 🎯 Trigger

Gunakan skill ini apabila pengguna meminta untuk:

- Memeriksa konfigurasi `.env`.
- Memvalidasi environment variable.
- Membandingkan `.env` dengan `.env.example`.
- Mengetahui penyebab aplikasi gagal dijalankan akibat konfigurasi environment.
- Memeriksa konfigurasi tools yang menggunakan environment variable.
- Memastikan seluruh konfigurasi proyek telah sesuai.

---

## 🛠️ Workflow

### 1. Identifikasi Berkas Environment

Cari seluruh berkas environment yang tersedia pada proyek, antara lain:

- `.env`
- `.env.local`
- `.env.development`
- `.env.production`
- `.env.test`
- `.env.example`

---

### 2. Validasi Konfigurasi Environment

Periksa setiap berkas environment dan pastikan:

- Format penulisan sudah benar.
- Tidak terdapat variabel yang kosong.
- Tidak terdapat variabel yang didefinisikan lebih dari satu kali.
- Tidak terdapat nilai placeholder yang belum diganti.
- Tidak terdapat kesalahan sintaks.

---

### 3. Bandingkan dengan `.env.example`

Apabila tersedia `.env.example`:

- Bandingkan seluruh variabel dengan `.env`.
- Identifikasi variabel yang belum tersedia.
- Identifikasi variabel yang belum memiliki nilai.
- Laporkan seluruh perbedaan konfigurasi.

---

### 4. Analisis Source Code

Lakukan penelusuran terhadap seluruh source code untuk menemukan penggunaan environment variable.

Contoh:

- `process.env`
- `import.meta.env`
- `Deno.env`
- `os.Getenv`
- `System.getenv`

Pastikan seluruh environment variable yang digunakan benar-benar tersedia pada konfigurasi environment.

---

### 5. Analisis Konfigurasi AI Agent

Periksa konfigurasi AI Agent yang digunakan pada proyek.

Contohnya meliputi:

- Cursor
- Windsurf
- Cline
- Roo Code
- Continue
- Augment
- GitHub Copilot
- MCP Server
- Konfigurasi agent khusus lainnya

Pastikan seluruh environment variable yang dibutuhkan oleh AI Agent telah tersedia dan dikonfigurasi dengan benar.

---

### 6. Analisis Konfigurasi Tools

Periksa seluruh konfigurasi tools yang menggunakan environment variable.

Contohnya meliputi:

**Infrastructure**

- Docker
- Docker Compose
- Dev Container

**Deployment**

- Vercel
- Netlify
- Cloudflare
- Railway
- Fly.io

**Database**

- Prisma
- Supabase
- Firebase

**Build Tools**

- Vite
- Next.js
- Nuxt
- Astro
- SvelteKit

**Layanan Pihak Ketiga**

- OpenAI
- Anthropic
- Google AI
- Tavily
- GitHub
- Stripe
- Discord
- Telegram
- AWS
- Cloudinary
- Resend
- SMTP
- serta layanan lain yang menggunakan environment variable.

Pastikan seluruh konfigurasi tersebut menggunakan environment variable yang tersedia dan tidak mengandung referensi yang tidak valid.

---

### 7. Identifikasi Permasalahan

Laporkan apabila ditemukan:

- Environment variable belum didefinisikan.
- Environment variable kosong.
- Environment variable tidak digunakan.
- Environment variable digunakan tetapi tidak tersedia.
- Variabel yang didefinisikan lebih dari satu kali.
- Konfigurasi AI Agent yang tidak lengkap.
- Konfigurasi tools yang tidak sesuai.
- Inkonsistensi antara source code, AI Agent, tools, dan file environment.

---

### 8. Susun Laporan

Hasil audit harus memuat:

- Environment variable yang valid.
- Environment variable yang hilang.
- Environment variable yang kosong.
- Environment variable yang tidak digunakan.
- Temuan pada konfigurasi AI Agent.
- Temuan pada konfigurasi tools.
- Tingkat prioritas setiap temuan.
- Rekomendasi perbaikan yang diperlukan.

---

## 🧰 Tools yang Digunakan

- `list_directory` → Mengidentifikasi file konfigurasi pada proyek.
- `read_file` → Membaca file environment maupun file konfigurasi.
- `search_text` → Menelusuri penggunaan environment variable pada seluruh proyek.
- `write_file` → Memperbaiki konfigurasi apabila diminta oleh pengguna.

---

## ⚠️ Catatan

- Audit tidak hanya berfokus pada file `.env`, tetapi juga mencakup seluruh konfigurasi proyek yang bergantung pada environment variable.
- Seluruh konfigurasi AI Agent, tools, framework, layanan deployment, database, dan layanan pihak ketiga yang menggunakan environment variable harus ikut diperiksa.
- Apabila ditemukan environment variable yang digunakan tetapi belum didefinisikan, laporkan lokasi penggunaannya beserta rekomendasi perbaikannya.
- Apabila ditemukan environment variable yang sudah tidak digunakan, sertakan rekomendasi untuk menghapusnya agar konfigurasi tetap bersih dan mudah dipelihara.