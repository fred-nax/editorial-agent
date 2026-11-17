export const WP_SEO_PLUGINS = ["slim_seo", "yoast_seo"] as const;

export type WpSeoPlugin = (typeof WP_SEO_PLUGINS)[number];

export const DEFAULT_WP_SEO_PLUGIN: WpSeoPlugin = "slim_seo";

export type SeoMetaFields = {
  meta_title: string;
  meta_description: string;
};

export type SeoAdapterResult = {
  /** Objet `meta` à envoyer dans POST/PATCH /wp/v2/posts (ou null si rien). */
  restMeta: Record<string, unknown> | null;
  /** Clés à vérifier après écriture (chemins dans meta REST). */
  verifyKeys: string[];
};

export type SeoVerifyResult = {
  persisted: boolean;
  error: string | null;
  titleMatch: boolean;
  descriptionMatch: boolean;
};

export function isWpSeoPlugin(value: unknown): value is WpSeoPlugin {
  return value === "slim_seo" || value === "yoast_seo";
}

export function normalizeWpSeoPlugin(
  value: string | null | undefined
): WpSeoPlugin {
  if (value === "yoast_seo") {
    return "yoast_seo";
  }
  return DEFAULT_WP_SEO_PLUGIN;
}

export function wpSeoPluginLabel(plugin: WpSeoPlugin): string {
  return plugin === "yoast_seo" ? "Yoast SEO" : "Slim SEO";
}
