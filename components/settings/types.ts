export type SyncedWpCategoryView = {
  id: number;
  name: string;
  slug: string;
  count: number;
  description: string;
};

export type WpSeoPluginView = "slim_seo" | "yoast_seo";

export type WebflowFieldMappingView = Partial<
  Record<
    string,
    {
      fieldId: string;
      fieldSlug?: string | null;
      fieldType?: string | null;
      displayName?: string | null;
    } | null
  >
>;

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
  webflow: {
    agentId: string | null;
    agentIdSource: "database" | "env" | null;
    apiTokenConfigured: boolean;
    apiTokenSource: "database" | "env" | null;
    siteId: string | null;
    siteIdSource: "database" | "env" | null;
    collectionId: string | null;
    collectionIdSource: "database" | "env" | null;
    fieldMapping: WebflowFieldMappingView;
    connectionConfigured: boolean;
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
  wpSeoPlugin: WpSeoPluginView;
  encryptionConfigured: boolean;
  secretsDecryptError: string | null;
};
