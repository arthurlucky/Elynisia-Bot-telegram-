import { getGlobalDB } from "./db.js";
import crypto from "crypto";

// Default currency ratios
// 1 Gems = 100 Gold
// 1 Gold = 100 Silver
export const CURRENCY_RATIOS = {
  gems: { gold: 100 },
  gold: { silver: 100 }
};

/**
 * Helper to parse a string representation of item ID or money
 * e.g., "10 gold", "1 gems", "50 silver", "12" (item ID)
 */
export function parseItemOrMoney(valStr) {
  const clean = valStr.trim();
  const moneyMatch = clean.match(/^(\d+)\s+(gems|gold|silver)$/i);
  if (moneyMatch) {
    return {
      type: "money",
      currency: moneyMatch[2].toLowerCase(),
      amount: parseInt(moneyMatch[1])
    };
  }

  const itemMatch = clean.match(/^(\d+)$/);
  if (itemMatch) {
    return {
      type: "item",
      itemId: parseInt(itemMatch[1])
    };
  }

  return {
    type: "text",
    name: clean
  };
}

/**
 * Helper to save user economy profile to database
 */
export async function saveUserEconomy(db, p) {
  await db.run(
    "UPDATE user_economy SET level = ?, exp = ?, gems = ?, gold = ?, silver = ?, tokens = ?, tower_floor = ?, last_tower_time = ?, ports_limit = ?, username = ?, ram_limit_mb = ?, disk_limit_mb = ? WHERE user_id = ?",
    [
      p.level,
      p.exp,
      p.gems,
      p.gold,
      p.silver,
      p.tokens,
      p.tower_floor || 1,
      p.last_tower_time || 0,
      p.ports_limit || 1,
      p.username,
      p.ram_limit_mb || 500,
      p.disk_limit_mb || 500,
      String(p.user_id)
    ]
  );
}

/**
 * Get or create a user's economy profile
 */
export async function getOrCreateUserEconomy(userId, username = "") {
  const db = await getGlobalDB();
  const strId = String(userId);
  
  let profile = await db.get("SELECT * FROM user_economy WHERE user_id = ?", [strId]);
  if (!profile) {
    await db.run(
      "INSERT OR REPLACE INTO user_economy (user_id, username, level, exp, gems, gold, silver, tokens, tower_floor, last_tower_time, ports_limit, ram_limit_mb, disk_limit_mb) VALUES (?, ?, 1, 0, 0, 0, 0, 10000, 1, 0, 1, 500, 500)",
      [strId, username || `User_${strId.slice(-4)}`]
    );
    profile = await db.get("SELECT * FROM user_economy WHERE user_id = ?", [strId]);
  } else {
    // Fill defaulted columns if they are null or undefined (legacy users database migration)
    let dirty = false;
    if (profile.level === undefined || profile.level === null) { profile.level = 1; dirty = true; }
    if (profile.exp === undefined || profile.exp === null) { profile.exp = 0; dirty = true; }
    if (profile.gems === undefined || profile.gems === null) { profile.gems = 0; dirty = true; }
    if (profile.gold === undefined || profile.gold === null) { profile.gold = 0; dirty = true; }
    if (profile.silver === undefined || profile.silver === null) { profile.silver = 0; dirty = true; }
    if (profile.tokens === undefined || profile.tokens === null) { profile.tokens = 10000; dirty = true; }
    if (profile.tower_floor === undefined || profile.tower_floor === null) { profile.tower_floor = 1; dirty = true; }
    if (profile.last_tower_time === undefined || profile.last_tower_time === null) { profile.last_tower_time = 0; dirty = true; }
    if (profile.ports_limit === undefined || profile.ports_limit === null) { profile.ports_limit = 1; dirty = true; }
    if (profile.ram_limit_mb === undefined || profile.ram_limit_mb === null) { profile.ram_limit_mb = 500; dirty = true; }
    if (profile.disk_limit_mb === undefined || profile.disk_limit_mb === null) { profile.disk_limit_mb = 500; dirty = true; }

    if (username && profile.username !== username) {
      profile.username = username;
      dirty = true;
    }

    if (dirty) {
      await saveUserEconomy(db, profile);
    }
  }
  return profile;
}

