/** Identifiants stables des espaces éditoriaux initiaux (V7.11.1). */
export const WORKSPACE_IDS = {
  wordpress: "ws_wordpress_naxialis",
  webflow: "ws_webflow_ai_studio_01",
} as const;

export const WORKSPACE_SLUGS = {
  wordpress: "wordpress-naxialis",
  webflow: "webflow-ai-studio-01",
} as const;

export type WorkspaceCmsProvider = "wordpress" | "webflow";

/** Cookie httpOnly mémorisant l’espace actif (validé côté serveur). */
export const WORKSPACE_COOKIE_NAME = "naxialis_workspace";

/** Durée de mémorisation du sélecteur (30 jours). */
export const WORKSPACE_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30;

export const KNOWN_WORKSPACE_IDS = new Set<string>(Object.values(WORKSPACE_IDS));
