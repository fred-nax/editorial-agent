import { db } from "@/lib/db";
import { APP_SETTINGS_ID } from "@/lib/settings/app-settings-id";
import {
  encryptAppSecret,
  isAppSettingsEncryptionConfigured,
} from "@/lib/settings/crypto";
import {
  AppSettingsDecryptError,
  decryptAppSettingsSecret,
} from "@/lib/settings/decrypt";
import { getInventoryCompatibility } from "@/lib/settings/inventory-guard";
import {
  assertSafeWordPressUrlResolved,
  normalizeWpOrigin,
} from "@/lib/settings/wp-url";
import {
  assertCategoryIdsBelongToSite,
  categoryConfigOriginFromWpUrl,
  fetchAllWordPressCategories,
  parseAllowedCategoryIds,
  parseSyncedCategoriesJson,
  type SyncedWpCategory,
  type WordPressCategoryConfig,
} from "@/lib/wordpress-categories";

export { APP_SETTINGS_ID } from "@/lib/settings/app-settings-id";
export { AppSettingsDecryptError } from "@/lib/settings/decrypt";

export type OpenAiConfig = {
  apiKey: string;
  agentId: string;
  apiKeySource: "database" | "env";
  agentIdSource: "database" | "env";
};

export type WordPressConfig = {
  url: string;
  username: string;
  appPassword: string;
  urlSource: "database" | "env";
  usernameSource: "database" | "env";
  appPasswordSource: "database" | "env";
};

/** Snapshot stable pour une génération / sync (pas de relecture mid-flight). */
export type RuntimeConnections = {
  openai: OpenAiConfig;
  wordpress: WordPressConfig;
  clientName: string | null;
  siteName: string | null;
  inventoryWpOrigin: string | null;
};

export type PublicAppSettings = {
  clientName: string | null;
  siteName: string | null;
  openai: {
    agentId: string | null;
    agentIdSource: "database" | "env" | null;
    apiKeyConfigured: boolean;
    apiKeySource: "database" | "env" | null;
  };
  wordpress: {
    url: string | null;
    urlSource: "database" | "env" | null;
    username: string | null;
    usernameSource: "database" | "env" | null;
    appPasswordConfigured: boolean;
    appPasswordSource: "database" | "env" | null;
  };
  inventory: {
    wpOrigin: string | null;
    postCount: number;
    siteMismatch: boolean;
    effectiveWpOrigin: string | null;
    usable: boolean;
    requiresFullSync: boolean;
    inventoryValid: boolean;
    reason: string | null;
  };
  categories: {
    items: SyncedWpCategory[];
    allowedIds: number[];
    defaultCategoryId: number | null;
    syncedAt: string | null;
    origin: string | null;
    usable: boolean;
    siteMismatch: boolean;
  };
  encryptionConfigured: boolean;
  secretsDecryptError: string | null;
};

type AppSettingsRow = {
  clientName: string | null;
  siteName: string | null;
  openaiAgentId: string | null;
  openaiApiKeyEncrypted: string | null;
  wpUrl: string | null;
  wpUsername: string | null;
  wpAppPasswordEncrypted: string | null;
  inventoryWpOrigin: string | null;
  inventoryValid: boolean;
  wpCategoriesJson: string | null;
  wpAllowedCategoryIds: string | null;
  wpDefaultCategoryId: number | null;
  wpCategoriesSyncedAt: Date | null;
  wpCategoriesOrigin: string | null;
};

function emptyCategoryFields() {
  return {
    wpCategoriesJson: null as string | null,
    wpAllowedCategoryIds: null as string | null,
    wpDefaultCategoryId: null as number | null,
    wpCategoriesSyncedAt: null as Date | null,
    wpCategoriesOrigin: null as string | null,
  };
}

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