/**
 * Deduct tokens from user's balance (no exp / level up anymore, leveling is strictly via towering now!)
 */
export async function deductTokens(userId, amount) {
  const db = await getGlobalDB();
  const profile = await getOrCreateUserEconomy(userId);
  
  profile.tokens = Math.max(0, profile.tokens - amount);
  await saveUserEconomy(db, profile);

  return { newTokens: profile.tokens };
}

/**
 * Recharge tokens for a user (System Shop default items)
 */
export async function buySystemTokens(userId, packageType) {
  const db = await getGlobalDB();
  const profile = await getOrCreateUserEconomy(userId);

  if (packageType === "gems" || packageType === "sys_gems") {
    if (profile.gems < 1) {
      throw new Error("Gems Anda tidak cukup! Pembelian gagal.");
    }
    profile.gems -= 1;
    profile.tokens += 1500000;
    await saveUserEconomy(db, profile);
    return 1500000;
  } else if (packageType === "gold" || packageType === "sys_gold") {
    if (profile.gold < 50) {
      throw new Error("Gold Anda tidak cukup! Pembelian gagal.");
    }
    profile.gold -= 50;
    profile.tokens += 500000;
    await saveUserEconomy(db, profile);
    return 500000;
  } else if (packageType === "sys_port_gems") {
    if (profile.gems < 1) {
      throw new Error("Gems Anda tidak cukup! Pembelian gagal.");
    }
    profile.gems -= 1;
    profile.ports_limit = (profile.ports_limit || 1) + 1;
    await saveUserEconomy(db, profile);
    return { type: "port", newLimit: profile.ports_limit };
  } else if (packageType === "sys_port_gold") {
    if (profile.gold < 10) {
      throw new Error("Gold Anda tidak cukup! Pembelian gagal.");
    }
    profile.gold -= 10;
    profile.ports_limit = (profile.ports_limit || 1) + 1;
    await saveUserEconomy(db, profile);
    return { type: "port", newLimit: profile.ports_limit };
  } else if (packageType === "sys_ram_gold") {
    // +512MB RAM limit seharga 15 Gold
    if (profile.gold < 15) {
      throw new Error("Gold Anda tidak cukup! Pembelian gagal. Butuh 15 Gold.");
    }
    profile.gold -= 15;
    profile.ram_limit_mb = (profile.ram_limit_mb || 500) + 512;
    await saveUserEconomy(db, profile);
    return { type: "ram", newLimit: profile.ram_limit_mb };
  } else if (packageType === "sys_ram_gems") {
    // +512MB RAM limit seharga 1 Gems
    if (profile.gems < 1) {
      throw new Error("Gems Anda tidak cukup! Pembelian gagal.");
    }
    profile.gems -= 1;
    profile.ram_limit_mb = (profile.ram_limit_mb || 500) + 512;
    await saveUserEconomy(db, profile);
    return { type: "ram", newLimit: profile.ram_limit_mb };
  } else if (packageType === "sys_disk_gold") {
    // +1GB disk limit seharga 20 Gold
    if (profile.gold < 20) {
      throw new Error("Gold Anda tidak cukup! Pembelian gagal. Butuh 20 Gold.");
    }
    profile.gold -= 20;
    profile.disk_limit_mb = (profile.disk_limit_mb || 500) + 1024;
    await saveUserEconomy(db, profile);
    return { type: "disk", newLimit: profile.disk_limit_mb };
  } else if (packageType === "sys_disk_gems") {
    // +1GB disk limit seharga 1 Gems
    if (profile.gems < 1) {
      throw new Error("Gems Anda tidak cukup! Pembelian gagal.");
    }
    profile.gems -= 1;
    profile.disk_limit_mb = (profile.disk_limit_mb || 500) + 1024;
    await saveUserEconomy(db, profile);
    return { type: "disk", newLimit: profile.disk_limit_mb };
  } else {
    throw new Error("Paket tidak dikenal.");
  }
}

/**
 * Get user's inventory
 */
export async function getUserInventory(userId) {
  const db = await getGlobalDB();
  return db.all("SELECT * FROM inventory WHERE user_id = ? AND quantity > 0", [String(userId)]);
}

