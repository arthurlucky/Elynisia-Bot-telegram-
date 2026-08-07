/**
 * library/index.js  (diimport oleh tools/knowledge_library.js)
 *
 * Tanggung jawab:
 *  - Bangun / update flat index  library/.index/catalog.json  yang mendaftar
 *    setiap file di library beserta path, topik, subtopik, tanggal, dan ukuran.
 *  - Sediakan fungsi pencarian cepat TANPA membaca isi file sama sekali.
 *  - Sediakan fungsi baca HANYA file tertentu yang relevan.
 *
 * Struktur yang dikenali:
 *   library/<topik>/<subtopik>/<DD_MM_YYYY>/<namafile.txt>
 *
 * Index disimpan di library/.index/catalog.json supaya:
 *  - Bisa di-query tanpa scan ulang setiap kali.
 *  - Di-rebuild otomatis kalau catalog.json tidak ada atau stale (>5 menit).
 *  - Bisa dicommit ke git oleh kontributor tanpa konflik.
 */

import fs   from "fs";
import path from "path";

const ROOT         = path.resolve("./library");
const INDEX_DIR    = path.join(ROOT, ".index");
const CATALOG_PATH = path.join(INDEX_DIR, "catalog.json");
const STALE_MS     = 5 * 60 * 1000;  // rebuild index kalau >5 menit

// ─── Date helpers ────────────────────────────────────────────────────────────

/**
 * Parse folder tanggal format DD_MM_YYYY → Date object.
 * Return null kalau format tidak dikenal.
 */
function parseDateFolder(folderName) {
  const m = folderName.match(/^(\d{2})_(\d{2})_(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(`${yyyy}-${mm}-${dd}`);
  return isNaN(d.getTime()) ? null : d;
}

function formatDateFolder(date = new Date()) {
  const d  = String(date.getDate()).padStart(2, "0");
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const y  = date.getFullYear();
  return `${d}_${mo}_${y}`;
}

// ─── Index builder ────────────────────────────────────────────────────────────

/**
 * Scan seluruh library/ dan bangun daftar entri. TIDAK membaca isi file,
 * hanya metadata path + stat.
 * @returns {Array<{topic,subtopic,date,dateObj,filename,relPath,absPath,sizeBytes}>}
 */
function scanLibrary() {
  const entries = [];
  if (!fs.existsSync(ROOT)) return entries;

  for (const topic of fs.readdirSync(ROOT)) {
    if (topic.startsWith(".")) continue;
    const topicDir = path.join(ROOT, topic);
    if (!fs.statSync(topicDir).isDirectory()) continue;

    for (const subtopic of fs.readdirSync(topicDir)) {
      if (subtopic.startsWith(".")) continue;
      const subDir = path.join(topicDir, subtopic);
      if (!fs.statSync(subDir).isDirectory()) continue;

      for (const dateFolder of fs.readdirSync(subDir)) {
        if (dateFolder.startsWith(".")) continue;
        const dateObj = parseDateFolder(dateFolder);
        if (!dateObj) continue;
        const dateDir = path.join(subDir, dateFolder);
        if (!fs.statSync(dateDir).isDirectory()) continue;

        for (const filename of fs.readdirSync(dateDir)) {
          if (filename.startsWith(".")) continue;
          const absPath = path.join(dateDir, filename);
          const stat    = fs.statSync(absPath);
          if (!stat.isFile()) continue;

          entries.push({
            topic,
            subtopic,
            date:      dateFolder,
            dateObj:   dateObj.toISOString(),
            filename,
            relPath:   path.join("library", topic, subtopic, dateFolder, filename),
            absPath,
            sizeBytes: stat.size,
          });
        }
      }
    }
  }

  return entries;
}

/**
 * Rebuild catalog.json dari disk. Dipanggil kalau catalog stale atau tidak ada.
 */
export function rebuildIndex() {
  if (!fs.existsSync(INDEX_DIR)) fs.mkdirSync(INDEX_DIR, { recursive: true });
  const entries = scanLibrary();
  const catalog = { builtAt: new Date().toISOString(), count: entries.length, entries };
  fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
  return catalog;
}

/**
 * Load catalog (rebuild kalau stale / tidak ada).
 */
export function loadIndex() {
  const needsRebuild =
    !fs.existsSync(CATALOG_PATH) ||
    Date.now() - fs.statSync(CATALOG_PATH).mtimeMs > STALE_MS;

  if (needsRebuild) return rebuildIndex();
  return JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Cari entri yang relevan dengan query tanpa membaca isi file.
 *
 * Strategi scoring (tanpa LLM, murni string matching):
 *  - Exact topic/subtopic match    → +10
 *  - Token overlap (query vs path) → +1 per token
 *  - Lebih baru                    → prioritas lebih tinggi (sort)
 *
 * @param {string} query
 * @param {{maxResults?:number, topic?:string, subtopic?:string}} opts
 * @returns {Array} sorted by relevance then date desc
 */
export function searchIndex(query, { maxResults = 10, topic = "", subtopic = "" } = {}) {
  const catalog = loadIndex();
  const tokens  = query.toLowerCase().split(/[\s/_\-,\.]+/).filter(Boolean);

  let results = catalog.entries.map(e => {
    let score = 0;
    const haystack = [e.topic, e.subtopic, e.filename, e.date].join(" ").toLowerCase();

    // Hard filter kalau topic/subtopic disebutkan eksplisit
    if (topic    && e.topic    !== topic)    return null;
    if (subtopic && e.subtopic !== subtopic) return null;

    // Exact match bonus
    if (topic    && e.topic    === topic)    score += 10;
    if (subtopic && e.subtopic === subtopic) score += 10;

    // Token overlap
    for (const t of tokens) {
      if (haystack.includes(t)) score += 1;
    }

    if (score === 0 && !topic && !subtopic) score = 0; // keep it, will be filtered later
    return { ...e, score };
  }).filter(Boolean);

  // Kalau ada query token, filter yang skor 0
  if (tokens.length > 0 && !topic && !subtopic) {
    results = results.filter(r => r.score > 0);
  }

  // Sort: score desc → date desc
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.dateObj) - new Date(a.dateObj);
  });

  return results.slice(0, maxResults);
}