async function loadRow(): Promise<AppSettingsRow | null> {
  try {
    const row = await db.appSettings.findUnique({
      where: { id: APP_SETTINGS_ID },
    });
    if (!row) {
      return null;
    }
    return {
      clientName: row.clientName,
      siteName: row.siteName,
      openaiAgentId: row.openaiAgentId,
      openaiApiKeyEncrypted: row.openaiApiKeyEncrypted,
      wpUrl: row.wpUrl,
      wpUsername: row.wpUsername,
      wpAppPasswordEncrypted: row.wpAppPasswordEncrypted,
      inventoryWpOrigin: row.inventoryWpOrigin,
      inventoryValid: row.inventoryValid !== false,
      wpCategoriesJson: row.wpCategoriesJson ?? null,
      wpAllowedCategoryIds: row.wpAllowedCategoryIds ?? null,
      wpDefaultCategoryId: row.wpDefaultCategoryId ?? null,
      wpCategoriesSyncedAt: row.wpCategoriesSyncedAt ?? null,
      wpCategoriesOrigin: row.wpCategoriesOrigin ?? null,
    };
  } catch {
    // Table absente avant migrate — fallback env uniquement.
    return null;
  }
}

function buildCategoriesPublic(
  row: AppSettingsRow | null,
  effectiveWpOrigin: string | null
): PublicAppSettings["categories"] {
  const items = parseSyncedCategoriesJson(row?.wpCategoriesJson);
  const origin = row?.wpCategoriesOrigin?.trim() || null;
  const siteMismatch = Boolean(
    origin && effectiveWpOrigin && origin !== effectiveWpOrigin
  );
  const usable = Boolean(origin && effectiveWpOrigin && !siteMismatch && items.length > 0);
  const allowedIds = usable
    ? parseAllowedCategoryIds(row?.wpAllowedCategoryIds).filter((id) =>
        items.some((item) => item.id === id)
      )
    : [];
  let defaultCategoryId = row?.wpDefaultCategoryId ?? null;
  if (
    defaultCategoryId &&
    (!usable || !items.some((item) => item.id === defaultCategoryId))
  ) {
    defaultCategoryId = null;
  }
  return {
    items: usable ? items : [],
    allowedIds,
    defaultCategoryId,
    syncedAt: row?.wpCategoriesSyncedAt?.toISOString() ?? null,
    origin,
    usable,
    siteMismatch,
  };
}

export function getWordPressCategoryConfigFromRow(
  row: AppSettingsRow | null
): WordPressCategoryConfig | null {
  if (!row) {
    return null;
  }
  return {
    categories: parseSyncedCategoriesJson(row.wpCategoriesJson),
    allowedIds: parseAllowedCategoryIds(row.wpAllowedCategoryIds),
    defaultCategoryId: row.wpDefaultCategoryId,
    syncedAt: row.wpCategoriesSyncedAt?.toISOString() ?? null,
    origin: row.wpCategoriesOrigin?.trim() || null,
  };
}

export async function resolveWordPressCategoryConfig(): Promise<WordPressCategoryConfig | null> {
  const row = await loadRow();
  return getWordPressCategoryConfigFromRow(row);
}

function preferDbThenEnv(
  dbValue: string | null | undefined,
  envValue: string | null
): { value: string | null; source: "database" | "env" | null } {
  const fromDb = dbValue?.trim() || null;
  if (fromDb) {
    return { value: fromDb, source: "database" };
  }
  if (envValue) {
    return { value: envValue, source: "env" };
  }
  return { value: null, source: null };
}

export async function resolveOpenAiConfig(): Promise<OpenAiConfig | null> {
  const row = await loadRow();
  const apiKeyDb = decryptAppSettingsSecret(row?.openaiApiKeyEncrypted);
  const apiKey = preferDbThenEnv(apiKeyDb, readEnv("OPENAI_API_KEY"));
  const agentId = preferDbThenEnv(
    row?.openaiAgentId,
    readEnv("OPENAI_AGENT_ID")
  );
  if (!apiKey.value || !agentId.value) {
    return null;
  }
  return {
    apiKey: apiKey.value,
    agentId: agentId.value,
    apiKeySource: apiKey.source === "database" ? "database" : "env",
    agentIdSource: agentId.source === "database" ? "database" : "env",
  };
}