/**
 * Give item to a user (Admin/System command)
 */
export async function giveItemToUser(userId, itemName, quantity = 1) {
  const db = await getGlobalDB();
  const strId = String(userId);

  const existing = await db.get("SELECT * FROM inventory WHERE user_id = ? AND item_name = ?", [strId, itemName]);
  if (existing) {
    const newQty = existing.quantity + quantity;
    await db.run("UPDATE inventory SET quantity = ? WHERE id = ?", [newQty, existing.id]);
  } else {
    await db.run("INSERT INTO inventory (user_id, item_name, quantity) VALUES (?, ?, ?)", [strId, itemName, quantity]);
  }
}

/**
 * Remove item from user's inventory
 */
export async function removeItemFromUser(userId, itemId, quantity = 1) {
  const db = await getGlobalDB();
  const strId = String(userId);

  const item = await db.get("SELECT * FROM inventory WHERE id = ? AND user_id = ?", [itemId, strId]);
  if (!item || item.quantity < quantity) {
    throw new Error("Item tidak ditemukan atau jumlah tidak mencukupi di inventory.");
  }

  const newQty = item.quantity - quantity;
  if (newQty <= 0) {
    await db.run("DELETE FROM inventory WHERE id = ?", [itemId]);
  } else {
    await db.run("UPDATE inventory SET quantity = ? WHERE id = ?", [newQty, itemId]);
  }
  return item.item_name;
}

/**
 * Remove item by name from user's inventory (used during barter/shop etc.)
 */
export async function removeItemByName(userId, itemName, quantity = 1) {
  const db = await getGlobalDB();
  const strId = String(userId);

  const item = await db.get("SELECT * FROM inventory WHERE user_id = ? AND item_name = ?", [strId, itemName]);
  if (!item || item.quantity < quantity) {
    throw new Error(`Item ${itemName} tidak cukup atau tidak ada di inventory Anda.`);
  }

  const newQty = item.quantity - quantity;
  if (newQty <= 0) {
    await db.run("DELETE FROM inventory WHERE id = ?", [item.id]);
  } else {
    await db.run("UPDATE inventory SET quantity = ? WHERE id = ?", [newQty, item.id]);
  }
}

/**
 * Give money to a user (Admin command)
 */
export async function giveMoneyToUser(userId, currency, amount) {
  const db = await getGlobalDB();
  const profile = await getOrCreateUserEconomy(userId);

  const cur = currency.toLowerCase();
  if (cur === "gems") profile.gems += amount;
  else if (cur === "gold") profile.gold += amount;
  else if (cur === "silver") profile.silver += amount;
  else throw new Error("Mata uang tidak valid. Pilih: gems, gold, silver");

  await saveUserEconomy(db, profile);
}

/**
 * Convert currencies
 */
export async function convertUserCurrency(userId, type, amount) {
  const db = await getGlobalDB();
  const profile = await getOrCreateUserEconomy(userId);

  if (type === "gems_to_gold") {
    if (profile.gems < amount) throw new Error("Gems Anda tidak cukup.");
    profile.gems -= amount;
    profile.gold += amount * 100;
  } else if (type === "gold_to_silver") {
    if (profile.gold < amount) throw new Error("Gold Anda tidak cukup.");
    profile.gold -= amount;
    profile.silver += amount * 100;
  } else if (type === "silver_to_gold") {
    if (profile.silver < amount) throw new Error("Silver Anda tidak cukup.");
    if (amount % 100 !== 0) throw new Error("Jumlah Silver harus kelipatan 100.");
    profile.silver -= amount;
    profile.gold += amount / 100;
  } else if (type === "gold_to_gems") {
    if (profile.gold < amount) throw new Error("Gold Anda tidak cukup.");
    if (amount % 100 !== 0) throw new Error("Jumlah Gold harus kelipatan 100.");
    profile.gold -= amount;
    profile.gems += amount / 100;
  } else {
    throw new Error("Tipe konversi salah.");
  }

  await saveUserEconomy(db, profile);
}

/**
 * List an item for sale in the player shop
 */
