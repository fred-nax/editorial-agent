/**
 * Couche multi-CMS (V7.9.0+).
 * WordPress = destination active (brouillons).
 * Webflow = connexion + mapping lecture seule (V7.10.0) — génération désactivée.
 */

export const CMS_DESTINATION_IDS = ["wordpress", "webflow"] as const;

export type CmsDestinationId = (typeof CMS_DESTINATION_IDS)[number];

/** Destination par défaut et valeur implicite des générations historiques. */
export const DEFAULT_CMS_DESTINATION: CmsDestinationId = "wordpress";

export type CmsDestinationStatus = "active" | "coming_soon";

export type CmsDestinationDescriptor = {
  id: CmsDestinationId;
  label: string;
  description: string;
  status: CmsDestinationStatus;
  /** true uniquement si un connecteur réel est enregistré et utilisable. */
  enabled: boolean;
};

export type CmsDraftInput = {
  title: string;
  content: string;
  excerpt?: string;
  slug?: string;
  meta_title?: string;
  meta_description?: string;
  categoryIds?: number[];
};

/**
 * Résultat normalisé d’une création de brouillon CMS.
 * Pour WordPress, externalId = String(post_id) ; les champs WP restent exposés
 * pour compatibilité avec le workflow historique.
 */
export type CmsDraftResult = {
  success: true;
  destination: CmsDestinationId;
  externalId: string;
  status: string;
  title: string;
  link: string;
  /** Présents pour WordPress uniquement. */
  wordpress?: {
    post_id: number;
    categories: number[];
    meta_title: string;
    meta_description: string;
    seo_plugin?: string;
    seo_persisted?: boolean;
    seo_error?: string | null;
  };
};

export type CmsConnectionTestResult = {
  ok: boolean;
  message: string;
  details?: Record<string, string | boolean | number | null>;
};

export interface CmsConnector {
  id: CmsDestinationId;
  label: string;
  createDraft(input: CmsDraftInput): Promise<CmsDraftResult>;
  testConnection(): Promise<CmsConnectionTestResult>;
}

export function isCmsDestinationId(value: unknown): value is CmsDestinationId {
  return value === "wordpress" || value === "webflow";
}

/**
 * Normalise la destination stockée / demandée.
 * null / undefined / inconnu → wordpress (rétrocompat générations historiques).
 */
export function normalizeCmsDestination(
  value: string | null | undefined
): CmsDestinationId {
  if (value === "webflow") {
    return "webflow";
  }
  return DEFAULT_CMS_DESTINATION;
}