export async function resolveWordPressConfig(): Promise<WordPressConfig | null> {
  const row = await loadRow();
  const passwordDb = decryptAppSettingsSecret(row?.wpAppPasswordEncrypted);
  const url = preferDbThenEnv(row?.wpUrl, readEnv("WP_URL"));
  const username = preferDbThenEnv(row?.wpUsername, readEnv("WP_USERNAME"));
  const appPassword = preferDbThenEnv(
    passwordDb,
    readEnv("WP_APP_PASSWORD")
  );
  if (!url.value || !username.value || !appPassword.value) {
    return null;
  }
  return {
    url: url.value.replace(/\/$/, ""),
    username: username.value,
    appPassword: appPassword.value,
    urlSource: url.source === "database" ? "database" : "env",
    usernameSource: username.source === "database" ? "database" : "env",
    appPasswordSource:
      appPassword.source === "database" ? "database" : "env",
  };
}

export async function resolveRuntimeConnections(): Promise<RuntimeConnections> {
  const row = await loadRow();
  const openai = await resolveOpenAiConfig();
  const wordpress = await resolveWordPressConfig();
  if (!openai) {
    throw new Error(
      "OpenAI non configuré (clé API et identifiant d’agent requis)."
    );
  }
  if (!wordpress) {
    throw new Error(
      "WordPress non configuré (URL, utilisateur et mot de passe d’application requis)."
    );
  }
  return {
    openai,
    wordpress,
    clientName: row?.clientName?.trim() || null,
    siteName: row?.siteName?.trim() || null,
    inventoryWpOrigin: row?.inventoryWpOrigin?.trim() || null,
  };
}

export async function getPublicAppSettings(): Promise<PublicAppSettings> {
  const row = await loadRow();
  let openai: OpenAiConfig | null = null;
  let wordpress: WordPressConfig | null = null;
  let secretsDecryptError: string | null = null;

  try {
    openai = await resolveOpenAiConfig();
    wordpress = await resolveWordPressConfig();
  } catch (error) {
    if (error instanceof AppSettingsDecryptError) {
      secretsDecryptError = error.message;
    } else {
      throw error;
    }
  }

  const inventory = await getInventoryCompatibility();

  const apiKeyDb = Boolean(row?.openaiApiKeyEncrypted?.trim());
  const apiKeyEnv = Boolean(readEnv("OPENAI_API_KEY"));
  const agentDb = Boolean(row?.openaiAgentId?.trim());
  const agentEnv = Boolean(readEnv("OPENAI_AGENT_ID"));
  const wpUrlDb = Boolean(row?.wpUrl?.trim());
  const wpUrlEnv = Boolean(readEnv("WP_URL"));
  const wpUserDb = Boolean(row?.wpUsername?.trim());
  const wpUserEnv = Boolean(readEnv("WP_USERNAME"));
  const wpPassDb = Boolean(row?.wpAppPasswordEncrypted?.trim());
  const wpPassEnv = Boolean(readEnv("WP_APP_PASSWORD"));

  const effectiveWpOrigin =
    inventory.effectiveOrigin ||
    (wordpress?.url ? normalizeWpOrigin(wordpress.url) : null);

  return {
    clientName: row?.clientName?.trim() || null,
    siteName: row?.siteName?.trim() || null,
    openai: {
      agentId: openai?.agentId ?? (agentDb ? row?.openaiAgentId?.trim() ?? null : null),
      agentIdSource: openai?.agentIdSource ?? (agentDb ? "database" : agentEnv ? "env" : null),
      apiKeyConfigured: Boolean(openai?.apiKey) || apiKeyDb || apiKeyEnv,
      apiKeySource: openai?.apiKeySource ?? (apiKeyDb ? "database" : apiKeyEnv ? "env" : null),
    },
    wordpress: {
      url: wordpress?.url ?? (wpUrlDb ? row?.wpUrl?.trim() ?? null : null),
      urlSource: wordpress?.urlSource ?? (wpUrlDb ? "database" : wpUrlEnv ? "env" : null),
      username:
        wordpress?.username ??
        (wpUserDb ? row?.wpUsername?.trim() ?? null : null),
      usernameSource:
        wordpress?.usernameSource ??
        (wpUserDb ? "database" : wpUserEnv ? "env" : null),
      appPasswordConfigured:
        Boolean(wordpress?.appPassword) || wpPassDb || wpPassEnv,
      appPasswordSource:
        wordpress?.appPasswordSource ??
        (wpPassDb ? "database" : wpPassEnv ? "env" : null),
    },
    inventory: {
      wpOrigin: inventory.inventoryOrigin,
      postCount: inventory.postCount,
      siteMismatch: inventory.siteMismatch || !inventory.inventoryValid,
      effectiveWpOrigin: inventory.effectiveOrigin,
      usable: inventory.usable,
      requiresFullSync: inventory.requiresFullSync,
      inventoryValid: inventory.inventoryValid,
      reason: inventory.reason,
    },
    categories: buildCategoriesPublic(row, effectiveWpOrigin),
    encryptionConfigured: isAppSettingsEncryptionConfigured(),
    secretsDecryptError,
  };
}

