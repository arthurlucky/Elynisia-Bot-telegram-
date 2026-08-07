/**
 * Weather Plugin index.js
 */

export async function onLoad(api) {
  api.getLogger().info("Weather plugin loaded.");
}

export async function onEnable(api) {
  api.getLogger().info("Weather plugin enabled.");

  // 1. Register tool
  api.registerTool(
    "get_weather",
    {
      name: "get_weather",
      description: "Get the current weather for a specific location",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "City or region name" },
        },
        required: ["location"],
      },
    },
    async (args) => {
      api.getLogger().info(`Fetching weather for: ${args.location}`);
      // Mock weather data
      const temp = Math.floor(Math.random() * 15) + 20; // 20 - 35 C
      const weatherTypes = ["Cerah ☀️", "Berawan ☁️", "Hujan Ringan 🌧️", "Badai ⛈️"];
      const type = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
      return `Weather in ${args.location}: Temp is ${temp}°C, Condition: ${type}`;
    }
  );

  // 2. Register Telegram command /weather
  api.registerCommand(
    "weather",
    async (ctx) => {
      const location = ctx.payload.trim() || "Jakarta";
      const temp = Math.floor(Math.random() * 15) + 20;
      const weatherTypes = ["Cerah ☀️", "Berawan ☁️", "Hujan Ringan 🌧️", "Badai ⛈️"];
      const type = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
      
      await ctx.reply(
        `🌍 *INFO CUACA (PLUGIN)*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `• *Lokasi:* \`${location}\`\n` +
          `• *Suhu:* \`${temp}°C\`\n` +
          `• *Kondisi:* \`${type}\``,
        { parse_mode: "Markdown" }
      );
    },
    "Cek cuaca kota tertentu (contoh: /weather Jakarta)"
  );
}

export async function onDisable(api) {
  api.getLogger().info("Weather plugin disabled.");
}

export async function onUnload(api) {
  api.getLogger().info("Weather plugin unloaded.");
}
