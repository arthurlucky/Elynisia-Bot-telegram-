module.exports = {
  apps: [
    {
      name: "elynisia-bot",
      script: "./index.js",
      instances: "max", // Menggunakan seluruh core CPU yang tersedia di VPS
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      }
    }
  ]
};