async function upsertRow(
  data: Record<string, unknown>
): Promise<void> {
  await db.appSettings.upsert({
    where: { id: APP_SETTINGS_ID },
    create: {
      id: APP_SETTINGS_ID,
      ...data,
    },
    update: data,
  });
}

export async function updateGeneralSettings(input: {
  clientName?: string | null;
  siteName?: string | null;
}): Promise<PublicAppSettings> {
  const data: { clientName?: string | null; siteName?: string | null } = {};
  if (input.clientName !== undefined) {
    const value = input.clientName?.trim() || null;
    if (value && value.length > 120) {
      throw new Error("Nom du client trop long (120 caractères max).");
    }
    data.clientName = value;
  }
  if (input.siteName !== undefined) {
    const value = input.siteName?.trim() || null;
    if (value && value.length > 120) {
      throw new Error("Nom du site trop long (120 caractères max).");
    }
    data.siteName = value;
  }
  await upsertRow(data);
  return getPublicAppSettings();
}

export async function updateOpenAiSettings(input: {
  agentId?: string;
  apiKey?: string;
}): Promise<PublicAppSettings> {
  if (!isAppSettingsEncryptionConfigured() && input.apiKey?.trim()) {
    throw new Error(
      "APP_SETTINGS_ENCRYPTION_KEY requis pour enregistrer une clé API."
    );
  }

  const data: {
    openaiAgentId?: string | null;
    openaiApiKeyEncrypted?: string | null;
  } = {};

  if (input.agentId !== undefined) {
    const agentId = input.agentId.trim();
    if (!agentId || agentId.length > 128) {
      throw new Error("Identifiant d’agent OpenAI invalide.");
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(agentId)) {
      throw new Error("Identifiant d’agent OpenAI invalide.");
    }
    data.openaiAgentId = agentId;
  }

  // Champ secret vide = conserver la clé actuelle.
  if (input.apiKey !== undefined && input.apiKey.trim() !== "") {
    const apiKey = input.apiKey.trim();
    if (apiKey.length < 20 || apiKey.length > 512) {
      throw new Error("Clé API OpenAI invalide.");
    }
    data.openaiApiKeyEncrypted = encryptAppSecret(apiKey);
  }

  if (Object.keys(data).length === 0) {
    return getPublicAppSettings();
  }

  await upsertRow(data);
  return getPublicAppSettings();
}