export async function sellItemInShop(userId, username, itemId, quantity, price, currency) {
  const db = await getGlobalDB();
  const strId = String(userId);
  const cur = currency.toLowerCase();
  
  if (!["gems", "gold", "silver"].includes(cur)) {
    throw new Error("Mata uang tidak valid. Pilih: gems, gold, silver.");
  }
  if (price <= 0 || quantity <= 0) {
    throw new Error("Harga dan jumlah item harus lebih besar dari 0.");
  }

  // Check inventory and deduct
  const itemName = await removeItemFromUser(userId, itemId, quantity);

  // Add to shop listings
  await db.run(
    "INSERT INTO shop_listings (seller_id, seller_username, item_name, quantity, currency, price) VALUES (?, ?, ?, ?, ?, ?)",
    [strId, username, itemName, quantity, cur, price]
  );

  return itemName;
}

/**
 * Buy a player-listed item from the shop
 */
export async function buyShopItem(buyerId, buyerUsername, listingId) {
  const db = await getGlobalDB();
  const strBuyerId = String(buyerId);

  const listing = await db.get("SELECT * FROM shop_listings WHERE id = ?", [listingId]);
  if (!listing) {
    throw new Error("Listing toko tidak ditemukan.");
  }

  if (String(listing.seller_id) === strBuyerId) {
    throw new Error("Anda tidak bisa membeli item dagangan Anda sendiri.");
  }

  const buyer = await getOrCreateUserEconomy(strBuyerId, buyerUsername);
  const seller = await getOrCreateUserEconomy(listing.seller_id);

  const price = listing.price;
  const currency = listing.currency;

  if (currency === "gems" && buyer.gems < price) throw new Error("Gems Anda tidak cukup.");
  if (currency === "gold" && buyer.gold < price) throw new Error("Gold Anda tidak cukup.");
  if (currency === "silver" && buyer.silver < price) throw new Error("Silver Anda tidak cukup.");

  if (currency === "gems") {
    buyer.gems -= price;
    seller.gems += price;
  } else if (currency === "gold") {
    buyer.gold -= price;
    seller.gold += price;
  } else if (currency === "silver") {
    buyer.silver -= price;
    seller.silver += price;
  }

  await saveUserEconomy(db, buyer);
  await saveUserEconomy(db, seller);

  await giveItemToUser(strBuyerId, listing.item_name, listing.quantity);
  await db.run("DELETE FROM shop_listings WHERE id = ?", [listingId]);

  return {
    itemName: listing.item_name,
    quantity: listing.quantity,
    price,
    currency,
    sellerId: listing.seller_id
  };
}

/**
 * Open a barter offer
 */
export async function openBarterOffer(creatorId, creatorUsername, offerStr) {
  const db = await getGlobalDB();
  const strId = String(creatorId);

  const parsed = parseItemOrMoney(offerStr);
  if (!parsed) {
    throw new Error("Format barter tidak valid. Contoh: `/ba open 2` atau `/ba open 10 gold`.");
  }

  let finalOfferName = "";
  let finalOfferQty = 1;

  if (parsed.type === "money") {
    const creator = await getOrCreateUserEconomy(strId, creatorUsername);
    if (parsed.currency === "gems" && creator.gems < parsed.amount) throw new Error("Gems Anda tidak cukup.");
    if (parsed.currency === "gold" && creator.gold < parsed.amount) throw new Error("Gold Anda tidak cukup.");
    if (parsed.currency === "silver" && creator.silver < parsed.amount) throw new Error("Silver Anda tidak cukup.");

    if (parsed.currency === "gems") creator.gems -= parsed.amount;
    else if (parsed.currency === "gold") creator.gold -= parsed.amount;
    else if (parsed.currency === "silver") creator.silver -= parsed.amount;

    await saveUserEconomy(db, creator);

    finalOfferName = `${parsed.amount} ${parsed.currency}`;
    finalOfferQty = parsed.amount;
  } else if (parsed.type === "item") {
    const itemName = await removeItemFromUser(creatorId, parsed.itemId, 1);
    finalOfferName = itemName;
    finalOfferQty = 1;
  } else {
    throw new Error("Gunakan ID Item atau format Uang.");
  }

  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  const barterId = `${creatorUsername}-${rand}`;

  await db.run(
    "INSERT INTO barter_offers (id, creator_id, creator_username, offered_item, offered_quantity, status) VALUES (?, ?, ?, ?, ?, ?)",
    [barterId, strId, creatorUsername, finalOfferName, finalOfferQty, "open"]
  );

  return { barterId, offerName: finalOfferName };
}

