import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Clean & Extract text snippets from HTML without heavy DOM parser dependencies
 */
function cleanHtmlText(html) {
  return html
    .replace(/<script\b[^<]*>([\s\S]*?)<\/script>/gi, "")
    .replace(/<style\b[^<]*>([\s\S]*?)<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Emora Web Search Engine (DuckDuckGo HTML Scraping + Wikipedia Fallback)
 * Free, Fast, No API Key Required!
 */
export const SearchWebTool = new DynamicStructuredTool({
  name: "search_web",
  description:
    "Cari informasi terkini di internet secara gratis dan cepat (Emora Search Engine). " +
    "Gunakan untuk pertanyaan faktual, berita terbaru, atau topik luar.",
  schema: z.object({
    query: z.string().describe("Kata kunci pencarian yang ingin dicari di internet."),
  }),
  func: async ({ query }) => {
    try {
      // Method 1: DuckDuckGo HTML Search
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      };

      const res = await fetch(ddgUrl, { headers });
      if (res.ok) {
        const html = await res.text();
        const results = [];

        // Match result blocks via regex
        const matches = [...html.matchAll(/<a\s+class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a\s+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi)];

        for (let i = 0; i < Math.min(5, matches.length); i++) {
          const match = matches[i];
          let rawUrl = match[1];
          // Decode DuckDuckGo redirect URL
          if (rawUrl.includes("uddg=")) {
            const matchUddg = rawUrl.match(/uddg=([^&]+)/);
            if (matchUddg) rawUrl = decodeURIComponent(matchUddg[1]);
          }
          const title = cleanHtmlText(match[2]);
          const snippet = cleanHtmlText(match[3]);

          if (title && snippet) {
            results.push(`### [${i + 1}] ${title}\nURL   : ${rawUrl}\nKonten: ${snippet}\n`);
          }
        }

        if (results.length > 0) {
          return `## Hasil Pencarian Emora Web Engine for "${query}":\n\n` + results.join("\n");
        }
      }

      // Fallback Method 2: Wikipedia Search API
      const wikiUrl = `https://id.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=1`;
      const wikiRes = await fetch(wikiUrl);
      if (wikiRes.ok) {
        const wikiData = await wikiRes.json();
        const searchHits = wikiData?.query?.search || [];
        if (searchHits.length > 0) {
          const wikiResults = searchHits.slice(0, 3).map((h, i) => {
            const cleanTitle = h.title;
            const snippet = cleanHtmlText(h.snippet);
            return `### [${i + 1}] ${cleanTitle}\nURL   : https://id.wikipedia.org/wiki/${encodeURIComponent(cleanTitle)}\nKonten: ${snippet}\n`;
          });
          return `## Hasil Pencarian Wikipedia for "${query}":\n\n` + wikiResults.join("\n");
        }
      }

      return `⚠️ Tidak ditemukan hasil spesifik di internet untuk query: "${query}"`;
    } catch (err) {
      return `❌ search_web gagal: ${err.message}`;
    }
  },
});

export default SearchWebTool;