export async function updateWordPressSettings(input: {
  url?: string;
  username?: string;
  appPassword?: string;
}): Promise<PublicAppSettings> {
  if (!isAppSettingsEncryptionConfigured() && input.appPassword?.trim()) {
    throw new Error(
      "APP_SETTINGS_ENCRYPTION_KEY requis pour enregistrer un mot de passe d’application."
    );
  }

  const row = await loadRow();
  const data: {
    wpUrl?: string | null;
    wpUsername?: string | null;
    wpAppPasswordEncrypted?: string | null;
    inventoryValid?: boolean;
    wpCategoriesJson?: string | null;
    wpAllowedCategoryIds?: string | null;
    wpDefaultCategoryId?: number | null;
    wpCategoriesSyncedAt?: Date | null;
    wpCategoriesOrigin?: string | null;
  } = {};

  if (input.url !== undefined) {
    data.wpUrl = await assertSafeWordPressUrlResolved(input.url);
    const newOrigin = normalizeWpOrigin(data.wpUrl);
    const previousOrigin =
      row?.inventoryWpOrigin?.trim() ||
      (row?.wpUrl?.trim()
        ? normalizeWpOrigin(row.wpUrl)
        : readEnv("WP_URL")
          ? normalizeWpOrigin(readEnv("WP_URL")!)
          : null);
    if (previousOrigin && previousOrigin !== newOrigin) {
      // Invalidation explicite — l'ancien inventaire reste en base mais inutilisable.
      data.inventoryValid = false;
      // Snapshot catégories de l'ancien site : invalidé (pas de réutilisation d'IDs).
      Object.assign(data, emptyCategoryFields());
    }
  }

  if (input.username !== undefined) {
    const username = input.username.trim();
    if (!username || username.length > 120) {
      throw new Error("Nom d’utilisateur WordPress invalide.");
    }
    data.wpUsername = username;
  }

  if (input.appPassword !== undefined && input.appPassword.trim() !== "") {
    const password = input.appPassword.trim();
    if (password.length < 8 || password.length > 256) {
      throw new Error("Mot de passe d’application WordPress invalide.");
    }
    data.wpAppPasswordEncrypted = encryptAppSecret(password);
  }

  if (Object.keys(data).length === 0) {
    return getPublicAppSettings();
  }

  await upsertRow(data);
  return getPublicAppSettings();
}

/**
 * Confirme le changement de site : invalide l'inventaire (sans suppression)
 * et impose une synchronisation complète. Ne rend PAS l'inventaire utilisable.
 */
export async function acknowledgeInventorySiteSwitch(): Promise<PublicAppSettings> {
  const wordpress = await resolveWordPressConfig();
  if (!wordpress) {
    throw new Error("WordPress non configuré.");
  }
  await upsertRow({
    inventoryValid: false,
  });
  return getPublicAppSettings();
}

/** Met à jour le marqueur après une sync full réussie — rend l'inventaire utilisable. */
export async function markInventorySyncedForSite(wpUrl: string): Promise<void> {
  const origin = normalizeWpOrigin(wpUrl);
  await upsertRow({
    inventoryWpOrigin: origin,
    inventoryValid: true,
  });
}

/** @deprecated Prefer markInventorySyncedForSite after full sync. */
export async function markInventoryWpOrigin(wpUrl: string): Promise<void> {
  await markInventorySyncedForSite(wpUrl);
}

/**
 * Autorise une sync inventaire.
 * - Inventaire invalidé ou mismatch → sync full uniquement.
 * - Sinon autorise full / incremental.
 */
export async function assertInventorySyncAllowed(
  wpUrl: string,
  mode: "full" | "incremental"
): Promise<void> {
  const origin = normalizeWpOrigin(wpUrl);
  const compatibility = await getInventoryCompatibility();

  if (!compatibility.inventoryValid || compatibility.siteMismatch) {
    if (mode !== "full") {
      throw new Error(
        "Après un changement de site WordPress, une synchronisation complète est obligatoire."
      );
    }
    return;
  }

  if (
    compatibility.postCount > 0 &&
    compatibility.inventoryOrigin &&
    compatibility.inventoryOrigin !== origin
  ) {
    throw new Error(
      `Inventaire local lié à ${compatibility.inventoryOrigin}, alors que WordPress pointe vers ${origin}. Confirmez le changement de site dans Paramètres avant de synchroniser.`
    );
  }
}

