#!/bin/bash
# Elynisia Enterprise Bot - Universal Setup Script
# Usage: curl -sL https://raw.githubusercontent.com/username/Elynisia/main/install.sh | bash

# Colors for UI
G="\033[0;32m"
C="\033[0;36m"
Y="\033[1;33m"
R="\033[0;31m"
N="\033[0m" # No Color

clear
echo -e "${C}=================================================${N}"
echo -e "${C}   🚀 ELYNISIA AI PLATFORM - SETUP WIZARD        ${N}"
echo -e "${C}=================================================${N}"
echo -e "${Y}Memulai proses instalasi otomatis lintas OS...${N}\n"

# 1. System Dependencies
echo -e "${Y}[1/4] Memeriksa & Menginstal Dependensi Sistem...${N}"
if command -v pkg &> /dev/null; then
    echo -e "${G}Lingkungan Termux terdeteksi. Memperbarui paket...${N}"
    pkg update -y
    pkg install -y nodejs git build-essential sqlite
elif command -v apt-get &> /dev/null; then
    echo -e "${G}Ubuntu/Debian terdeteksi. Memperbarui paket...${N}"
    sudo apt-get update -y
    sudo apt-get install -y nodejs npm git build-essential sqlite3 curl
elif command -v pacman &> /dev/null; then
    echo -e "${G}Arch Linux terdeteksi. Memperbarui paket...${N}"
    sudo pacman -Syu --noconfirm nodejs npm git sqlite3 curl
else
    echo -e "${Y}OS tidak dikenal. Diasumsikan Git & Node.js sudah terinstall.${N}"
fi

# 2. Clone Repository (jika dipanggil via curl)
echo -e "\n${Y}[2/4] Memeriksa Repositori Elynisia...${N}"
if [ -d "Elynisia" ]; then
    echo -e "${G}Folder Elynisia sudah ada. Masuk ke folder...${N}"
    cd Elynisia
elif [ -f "package.json" ] && grep -q "elynisia" "package.json"; then
    echo -e "${G}Sudah berada di dalam folder proyek Elynisia.${N}"
else
    echo -e "${C}Mengunduh source code Elynisia dari GitHub...${N}"
    # Ganti URL ini dengan URL repo aslimu nanti
    git clone https://github.com/your-username/Elynisia.git || { echo -e "${R}Gagal clone repository!${N}"; exit 1; }
    cd Elynisia
fi

# 3. NPM Install
echo -e "\n${Y}[3/4] Menginstal modul Node.js (Microservices)...${N}"
npm install

# 4. Global CLI Link
echo -e "\n${Y}[4/5] Mengaktifkan Global CLI (elynisia)...${N}"
npm link

# 5. Selesai
echo -e "\n${Y}[5/5] Finalisasi...${N}"
echo -e "${G}Instalasi Selesai!${N}"
echo -e "${C}=================================================${N}"
echo -e "${C} Untuk melakukan konfigurasi awal, ketik:        ${N}"
echo -e "${G}      cd Elynisia && elynisia setup              ${N}"
echo -e "${C}                                                 ${N}"
echo -e "${C} Untuk menjalankan bot, ketik:                   ${N}"
echo -e "${G}      npm start                                  ${N}"
echo -e "${C}=================================================${N}"
