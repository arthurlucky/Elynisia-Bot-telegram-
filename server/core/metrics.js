import express from 'express';
import client from 'prom-client';

// Membuat Registry (Penampung Metrik)
const register = new client.Registry();

// Mengumpulkan metrik bawaan Node.js (CPU, Memory, dll)
client.collectDefaultMetrics({ register });

// ── CUSTOM METRICS (METRIK PERUSAHAAN) ──────────────────────────────────────

export const aiTokensCounter = new client.Counter({
  name: 'elynisia_ai_tokens_total',
  help: 'Total token LLM yang digunakan oleh bot',
});

export const topupRevenueCounter = new client.Counter({
  name: 'elynisia_ecommerce_revenue_total',
  help: 'Total pemasukan kotor dari Topup QRIS (dalam Rupiah)',
});

export const activeUsersGauge = new client.Gauge({
  name: 'elynisia_active_users_current',
  help: 'Estimasi jumlah pemain aktif saat ini',
});

export const messagesProcessedCounter = new client.Counter({
  name: 'elynisia_messages_processed_total',
  help: 'Total pesan yang diproses oleh AI Agent',
});

// Daftarkan metrik ke registry
register.registerMetric(aiTokensCounter);
register.registerMetric(topupRevenueCounter);
register.registerMetric(activeUsersGauge);
register.registerMetric(messagesProcessedCounter);

// ── WEB SERVER UNTUK PROMETHEUS SCRAPING ────────────────────────────────────

export function startMetricsServer(port = 3000) {
  const app = express();
  app.use(express.json());

  // Endpoint /metrics akan dibaca otomatis oleh Prometheus setiap 10 detik
  app.get('/metrics', async (req, res) => {
    try {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (ex) {
      res.status(500).end(ex);
    }
  });

  app.get('/', (req, res) => {
    res.send(`
      <html>
        <body style="background:#1a1b26; color:white; font-family:sans-serif; text-align:center; padding:50px;">
          <h1>🚀 Elynisia Enterprise Server</h1>
          <p>Bot is running smoothly in Private/Global Server Mode.</p>
          <a href="/metrics" style="color:#7aa2f7;">View Raw Metrics</a>
        </body>
      </html>
    `);
  });

  // ── PRIVATE SERVER API ENDPOINT ──────────────────────────────────────────
  app.post('/v5/chat', async (req, res) => {
    try {
      const { api_key, user_id, username, message, chat_id } = req.body;
      
      // Keamanan dasar (bisa dikonfigurasi di .env)
      const expectedKey = process.env.PRIVATE_SERVER_KEY || "rahasia123";
      
      const authHeader = req.headers.authorization;
      const bearer = authHeader ? authHeader.split(" ")[1] : null;
      
      if (api_key !== expectedKey && bearer !== expectedKey) {
        return res.status(401).json({ error: "Unauthorized: API Key salah." });
      }
      
      // Panggil sistem AI
      const { ask } = await import("./agent.js");
      let botReply = "";
      
      // Menggunakan interceptor sementara untuk menangkap balasan
      // Secara asli, telegram.js menggunakan event emitter / callback.
      // Untuk REST API, kita kumpulkan semua pesan lalu kembalikan
      await ask(user_id, chat_id, message, (event) => {
         // Di sini kita abaikan pesan sementara, hanya ambil final text yang disave
      });
      
      // Karena `ask` di agent.js dirancang asinkron dan menyimpan ke db,
      // kita perlu mengambil pesan balasan terakhir dari AI untuk user ini.
      const { getUserDB } = await import("../../client/core/db.js");
      const userDb = await getUserDB(user_id);
      const lastMsg = await userDb.get("SELECT content_json FROM messages WHERE chat_id = ? AND role = 'assistant' ORDER BY id DESC LIMIT 1", [chat_id]);
      
      if (lastMsg) {
         const content = JSON.parse(lastMsg.content_json);
         botReply = typeof content === 'string' ? content : (content[0]?.text || "Response diproses.");
      } else {
         botReply = "AI memproses pesan (Tidak ada output teks).";
      }

      return res.json({ success: true, reply: botReply });
    } catch (err) {
      console.error("[API Server Error]", err);
      return res.status(500).json({ error: err.message });
    }
  });

  app.listen(port, () => {
    console.log(`📊 [Metrics] Observability server berjalan di port ${port}`);
    console.log(`📊 [Metrics] Endpoint metrik: http://localhost:${port}/metrics`);
  });
}
