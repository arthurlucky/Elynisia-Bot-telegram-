# website_health_check

**Metadata**
- **name:** website_health_check
- **deskripsi:** Cek kesehatan website atau endpoint API: apakah dapat diakses, berapa response time-nya, apakah SSL-nya masih valid, dan apa ada error yang terdeteksi dari kontennya.
- **author:** EMORA Skill Factory (auto-generated)
- **versi:** 1.0.0

## 🎯 Trigger
Gunakan skill ini ketika user meminta:
- "Cek dong website gue masih up gak"
- "Kenapa API endpoint ini gak bisa diakses"
- "SSL sertifikat gue masih valid gak"
- "Ping domain ini, ada yang aneh gak"
- "Cek semua endpoint health check ini"

## 🛠️ Langkah-langkah (Workflow)
1. **Tentukan Target:**
   - Kumpulkan daftar URL/endpoint yang mau dicek. Kalau user cuma kasih satu domain, buat daftar standar: `https://<domain>/` (root), `https://<domain>/health` atau `/api/health` (kalau project punya health endpoint), dan beberapa endpoint kritis yang disebut user.
2. **Cek Aksesibilitas & Response Time:**
   - Gunakan `shell_exec` dengan `curl -o /dev/null -s -w "%{http_code} %{time_total}" <url>` untuk mendapat HTTP status code dan response time dalam satu perintah yang bersih dan ringan.
   - Tandai: 2xx = OK, 3xx = redirect (bisa normal), 4xx = client error, 5xx = server error, timeout/gagal koneksi = DOWN.
3. **Cek SSL Certificate:**
   - Gunakan `shell_exec` dengan `echo | openssl s_client -connect <domain>:443 -servername <domain> 2>/dev/null | openssl x509 -noout -dates 2>/dev/null` untuk cek tanggal kedaluwarsa sertifikat SSL.
   - Tandai warning kalau kedaluwarsa dalam <30 hari, critical kalau <7 hari atau sudah expired.
4. **Cek Konten (Opsional):**
   - Untuk endpoint yang balikin 2xx tapi user curiga isinya salah/kosong, gunakan `fetch_page` atau `curl -s <url>` via `shell_exec` untuk melihat respons body dan mendeteksi anomali (mis. halaman error tersamar yang tetap return 200, JSON yang tidak sesuai schema yang diharapkan).
5. **Susun Laporan:**
   - Tabel per URL: Status, HTTP Code, Response Time, SSL Expiry, Catatan.
   - Highlight yang bermasalah (DOWN, respons lambat >2 detik, SSL hampir expired).
6. **Saran Tindak Lanjut:**
   - Berikan rekomendasi konkret berdasarkan temuan: restart service, renew SSL, cek log server, dll. Kalau temuan menyangkut kode project yang ada di sini, tawarkan untuk menelusuri lebih lanjut.

## 🧰 Tools yang Digunakan
- `shell_exec` → `curl` untuk status code/response time, `openssl s_client` untuk SSL check.
- `fetch_page` → membaca konten respons kalau butuh analisis isi (bukan sekadar status).

## 📝 Contoh Penggunaan
**User:** "Cek API server gue yang di https://api.skyend.id dong, kayaknya ada yang mati."
**Emora:** (shell_exec "curl -o /dev/null -s -w '%{http_code} %{time_total}' https://api.skyend.id" → curl /api/health → openssl s_client untuk SSL → laporkan: server up tapi /api/payment 500 dan SSL expire 3 hari lagi → rekomendasi: cek log payment, renew SSL SEGERA).

## ⚠️ Catatan/Limitasi
- Skill ini memerlukan koneksi internet dari server tempat EMORA berjalan (bukan dari device user). Kalau EMORA jalan di jaringan internal tanpa akses internet penuh, URL eksternal mungkin tidak bisa dicek.
- Response time yang diukur adalah dari server EMORA ke target — bisa berbeda dengan yang dirasakan end user kalau server EMORA jauh secara geografis dari target.
- Untuk monitoring kontinyu (cek otomatis tiap X menit), kombinasikan skill ini dengan `scheduled_backup_setup` (skill #4) — pakai scheduler untuk memanggil health check secara berkala.