/** @deprecated Use assertInventorySyncAllowed */
export async function assertInventorySiteAllowed(
  wpUrl: string
): Promise<void> {
  await assertInventorySyncAllowed(wpUrl, "full");
}

/** Synchronise les catégories depuis le WordPress configuré (lecture seule). */
export async function syncWordPressCategories(): Promise<PublicAppSettings> {
  const wordpress = await resolveWordPressConfig();
  if (!wordpress) {
    throw new Error("WordPress non configuré.");
  }

  const categories = await fetchAllWordPressCategories(wordpress);
  const origin = categoryConfigOriginFromWpUrl(wordpress.url);
  const row = await loadRow();
  const previousAllowed = parseAllowedCategoryIds(row?.wpAllowedCategoryIds);
  const known = new Set(categories.map((item) => item.id));
  const retainedAllowed = previousAllowed.filter((id) => known.has(id));
  let defaultId = row?.wpDefaultCategoryId ?? null;
  if (defaultId && !known.has(defaultId)) {
    defaultId = null;
  }
  if (defaultId && retainedAllowed.length > 0 && !retainedAllowed.includes(defaultId)) {
    // Conservé uniquement s'il reste dans les autorisées ou si aucune autorisée.
    defaultId = null;
  }

  await upsertRow({
    wpCategoriesJson: JSON.stringify(categories),
    wpAllowedCategoryIds:
      retainedAllowed.length > 0 ? JSON.stringify(retainedAllowed) : null,
    wpDefaultCategoryId: defaultId,
    wpCategoriesSyncedAt: new Date(),
    wpCategoriesOrigin: origin,
  });

  return getPublicAppSettings();
}

/** Met à jour la sélection des catégories autorisées / défaut. */
export async function updateWordPressCategorySelection(input: {
  allowedIds?: number[];
  defaultCategoryId?: number | null;
}): Promise<PublicAppSettings> {
  const wordpress = await resolveWordPressConfig();
  if (!wordpress) {
    throw new Error("WordPress non configuré.");
  }
  const row = await loadRow();
  const categories = parseSyncedCategoriesJson(row?.wpCategoriesJson);
  const origin = row?.wpCategoriesOrigin?.trim() || null;
  const effectiveOrigin = normalizeWpOrigin(wordpress.url);

  if (!origin || origin !== effectiveOrigin || categories.length === 0) {
    throw new Error(
      "Synchronisez d’abord les catégories WordPress du site actuellement configuré."
    );
  }

  const data: {
    wpAllowedCategoryIds?: string | null;
    wpDefaultCategoryId?: number | null;
  } = {};

  let allowedIds = parseAllowedCategoryIds(row?.wpAllowedCategoryIds);

  if (input.allowedIds !== undefined) {
    assertCategoryIdsBelongToSite({
      ids: input.allowedIds,
      categories,
      categoriesOrigin: origin,
      effectiveWpOrigin: effectiveOrigin,
    });
    allowedIds = [...new Set(input.allowedIds.filter((id) => id > 0))];
    data.wpAllowedCategoryIds =
      allowedIds.length > 0 ? JSON.stringify(allowedIds) : null;
  }

  if (input.defaultCategoryId !== undefined) {
    const defaultId = input.defaultCategoryId;
    if (defaultId === null) {
      data.wpDefaultCategoryId = null;
    } else {
      assertCategoryIdsBelongToSite({
        ids: [defaultId],
        categories,
        categoriesOrigin: origin,
        effectiveWpOrigin: effectiveOrigin,
      });
      if (allowedIds.length > 0 && !allowedIds.includes(defaultId)) {
        throw new Error(
          "La catégorie par défaut doit faire partie des catégories autorisées."
        );
      }
      data.wpDefaultCategoryId = defaultId;
    }
  }

  if (Object.keys(data).length === 0) {
    return getPublicAppSettings();
  }

  await upsertRow(data);
  return getPublicAppSettings();
}
