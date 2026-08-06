import fs from "fs/promises";
import path from "path";

const FACTORY_DIR = "./skill_factory";
const PATTERNS_FILE = path.join(FACTORY_DIR, "patterns.json");
export const SKILL_THRESHOLD = 5; // Berapa kali pattern muncul sebelum disarankan jadi skill

// ==========================================
// PERSISTENCE
// ==========================================

async function ensureDir() {
  await fs.mkdir(FACTORY_DIR, { recursive: true });
}

async function loadPatterns() {
  try {
    const raw = await fs.readFile(PATTERNS_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { patterns: {} };
  }
}

async function savePatterns(data) {
  await ensureDir();
  await fs.writeFile(PATTERNS_FILE, JSON.stringify(data, null, 2));
}

// ==========================================
// PATTERN KEY
// Tool sequence direpresentasikan sebagai string: "tool_a>tool_b>tool_c"
// ==========================================

export function buildKey(toolSequence) {
  return toolSequence.join(">");
}

// ==========================================
// RECORD - Dipanggil setiap kali ask() selesai dengan tool calls
// ==========================================

export async function recordToolSequence(sessionId, toolSequence) {
  // Abaikan sequence < 2 tool (terlalu trivial)
  if (!toolSequence || toolSequence.length < 2) return null;

  const data = await loadPatterns();
  const key = buildKey(toolSequence);

  if (!data.patterns[key]) {
    data.patterns[key] = {
      sequence: toolSequence,
      count: 0,
      sessions: [],
      first_seen: Date.now(),
      last_seen: null,
      skill_created: false,
      skill_name: null,
    };
  }

  const p = data.patterns[key];
  p.count++;
  p.last_seen = Date.now();

  if (!p.sessions.includes(sessionId)) {
    p.sessions.push(sessionId);
  }

  await savePatterns(data);

  // Return trigger info hanya saat tepat menyentuh threshold (bukan setiap kali)
  if (p.count === SKILL_THRESHOLD && !p.skill_created) {
    return { key, pattern: p };
  }

  return null;
}

// ==========================================
// READ
// ==========================================

export async function getPatterns() {
  const data = await loadPatterns();
  return data.patterns;
}

export async function getPatternByKey(key) {
  const data = await loadPatterns();
  return data.patterns[key] || null;
}

// ==========================================
// WRITE
// ==========================================

export async function markSkillCreated(key, skillName) {
  const data = await loadPatterns();
  if (data.patterns[key]) {
    data.patterns[key].skill_created = true;
    data.patterns[key].skill_name = skillName;
  }
  await savePatterns(data);
}

export async function resetPatternCount(key) {
  const data = await loadPatterns();
  if (data.patterns[key]) {
    data.patterns[key].count = 0;
    data.patterns[key].skill_created = false;
    data.patterns[key].skill_name = null;
  }
  await savePatterns(data);
}

export async function deletePattern(key) {
  const data = await loadPatterns();
  delete data.patterns[key];
  await savePatterns(data);
}
