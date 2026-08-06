#!/bin/bash
# Elynisia Bot Setup Wizard for Termux/Linux

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${CYAN}=================================================${NC}"
echo -e "${CYAN}       ELYNSIA AI BOT - SETUP WIZARD             ${NC}"
echo -e "${CYAN}=================================================${NC}"
echo ""

# 1. System Update & Dependencies
echo -e "${YELLOW}[1/4] Checking and installing dependencies...${NC}"
if command -v pkg &> /dev/null; then
    # Termux environment
    echo -e "${GREEN}Termux detected. Updating packages...${NC}"
    pkg update -y
    pkg install -y nodejs git build-essential sqlite
elif command -v apt-get &> /dev/null; then
    # Ubuntu/Debian environment
    echo -e "${GREEN}Debian/Ubuntu detected. Updating packages...${NC}"
    sudo apt-get update -y
    sudo apt-get install -y nodejs npm git build-essential sqlite3
else
    echo -e "${YELLOW}Could not determine package manager. Assuming Node.js and Git are already installed.${NC}"
fi

# 2. NPM Install
echo -e "\n${YELLOW}[2/4] Installing Node.js packages...${NC}"
npm install

# 3. Environment Setup
echo -e "\n${YELLOW}[3/4] Setting up environment variables (.env)...${NC}"
if [ ! -f .env ]; then
    cp .env.example .env 2>/dev/null || touch .env
    
    echo -e "${CYAN}Let's configure your bot!${NC}"
    
    read -p "Enter your Telegram Bot Token (from @BotFather): " BOT_TOKEN
    read -p "Enter your Telegram User ID (Owner ID): " OWNER_ID
    read -p "Enter your Gemini API Key (from Google AI Studio): " GEMINI_API
    
    # Overwrite .env with user inputs
    cat > .env <<EOL
# Elynisia Bot Environment Configuration

TELEGRAM_TOKEN_BOT=$BOT_TOKEN
OWNER_ID=$OWNER_ID
TELEGRAM_ALLOWED_IDS=$OWNER_ID

MODEL_PROVIDER=gemini
MODEL_API=$GEMINI_API
MODEL_NAME=gemini-2.5-flash
EOL
    echo -e "${GREEN}.env file created successfully!${NC}"
else
    echo -e "${GREEN}.env file already exists. Skipping configuration.${NC}"
fi

# 4. Finalizing
echo -e "\n${YELLOW}[4/4] Finalizing setup...${NC}"
chmod +x install.sh
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${CYAN}=================================================${NC}"
echo -e "${CYAN} To start the bot, run:                          ${NC}"
echo -e "${GREEN}      npm start                                  ${NC}"
echo -e "${CYAN} or:                                             ${NC}"
echo -e "${GREEN}      node index.js                              ${NC}"
echo -e "${CYAN}=================================================${NC}"
