import { getGlobalDB } from "./db.js";

// Default permission presets
export const ROLE_PERMISSIONS = {
  owner: {
    can_use_mcp: true,
    can_install_plugin: true,
    can_manage_scheduler: true,
    daily_limit: -1, // Unlimited
  },
  admin: {
    can_use_mcp: true,
    can_install_plugin: true,
    can_manage_scheduler: true,
    daily_limit: -1,
  },
  moderator: {
    can_use_mcp: true,
    can_install_plugin: false,
    can_manage_scheduler: true,
    daily_limit: 200,
  },
  premium: {
    can_use_mcp: true,
    can_install_plugin: false,
    can_manage_scheduler: false,
    daily_limit: 100,
  },
  user: {
    can_use_mcp: false,
    can_install_plugin: false,
    can_manage_scheduler: false,
    daily_limit: 50,
  },
};

/**
 * Get the role of a user from global DB. If not set, defaults to 'user' or 'owner' (if configured in .env).
 */
export async function getUserRole(userId) {
  const strUserId = String(userId);
  
  // Owner is defined in environment
  const ownerId = String(process.env.OWNER_ID || "");
  if (ownerId && strUserId === ownerId) {
    return "owner";
  }

  // Allowed admin users from environment variables
  const allowedAdmins = (process.env.TELEGRAM_ALLOWED_IDS || process.env.ADMIN_IDS || "")
    .split(",")
    .map(id => id.trim())
    .filter(Boolean);

  if (allowedAdmins.includes(strUserId)) {
    return "admin";
  }

  const db = await getGlobalDB();
  const row = await db.get("SELECT role FROM user_roles WHERE user_id = ?", [strUserId]);
  return row ? row.role : "user";
}

/**
 * Set a user's role
 */
export async function setUserRole(userId, role) {
  const strUserId = String(userId);
  const db = await getGlobalDB();
  await db.run(
    "INSERT OR REPLACE INTO user_roles (user_id, role) VALUES (?, ?)",
    [strUserId, role]
  );
}

/**
 * Create or update a custom role's limit configuration
 */
export async function setCustomRoleLimit(roleName, limitOn) {
  const db = await getGlobalDB();
  await db.run(
    "INSERT OR REPLACE INTO custom_roles (name, is_limit_on) VALUES (?, ?)",
    [roleName.toLowerCase(), limitOn ? 1 : 0]
  );
}

/**
 * Get custom roles
 */
export async function getCustomRoles() {
  const db = await getGlobalDB();
  return db.all("SELECT * FROM custom_roles");
}

/**
 * Check if a user has a specific permission
 */
export async function hasPermission(userId, permissionName) {
  const role = await getUserRole(userId);
  
  // Custom role lookup
  const db = await getGlobalDB();
  const customRole = await db.get("SELECT * FROM custom_roles WHERE name = ?", [role.toLowerCase()]);
  
  if (customRole) {
    // If it's a custom role, resolve its permissions.
    // For simplicity, custom roles inherit from 'user' but can override limit behavior.
    const basePermissions = { ...ROLE_PERMISSIONS.user };
    if (customRole.is_limit_on === 0) {
      basePermissions.daily_limit = -1; // unlimited if limit off
    }
    return !!basePermissions[permissionName];
  }

  const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.user;
  return !!permissions[permissionName];
}

/**
 * Check if privacy mode is ON, and if the user is allowed (owner or admin)
 */
export async function checkPrivacyAccess(userId) {
  const db = await getGlobalDB();
  const setting = await db.get("SELECT val FROM settings WHERE key = ?", ["privacy"]);
  const privacyOn = setting ? setting.val === "on" : false;

  if (!privacyOn) return true;

  const role = await getUserRole(userId);
  return role === "owner" || role === "admin";
}

/**
 * Get current message limit for a user
 */
export async function getUserLimit(userId) {
  const role = await getUserRole(userId);
  
  // Check if user has custom limit in user_roles
  const db = await getGlobalDB();
  const userRow = await db.get("SELECT custom_limit FROM user_roles WHERE user_id = ?", [String(userId)]);
  if (userRow && userRow.custom_limit) {
    const lim = parseInt(userRow.custom_limit);
    if (!isNaN(lim)) return lim;
  }

  const customRole = await db.get("SELECT * FROM custom_roles WHERE name = ?", [role.toLowerCase()]);
  if (customRole) {
    return customRole.is_limit_on === 1 ? 50 : -1;
  }

  const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.user;
  return permissions.daily_limit;
}

/**
 * Set custom limit for a user or custom role
 */
export async function setUserLimit(userId, limitVal) {
  const db = await getGlobalDB();
  await db.run(
    "UPDATE user_roles SET custom_limit = ? WHERE user_id = ?",
    [limitVal === "on" || limitVal === "off" ? limitVal : String(limitVal), String(userId)]
  );
}
