import { db } from "@/lib/db";
import { APP_SETTINGS_ID } from "@/lib/settings/app-settings-id";
import { normalizeWpOrigin } from "@/lib/settings/wp-url";

export type InventoryCompatibility = {
  usable: boolean;
  requiresFullSync: boolean;
  siteMismatch: boolean;
  inventoryOrigin: string | null;
  effectiveOrigin: string | null;
  inventoryValid: boolean;
  postCount: number;
  reason: string | null;
};

async function resolveEffectiveWpOrigin(): Promise<string | null> {
  try {
    const row = await db.appSettings.findUnique({
      where: { id: APP_SETTINGS_ID },
      select: { wpUrl: true },
    });
    const fromDb = row?.wpUrl?.trim();
    if (fromDb) {
      return normalizeWpOrigin(fromDb);
    }
  } catch {
    /* table absente */
  }
  const fromEnv = process.env.WP_URL?.trim();
  return fromEnv ? normalizeWpOrigin(fromEnv) : null;
}

async function loadInventoryMeta(): Promise<{
  inventoryWpOrigin: string | null;
  inventoryValid: boolean;
}> {
  try {
    const row = await db.appSettings.findUnique({
      where: { id: APP_SETTINGS_ID },
      select: { inventoryWpOrigin: true, inventoryValid: true },
    });
    return {
      inventoryWpOrigin: row?.inventoryWpOrigin?.trim() || null,
      inventoryValid: row?.inventoryValid !== false,
    };
  } catch {
    return { inventoryWpOrigin: null, inventoryValid: true };
  }
}

/**
 * Inventaire local utilisable uniquement s'il est marqué valide
 * et aligné sur le WordPress effectif (URL DB > env).
 */
export async function getInventoryCompatibility(): Promise<InventoryCompatibility> {
  const meta = await loadInventoryMeta();
  let postCount = 0;
  try {
    postCount = await db.wordPressPost.count();
  } catch {
    postCount = 0;
  }

  const effectiveOrigin = await resolveEffectiveWpOrigin();

  const siteMismatch = Boolean(
    postCount > 0 &&
      meta.inventoryWpOrigin &&
      effectiveOrigin &&
      meta.inventoryWpOrigin !== effectiveOrigin
  );

  if (!meta.inventoryValid) {
    return {
      usable: false,
      requiresFullSync: true,
      siteMismatch,
      inventoryOrigin: meta.inventoryWpOrigin,
      effectiveOrigin,
      inventoryValid: false,
      postCount,
      reason:
        "Inventaire WordPress invalidé après changement de site. Lancez une synchronisation complète.",
    };
  }

  if (siteMismatch) {
    return {
      usable: false,
      requiresFullSync: true,
      siteMismatch: true,
      inventoryOrigin: meta.inventoryWpOrigin,
      effectiveOrigin,
      inventoryValid: meta.inventoryValid,
      postCount,
      reason: `Inventaire lié à ${meta.inventoryWpOrigin}, site configuré ${effectiveOrigin}.`,
    };
  }

  return {
    usable: true,
    requiresFullSync: false,
    siteMismatch: false,
    inventoryOrigin: meta.inventoryWpOrigin,
    effectiveOrigin,
    inventoryValid: true,
    postCount,
    reason: null,
  };
}

export async function isWordPressInventoryUsable(): Promise<boolean> {
  const state = await getInventoryCompatibility();
  return state.usable;
}

export async function assertWordPressInventoryUsable(): Promise<void> {
  const state = await getInventoryCompatibility();
  if (!state.usable) {
    throw new Error(
      state.reason ??
        "Inventaire WordPress incompatible avec le site configuré."
    );
  }
}
