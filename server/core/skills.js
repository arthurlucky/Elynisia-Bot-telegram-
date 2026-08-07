import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { registry } from "./registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILLS_ROOT = path.join(__dirname, "..", "skill");

if (!fs.existsSync(SKILLS_ROOT)) {
  fs.mkdirSync(SKILLS_ROOT, { recursive: true });
}

class SkillManager {
  /**
   * Load and index all core skills
   */
  async init() {
    console.log("[Skills] Initializing skills...");
    
    try {
      if (!fs.existsSync(SKILLS_ROOT)) return;
      
      const items = fs.readdirSync(SKILLS_ROOT);
      for (const item of items) {
        const itemPath = path.join(SKILLS_ROOT, item);
        const stats = fs.statSync(itemPath);

        if (stats.isDirectory()) {
          const metaPath = path.join(itemPath, "meta.json");
          const mdPath = path.join(itemPath, "skill.md");
          const legacyPath = path.join(itemPath, "SKILL.md");

          if (fs.existsSync(metaPath) && fs.existsSync(mdPath)) {
            try {
              const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
              const content = fs.readFileSync(mdPath, "utf8");
              const skillName = meta.name || item;
              const description = meta.description || meta.deskripsi || skillName;
              registry.registerSkill(skillName, content, description);
            } catch (err) {
              console.error(`[Skills] Error loading skill "${item}":`, err.message);
            }
          } else if (fs.existsSync(legacyPath)) {
            const content = fs.readFileSync(legacyPath, "utf8");
            let description = `Skill: ${item}`;
            const descMatch = content.match(/description:\s*(.*)/);
            if (descMatch) {
              description = descMatch[1].trim();
            }
            registry.registerSkill(null, item, content, description);
          }
        }
      }

      // Register tool to view a specific skill's contents
      registry.registerTool(
        null,
        "read_skill",
        {
          name: "read_skill",
          description: "Read the full instructions and implementation guide of a registered skill",
          parameters: {
            type: "object",
            properties: {
              skillName: { type: "string", description: "The name of the skill to read" },
            },
            required: ["skillName"],
          },
        },
        async (args) => {
          const sk = registry.getSkill(args.skillName);
          if (!sk) {
            return `Error: Skill "${args.skillName}" is not registered.`;
          }
          return sk.systemPrompt;
        }
      );

    } catch (err) {
      console.error("[Skills] Error loading skills:", err.message);
    }
  }
}

export const skillManager = new SkillManager();
export default skillManager;