/**
 * Daftar semua topik yang ada di library.
 */
export function listTopics() {
  const catalog = loadIndex();
  const topics  = {};
  for (const e of catalog.entries) {
    if (!topics[e.topic]) topics[e.topic] = new Set();
    topics[e.topic].add(e.subtopic);
  }
  return Object.fromEntries(
    Object.entries(topics).map(([t, subs]) => [t, [...subs]])
  );
}

// ─── Read helpers ─────────────────────────────────────────────────────────────

/**
 * Baca isi satu file dari library. Ini satu-satunya fungsi yang benar-benar
 * membaca isi file — dipanggil hanya setelah search menentukan file mana yang
 * paling relevan, bukan untuk semua file.
 */
export function readEntry(relPathOrAbsPath) {
  const absPath = path.isAbsolute(relPathOrAbsPath)
    ? relPathOrAbsPath
    : path.resolve(relPathOrAbsPath);

  if (!fs.existsSync(absPath)) throw new Error(`File tidak ditemukan: ${absPath}`);
  return fs.readFileSync(absPath, "utf8");
}

/**
 * Baca beberapa file sekaligus (untuk analisis multi-dokumen).
 * Dibatasi max 5 file per panggilan untuk jaga konteks LLM.
 */
export function readEntries(relPaths, maxFiles = 5) {
  return relPaths.slice(0, maxFiles).map(p => ({
    path: p,
    content: readEntry(p),
  }));
}

// ─── Write helpers ────────────────────────────────────────────────────────────

/**
 * Tulis entri knowledge baru ke library dengan path yang benar.
 * Otomatis buat folder jika belum ada.
 * Otomatis rebuild index setelah menulis.
 *
 * @param {object} params
 * @param {string} params.topic       mis. "pertanian"
 * @param {string} params.subtopic    mis. "pengolahan"
 * @param {string} params.filename    mis. "tata_cara_pengolahan_1.txt"
 * @param {string} params.content     Isi dokumen
 * @param {Date}   [params.date]      Default: hari ini
 * @returns {{ relPath: string, absPath: string }}
 */
export function writeEntry({ topic, subtopic, filename, content, date = new Date() }) {
  const dateFolder = formatDateFolder(date);
  const dir        = path.join(ROOT, topic, subtopic, dateFolder);
  fs.mkdirSync(dir, { recursive: true });

  const absPath = path.join(dir, filename);
  fs.writeFileSync(absPath, content, "utf8");

  // Rebuild index agar entri baru langsung bisa dicari
  rebuildIndex();

  return {
    relPath: path.join("library", topic, subtopic, dateFolder, filename),
    absPath,
  };
}

export { formatDateFolder, ROOT };
