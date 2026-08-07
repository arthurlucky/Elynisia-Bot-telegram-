import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { getOrCreateUserEconomy, getUserInventory } from "../../client/core/economy.js";

export const getUserProfileTool = new DynamicStructuredTool({
  name: "get_user_profile",
  description: "Get the profile, economy balances (gems, gold, silver, tokens), level, tower floor, and inventory items of a user by their user ID.",
  schema: z.object({
    target_user_id: z.string().describe("The Telegram user ID of the target user to inspect."),
  }),
  func: async ({ target_user_id }) => {
    try {
      const economy = await getOrCreateUserEconomy(target_user_id);
      const inventory = await getUserInventory(target_user_id);

      const itemsStr = inventory.length > 0
        ? inventory.map(item => `- ${item.item_name} (x${item.quantity}) [ID: ${item.id}]`).join("\n")
        : "None";

      return JSON.stringify({
        userId: target_user_id,
        username: economy.username || "Guest",
        level: economy.level,
        exp: economy.exp,
        maxExp: economy.level * 100,
        tokens: economy.tokens,
        gems: economy.gems,
        gold: economy.gold,
        silver: economy.silver,
        towerFloor: economy.tower_floor || 1,
        portsLimit: economy.ports_limit || 1,
        inventory: itemsStr
      }, null, 2);
    } catch (err) {
      return `Error looking up user profile: ${err.message}`;
    }
  }
});
export default getUserProfileTool;