/**
 * Bid/Propose a deal on a barter offer
 */
export async function proposeBarterBid(bidderId, bidderUsername, barterId, bidStr) {
  const db = await getGlobalDB();
  const strId = String(bidderId);

  const barter = await db.get("SELECT * FROM barter_offers WHERE id = ?", [barterId]);
  if (!barter) {
    throw new Error("Barter ID tidak ditemukan.");
  }
  if (barter.status !== "open" && barter.status !== "offered") {
    throw new Error("Barter ini sudah tidak aktif.");
  }
  if (String(barter.creator_id) === strId) {
    throw new Error("Anda tidak bisa menawar barter Anda sendiri.");
  }

  const parsed = parseItemOrMoney(bidStr);
  if (!parsed) {
    throw new Error("Format penawaran tidak valid. Contoh: `/ba ID 10 gold` atau `/ba ID 3`.");
  }

  let finalBidName = "";
  let finalBidQty = 1;

  if (parsed.type === "money") {
    const bidder = await getOrCreateUserEconomy(strId, bidderUsername);
    if (parsed.currency === "gems" && bidder.gems < parsed.amount) throw new Error("Gems Anda tidak cukup.");
    if (parsed.currency === "gold" && bidder.gold < parsed.amount) throw new Error("Gold Anda tidak cukup.");
    if (parsed.currency === "silver" && bidder.silver < parsed.amount) throw new Error("Silver Anda tidak cukup.");

    if (parsed.currency === "gems") bidder.gems -= parsed.amount;
    else if (parsed.currency === "gold") bidder.gold -= parsed.amount;
    else if (parsed.currency === "silver") bidder.silver -= parsed.amount;

    await saveUserEconomy(db, bidder);

    finalBidName = `${parsed.amount} ${parsed.currency}`;
    finalBidQty = parsed.amount;
  } else if (parsed.type === "item") {
    const itemName = await removeItemFromUser(bidderId, parsed.itemId, 1);
    finalBidName = itemName;
    finalBidQty = 1;
  } else {
    throw new Error("Gunakan ID Item atau format Uang.");
  }

  await db.run(
    "UPDATE barter_offers SET bidder_id = ?, bidder_username = ?, bidder_offer = ?, bidder_quantity = ?, status = 'offered' WHERE id = ?",
    [strId, bidderUsername, finalBidName, finalBidQty, barterId]
  );

  return {
    creatorId: barter.creator_id,
    creatorUsername: barter.creator_username,
    offeredItem: barter.offered_item,
    bidderOffer: finalBidName
  };
}

/**
 * Accept a barter deal
 */
export async function acceptBarterDeal(barterId) {
  const db = await getGlobalDB();

  const barter = await db.get("SELECT * FROM barter_offers WHERE id = ?", [barterId]);
  if (!barter || barter.status !== "offered") {
    throw new Error("Barter tidak valid atau tidak memiliki penawaran aktif.");
  }

  const creatorId = String(barter.creator_id);
  const bidderId = String(barter.bidder_id);

  // 1. Deliver creator's offer to bidder
  const parsedOffer = parseItemOrMoney(barter.offered_item);
  if (parsedOffer.type === "money") {
    const bidderProfile = await getOrCreateUserEconomy(bidderId);
    if (parsedOffer.currency === "gems") bidderProfile.gems += parsedOffer.amount;
    else if (parsedOffer.currency === "gold") bidderProfile.gold += parsedOffer.amount;
    else if (parsedOffer.currency === "silver") bidderProfile.silver += parsedOffer.amount;
    await saveUserEconomy(db, bidderProfile);
  } else {
    await giveItemToUser(bidderId, barter.offered_item, barter.offered_quantity);
  }

  // 2. Deliver bidder's bid to creator
  const parsedBid = parseItemOrMoney(barter.bidder_offer);
  if (parsedBid.type === "money") {
    const creatorProfile = await getOrCreateUserEconomy(creatorId);
    if (parsedBid.currency === "gems") creatorProfile.gems += parsedBid.amount;
    else if (parsedBid.currency === "gold") creatorProfile.gold += parsedBid.amount;
    else if (parsedBid.currency === "silver") creatorProfile.silver += parsedBid.amount;
    await saveUserEconomy(db, creatorProfile);
  } else {
    await giveItemToUser(creatorId, barter.bidder_offer, barter.bidder_quantity);
  }

  await db.run("UPDATE barter_offers SET status = 'completed' WHERE id = ?", [barterId]);

  return {
    creatorUsername: barter.creator_username,
    bidderId: barter.bidder_id,
    bidderUsername: barter.bidder_username,
    offeredItem: barter.offered_item,
    bidderOffer: barter.bidder_offer
  };
}

