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
};

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
      ...row,
      inventoryValid: row.inventoryValid !== false,
    };
  } catch {
    // Table absente avant migrate — fallback env uniquement.
    return null;
  }
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
