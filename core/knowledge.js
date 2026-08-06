import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { registry } from "./registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KNOWLEDGE_ROOT = path.join(__dirname, "..", "knowledge");

if (!fs.existsSync(KNOWLEDGE_ROOT)) {
  fs.mkdirSync(KNOWLEDGE_ROOT, { recursive: true });
}

class KnowledgeLibrary {
  constructor() {
    this.documents = []; // Array of { topic, filename, content, keywords: Set }
  }

  /**
   * Load and index all core knowledge files
   */
  async init() {
    console.log("[Knowledge] Indexing knowledge base...");
    this.indexDirectory(KNOWLEDGE_ROOT, "core");

    // Register knowledge query tool
    registry.registerTool(
      null,
      "query_knowledge",
      {
        name: "query_knowledge",
        description: "Query the internal knowledge database for documentation, FAQs, and manuals",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search terms or keywords" },
          },
          required: ["query"],
        },
      },
      async (args) => {
        return this.search(args.query);
      }
    );
  }

  /**
   * Index all text files in a directory under a specific topic
   */
  indexDirectory(dirPath, topic) {
    if (!fs.existsSync(dirPath)) return;

    try {
      const files = fs.readdirSync(dirPath);
      for (const file of files) {
        const fullPath = path.join(dirPath, file);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {
          // Subfolder maps to a subtopic
          this.indexDirectory(fullPath, `${topic}/${file}`);
        } else if (file.endsWith(".txt") || file.endsWith(".md") || file.endsWith(".json")) {
          this.indexFile(fullPath, topic);
        }
      }
    } catch (err) {
      console.error(`[Knowledge] Error indexing folder "${dirPath}":`, err.message);
    }
  }

  /**
   * Index a single file
   */
  indexFile(filePath, topic) {
    try {
      const filename = path.basename(filePath);
      const content = fs.readFileSync(filePath, "utf8");
      
      // Basic tokenization for indexing keywords
      const words = content
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter(w => w.length > 3);

      const keywords = new Set(words);

      const doc = {
        topic,
        filename,
        content,
        keywords,
        path: filePath
      };

      this.documents.push(doc);
      registry.registerKnowledge(topic, doc);
    } catch (err) {
      console.error(`[Knowledge] Error indexing file "${filePath}":`, err.message);
    }
  }

  /**
   * Query matching documents using simple keyword overlap weighting
   */
  search(query) {
    const queryWords = query
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(w => w.length > 2);

    if (queryWords.length === 0) {
      return "Please provide a more specific query.";
    }

    const scoredDocs = this.documents.map(doc => {
      let score = 0;
      queryWords.forEach(word => {
        // Exact match
        if (doc.keywords.has(word)) score += 10;
        
        // Substring match in content
        const lowerContent = doc.content.toLowerCase();
        let idx = -1;
        while ((idx = lowerContent.indexOf(word, idx + 1)) !== -1) {
          score += 1;
        }
      });
      return { doc, score };
    });

    // Sort by score and filter out zero-score docs
    const results = scoredDocs
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3); // top 3

    if (results.length === 0) {
      return "No matching knowledge documents found.";
    }

    return results
      .map(item => {
        const { doc, score } = item;
        return `Topic: ${doc.topic}\nSource: ${doc.filename}\nContent:\n${doc.content}\n---\n`;
      })
      .join("\n");
  }

  clear() {
    this.documents = [];
  }
}

export const knowledgeLibrary = new KnowledgeLibrary();
export default knowledgeLibrary;
