/**
 * rag_memory.js
 * Modul Retrieval-Augmented Generation (RAG) untuk Long-term Memory AI.
 * 
 * 100% PURE JAVASCRIPT (TF-IDF Vectorizer)
 * - Tanpa API Key
 * - Tanpa Npm Package Tambahan (Bebas error di Termux)
 * - Berjalan offline secepat kilat
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_DIR = path.join(__dirname, "..", "storage");
const VECTORS_PATH = path.join(STORAGE_DIR, "rag_local_tfidf.json");

if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// ── PURE JS TF-IDF EMBEDDINGS ──────────────────────────────────────────────
function tokenize(text) {
  // Membersihkan teks dan memecah menjadi kata dasar (token)
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 1);
}

class TFIDFVectorStore {
  constructor() {
    this.documents = [];
    this.vocab = new Set();
    this.idf = {};
  }

  // Menambahkan dokumen ke dalam database
  addDocuments(docs) {
    for (const doc of docs) {
      const tokens = tokenize(doc.pageContent);
      this.documents.push({
        ...doc,
        tokens,
        tf: this.calculateTF(tokens)
      });
      tokens.forEach(t => this.vocab.add(t));
    }
    this.calculateIDF();
  }

  calculateTF(tokens) {
    const tf = {};
    tokens.forEach(t => tf[t] = (tf[t] || 0) + 1);
    const maxFreq = Math.max(...Object.values(tf), 1);
    for (const t in tf) tf[t] = tf[t] / maxFreq;
    return tf;
  }

  calculateIDF() {
    this.idf = {};
    const N = this.documents.length;
    for (const term of this.vocab) {
      let docCount = this.documents.filter(d => term in d.tf).length;
      this.idf[term] = Math.log((N + 1) / (docCount + 1)) + 1; // Smoothing
    }
  }

  // Menghitung vektor TF-IDF dari sebuah text
  getVector(tfDict) {
    const vec = [];
    for (const term of this.vocab) {
      vec.push((tfDict[term] || 0) * (this.idf[term] || 0));
    }
    return vec;
  }

  cosineSimilarity(vecA, vecB) {
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  similaritySearch(query, k = 3, filterFunc = null) {
    if (this.documents.length === 0) return [];
    
    const queryTokens = tokenize(query);
    const queryTf = this.calculateTF(queryTokens);
    const queryVector = this.getVector(queryTf);

    const scores = this.documents.map(doc => {
      if (filterFunc && !filterFunc(doc)) return { doc, score: -1 };
      
      const docVector = this.getVector(doc.tf);
      return { doc, score: this.cosineSimilarity(queryVector, docVector) };
    });

    // Urutkan berdasarkan score tertinggi
    const results = scores
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);

    return results.map(r => r.doc);
  }
}

// ── MAIN RAG SYSTEM ────────────────────────────────────────────────────────
let vectorStore = new TFIDFVectorStore();

export async function initVectorStore() {
  if (vectorStore.documents.length > 0) return; // Sudah diload

  if (fs.existsSync(VECTORS_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(VECTORS_PATH, "utf8"));
      if (data && data.length > 0) {
        vectorStore.addDocuments(data);
        console.log(`🧠 [RAG] PURE CODE: Berhasil memuat ${data.length} memori.`);
      }
    } catch (err) {
      console.error("❌ [RAG] Gagal memuat memory", err);
    }
  } else {
    console.log("🧠 [RAG] Memory kosong. Memulai sistem Pure JS RAG...");
  }
}

export async function saveVectorMemory() {
  const rawDocs = vectorStore.documents.map(d => ({
    pageContent: d.pageContent,
    metadata: d.metadata
  }));
  fs.writeFileSync(VECTORS_PATH, JSON.stringify(rawDocs, null, 2));
}

export async function addMemory(userId, text, metadata = {}) {
  await initVectorStore();
  
  try {
    vectorStore.addDocuments([{
      pageContent: text,
      metadata: { userId: String(userId), timestamp: Date.now(), ...metadata }
    }]);
    
    await saveVectorMemory();
  } catch(e) {
    console.error("[RAG Add Error]", e);
  }
}

export async function queryMemory(userId, query, limit = 3) {
  await initVectorStore();
  
  try {
    const filterFunc = (doc) => doc.metadata.userId === String(userId);
    const results = vectorStore.similaritySearch(query, limit, filterFunc);
    
    return results.map(r => r.pageContent);
  } catch (err) {
    console.error("[RAG Query Error]", err);
    return [];
  }
}
