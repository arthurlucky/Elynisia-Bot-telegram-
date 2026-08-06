/**
 * library/validator.js
 *
 * Sistem validasi TANPA LLM sebelum knowledge ditulis ke library/.
 * Sesuai Q&A: "Menggunakan sistem validasi berbasis kode (tanpa LLM).
 * Sistem akan melakukan pencarian web, membandingkan berbagai sumber,
 * memverifikasi data dari sesi chat, lalu menentukan tingkat kepercayaannya."
 *
 * Pipeline:
 *  1. Cari topik di web (via Tavily) → kumpulkan sumber-sumber
 *  2. Hitung konsistensi antar sumber (token overlap sederhana)
 *  3. Bandingkan dengan konten yang ditulis LLM
 *  4. Output: { confidence: 0-100, level: "high|medium|low|unverified", sources, warnings }
 *
 * Kenapa tidak pakai LLM untuk validasi?
 * Model kecil (7B) sering hallucinate ketika diminta "apakah ini benar".
 * Lebih reliable mengukur konsistensi antar sumber eksternal secara programatik.
 */

import https from "https";

// ─── HTTP helper (tidak pakai axios/fetch supaya zero-dep) ───────────────────

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method:   "GET",
      headers:  { "User-Agent": "EMORA-Validator/1.0", ...headers },
    };
    const req = https.request(opts, res => {
      let data = "";
      res.on("data", c => { data += c; });
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data, json: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data, json: null }); }
      });
    });
    req.on("error", reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error("Timeout")); });
    req.end();
  });
}

// ─── Text tokenizer ringan ────────────────────────────────────────────────────

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 3)  // buang stopword pendek
    .filter(t => !STOPWORDS.has(t));
}

const STOPWORDS = new Set([
  "yang","dan","di","ke","dari","ini","itu","untuk","dengan","pada",
  "adalah","juga","akan","atau","dalam","telah","tidak","ada","bisa",
  "the","and","is","in","of","to","a","an","for","are","was","be","by",
  "this","that","it","as","with","have","has","been","they","their",
]);

function jaccardSimilarity(tokensA, tokensB) {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const inter = [...setA].filter(t => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : inter / union;
}

// ─── Tavily search ────────────────────────────────────────────────────────────

async function searchTavily(query, maxResults = 5) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  try {
    const body = JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      search_depth: "basic",
      include_answer: false,
    });

    const res = await new Promise((resolve, reject) => {
      const opts = {
        hostname: "api.tavily.com",
        path:     "/search",
        method:   "POST",
        headers:  { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      };
      const req = https.request(opts, res => {
        let data = "";
        res.on("data", c => { data += c; });
        res.on("end", () => resolve({ status: res.statusCode, json: JSON.parse(data) }));
      });
      req.on("error", reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error("Timeout")); });
      req.write(body);
      req.end();
    });

    return (res.json?.results || []).map(r => ({
      url:     r.url,
      title:   r.title,
      snippet: r.content || "",
    }));
  } catch {
    return [];
  }
}

// ─── Main validator ───────────────────────────────────────────────────────────

/**
 * Validasi konten sebelum disimpan ke library.
 *
 * @param {object} params
 * @param {string} params.topic       Topik (mis. "pertanian")
 * @param {string} params.subtopic    Subtopik (mis. "pengolahan")
 * @param {string} params.content     Isi dokumen yang akan disimpan
 * @param {string} [params.query]     Query untuk web search (default: topic + subtopic)
 * @param {number} [params.minSources] Minimum sumber yang harus konsisten (default: 2)
 *
 * @returns {Promise<{
 *   confidence: number,
 *   level: "high"|"medium"|"low"|"unverified",
 *   sources: Array,
 *   warnings: string[],
 *   canWrite: boolean,
 *   summary: string
 * }>}
 */
export async function validateKnowledge({ topic, subtopic, content, query, minSources = 2 }) {
  const searchQuery = query || `${topic} ${subtopic}`.replace(/_/g, " ");
  const warnings    = [];
  const sources     = [];

  // Step 1: Cari sumber eksternal
  const results = await searchTavily(searchQuery, 6);

  if (!results.length) {
    return {
      confidence: 0,
      level:      "unverified",
      sources:    [],
      warnings:   ["Tidak ada koneksi internet atau TAVILY_API_KEY tidak dikonfigurasi — validasi dilewati."],
      canWrite:   true,  // tetap izinkan tulis, tapi tandai unverified
      summary:    "Tidak dapat divalidasi (tidak ada akses web search). Simpan sebagai unverified.",
    };
  }

  // Step 2: Hitung konsistensi konten terhadap setiap sumber
  const contentTokens = tokenize(content);
  let   totalSim      = 0;
  let   consistentCount = 0;

  for (const src of results) {
    const snippetTokens = tokenize(src.snippet);
    const sim           = jaccardSimilarity(contentTokens, snippetTokens);
    const consistent    = sim >= 0.08;  // threshold: minimal 8% overlap token

    sources.push({ url: src.url, title: src.title, similarity: +(sim * 100).toFixed(1), consistent });
    totalSim += sim;
    if (consistent) consistentCount++;
  }

  // Step 3: Hitung confidence score
  const avgSim     = results.length ? totalSim / results.length : 0;
  const coverage   = results.length ? consistentCount / results.length : 0;

  // Formula: 40% dari rata-rata similarity + 60% dari coverage (jumlah sumber konsisten)
  let confidence = Math.round((avgSim * 40 + coverage * 60) * 100);
  confidence     = Math.min(100, Math.max(0, confidence));

  // Step 4: Tentukan level
  let level;
  if (confidence >= 60)      level = "high";
  else if (confidence >= 35) level = "medium";
  else if (confidence >= 15) level = "low";
  else                       level = "unverified";

  // Step 5: Warnings
  if (consistentCount < minSources) {
    warnings.push(
      `Hanya ${consistentCount} dari ${results.length} sumber web yang konsisten dengan konten ini ` +
      `(minimum: ${minSources}). Pertimbangkan untuk merevisi atau menambah referensi manual.`
    );
  }
  if (contentTokens.length < 30) {
    warnings.push("Konten terlalu pendek (<30 token bermakna). Pertimbangkan untuk memperluas.");
  }

  const summary =
    `Confidence ${confidence}% (${level}) — ` +
    `${consistentCount}/${results.length} sumber konsisten, ` +
    `avg similarity ${(avgSim * 100).toFixed(1)}%.`;

  return {
    confidence,
    level,
    sources,
    warnings,
    canWrite:   level !== "unverified" || warnings.some(w => w.includes("tidak ada akses")),
    summary,
  };
}

/**
 * Format hasil validasi jadi teks ringkas untuk ditampilkan ke user/agent.
 */
export function formatValidationResult(v) {
  const icon = v.level === "high" ? "✅" : v.level === "medium" ? "🔶" : v.level === "low" ? "⚠️" : "❓";
  let out = `${icon} Validasi: ${v.summary}\n`;
  if (v.warnings.length) out += v.warnings.map(w => `⚠ ${w}`).join("\n") + "\n";
  if (v.sources.length) {
    out += `\nSumber web yang diperiksa:\n`;
    out += v.sources.map(s =>
      `  ${s.consistent ? "✓" : "✗"} ${s.title || s.url} (${s.similarity}% overlap)`
    ).join("\n");
  }
  return out;
}
