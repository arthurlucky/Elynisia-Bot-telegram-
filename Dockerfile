FROM node:20-alpine

# Set working directory
WORKDIR /usr/src/app

# Install native dependencies for some node modules (like sqlite3, canvas, etc if needed)
RUN apk add --no-cache python3 make g++ gcc

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy all source code
COPY . .

# Expose port jika menggunakan web dashboard (misal: 3000)
EXPOSE 3000

# Jalankan menggunakan PM2
RUN npm install -g pm2
CMD ["pm2-runtime", "ecosystem.config.cjs"]
