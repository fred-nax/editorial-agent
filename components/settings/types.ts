export type SyncedWpCategoryView = {
  id: number;
  name: string;
  slug: string;
  count: number;
  description: string;
};

export type PublicSettingsView = {
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
    items: SyncedWpCategoryView[];
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