/**
 * Decline/Reject a barter offer
 */
export async function declineBarterDeal(barterId) {
  const db = await getGlobalDB();

  const barter = await db.get("SELECT * FROM barter_offers WHERE id = ?", [barterId]);
  if (!barter || barter.status !== "offered") {
    throw new Error("Barter tidak valid atau tidak memiliki penawaran aktif.");
  }

  const bidderId = String(barter.bidder_id);
  const parsedBid = parseItemOrMoney(barter.bidder_offer);

  if (parsedBid.type === "money") {
    const bidder = await getOrCreateUserEconomy(bidderId);
    if (parsedBid.currency === "gems") bidder.gems += parsedBid.amount;
    else if (parsedBid.currency === "gold") bidder.gold += parsedBid.amount;
    else if (parsedBid.currency === "silver") bidder.silver += parsedBid.amount;
    await saveUserEconomy(db, bidder);
  } else {
    await giveItemToUser(bidderId, barter.bidder_offer, barter.bidder_quantity);
  }

  await db.run(
    "UPDATE barter_offers SET bidder_id = NULL, bidder_username = NULL, bidder_offer = NULL, bidder_quantity = NULL, status = 'open' WHERE id = ?",
    [barterId]
  );

  return {
    bidderId,
    bidderUsername: barter.bidder_username,
    creatorUsername: barter.creator_username
  };
}

/**
 * Cancel a barter completely
 */
export async function cancelBarterOffer(barterId, userId) {
  const db = await getGlobalDB();
  const strId = String(userId);

  const barter = await db.get("SELECT * FROM barter_offers WHERE id = ?", [barterId]);
  if (!barter) {
    throw new Error("Barter ID tidak ditemukan.");
  }
  if (String(barter.creator_id) !== strId) {
    throw new Error("Anda hanya bisa membatalkan barter Anda sendiri.");
  }
  if (barter.status === "completed") {
    throw new Error("Barter sudah selesai dilaksanakan.");
  }

  // 1. Refund creator's offer
  const parsedOffer = parseItemOrMoney(barter.offered_item);
  if (parsedOffer.type === "money") {
    const creator = await getOrCreateUserEconomy(strId);
    if (parsedOffer.currency === "gems") creator.gems += parsedOffer.amount;
    else if (parsedOffer.currency === "gold") creator.gold += parsedOffer.amount;
    else if (parsedOffer.currency === "silver") creator.silver += parsedOffer.amount;
    await saveUserEconomy(db, creator);
  } else {
    await giveItemToUser(strId, barter.offered_item, barter.offered_quantity);
  }

  // 2. Refund bidder's offer if there was an active bid
  if (barter.status === "offered" && barter.bidder_id) {
    const bidderId = String(barter.bidder_id);
    const parsedBid = parseItemOrMoney(barter.bidder_offer);

    if (parsedBid.type === "money") {
      const bidder = await getOrCreateUserEconomy(bidderId);
      if (parsedBid.currency === "gems") bidder.gems += parsedBid.amount;
      else if (parsedBid.currency === "gold") bidder.gold += parsedBid.amount;
      else if (parsedBid.currency === "silver") bidder.silver += parsedBid.amount;
      await saveUserEconomy(db, bidder);
    } else {
      await giveItemToUser(bidderId, barter.bidder_offer, barter.bidder_quantity);
    }
  }

  await db.run("DELETE FROM barter_offers WHERE id = ?", [barterId]);
}
