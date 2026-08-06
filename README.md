# Elynisia-Bot-telegram-

> Bot Telegram AI modular yang berjalan langsung di **Termux (Android)** — lengkap dengan sistem RPG, workspace sandbox, ekonomi, dan AI Agent berbasis LangChain.

---

## ✨ Fitur Utama

### 🤖 AI Agent & Multi-User Task Queue
- Ditenagai LangChain + Gemini (dapat diganti provider lain)
- Eksekusi Paralel Multi-User: Obrolan tiap pengguna diproses di _thread_ terpisah.
- Antrean Sekuensial: Mencegah tabrakan konteks dari *spam* pesan (Sequential-per-user).
- Subagent Background Worker (`spawn_subagent`): Agen utama bisa mendelegasikan tugas berat ke latar belakang.
- Memori percakapan per-sesi, multi-sesi per user
- Identitas & kepribadian kustom via `SOUL.md` dan `AGENT.md`
- Pemahaman penuh terhadap seluruh sistem Elynisia

### 💬 Gateway Telegram
- Semua pesan biasa diproses langsung oleh AI Agent (tanpa queue delay)
- Anti-spam: guard `isRunning` per user mencegah respons ganda
- Perintah slash lengkap dengan state machine wizard

### 🏰 Sistem RPG
- **Battle Tower**: Pertempuran turn-based menggunakan skill loadout aktif
- **Skill System**: Level, EXP, Mastery rank, evolusi prosedural, equip/unequip
- **Inventory**: Item, Gemstone, material upgrade
- **Ekonomi**: Gems 💎 · Gold 🪙 · Silver 🥈 · Token ⚡

### 🏪 Shop & Market
- Recharge Token (Gems/Gold → Token)
- Upgrade container: RAM, Disk, Port workspace
- Rotasi 3 skill harian (seed berbasis tanggal, ganti otomatis tiap hari)
- Pasar komunitas (Player-to-Player listing & barter)

### 💻 Workspace Sandbox
- Setiap user punya folder privat `Workspaces/<userId>/`
- Prefix `$` untuk eksekusi shell command langsung
- `$cd` stateful — CWD tersimpan antar perintah
- Limit Disk & RAM default 500MB per container
- `/constatus` → dashboard visual penggunaan container

### 🔌 Arsitektur Modular
- **Registry**: Tools, command, hooks dapat didaftarkan secara dinamis
- **Plugin System**: Hot-pluggable via folder `plugins/`
- **MCP Bridge**: Koneksi ke server MCP eksternal
- **Provider-agnostic LLM**: Gemini, Groq, OpenAI, dll.

---

## 📁 Struktur Direktori

```
Elynisia/
├── AGENT.md               → Pengetahuan & panduan sistem AI Agent
├── SOUL.md                → Identitas & kepribadian AI Agent
├── index.js               → Entry point
├── .env                   → Konfigurasi token & API key
├── core/
│   ├── agent.js           → Loop utama AI Agent
│   ├── db.js              → Database emulator (JSON-backed SQLite layer)
│   ├── economy.js         → Sistem ekonomi (saldo, shop, barter)
│   ├── permissions.js     → Manajemen role & limit
│   ├── registry.js        → Pendaftaran tool, command, hook
│   ├── scheduler.js       → Cron job scheduler
│   ├── skills_manager.js  → Sistem Skill RPG
│   └── eventBus.js        → Event bus internal
├── gateway/
│   └── telegram.js        → Bot Telegram — command & message handler
├── tools/                 → Tools AI Agent (read_file, shell_exec, dll.)
├── utils/
│   ├── workspace.js       → Path resolver untuk workspace user
│   └── container.js       → Container state ($cd, RAM/disk limit)
├── Workspaces/
│   └── <userId>/          → Folder sandbox privat setiap user
├── memory/
│   └── <userId>/          → Database SQLite per user (percakapan & skills)
└── plugins/               → Plugin modular (hot-reload)
```

---

## ⚙️ Instalasi & Menjalankan

### Persyaratan
- Node.js >= 20.x
- Termux (Android) atau Linux
- Akun Bot Telegram via `@BotFather`
- Google Gemini API Key (atau provider LLM lain)

### Setup

1. Clone repo:
   ```bash
   git clone https://github.com/arthurlucky/Elynisia-Bot-telegram-.git
   cd Elynisia-Bot-telegram-
   ```

2. Install dependensi:
   ```bash
   npm install
   ```

3. Konfigurasi `.env`:
   ```bash
   cp .env.example .env
   nano .env
   ```
   Isi minimal:
   ```env
   TELEGRAM_TOKEN_BOT=your_bot_token_here
   OWNER_ID=your_telegram_user_id
   GEMINI_API_KEY=your_gemini_api_key
   ```

4. Jalankan bot:
   ```bash
   node index.js
   ```

---

## 📖 Daftar Perintah

| Kategori | Perintah | Fungsi |
|---|---|---|
| 💬 AI | (pesan biasa) | Chat dengan AI Agent |
| 💬 AI | `/newchat` | Buat sesi baru |
| 🎒 Ekonomi | `/inventory` | Lihat profil & item |
| ⚔️ RPG | `/tower` | Battle Tower |
| ⚔️ Skill | `/skill` | Kelola skill loadout |
| 🏪 Shop | `/shop` | Buka toko |
| 💱 Konversi | `/convert` | Tukar mata uang |
| 💻 Shell | `$<command>` | Jalankan shell di workspace |
| 💻 Shell | `$cd <folder>` | Pindah direktori (stateful) |
| 🖥️ Container | `/constatus` | Status RAM, Disk, CWD |
| ℹ️ Info | `/status` | Status identitas user |
| ℹ️ Info | `/help` | Daftar semua perintah |
| 📋 Task | `/btw` | Cek antrean pekerjaan Agen Utama & Subagent aktif |

---

## 🛡️ Keamanan Workspace

- Akses dibatasi ke folder `Workspaces/<userId>/` — tidak bisa keluar
- Dilarang akses ke direktori sistem (`/etc`, `/sys`, `/proc`, dll.)
- `rm -rf /` dan sejenisnya diblokir secara eksplisit
- Limit disk otomatis dicek sebelum operasi tulis

---

## 📄 Lisensi

MIT License — bebas digunakan, dimodifikasi, dan didistribusikan.
