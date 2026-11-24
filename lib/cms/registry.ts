import { createWordPressConnector } from "@/lib/cms/wordpress-connector";
import type {
  CmsConnector,
  CmsDestinationDescriptor,
  CmsDestinationId,
} from "@/lib/cms/types";
import {
  DEFAULT_CMS_DESTINATION,
  isCmsDestinationId,
  normalizeCmsDestination,
} from "@/lib/cms/types";
import type { WordPressConfig } from "@/lib/settings/app-settings";

/**
 * Catalogue des destinations CMS.
 * Webflow est listé mais non activé — aucun connecteur fonctionnel.
 */
export const CMS_DESTINATION_CATALOG: readonly CmsDestinationDescriptor[] = [
  {
    id: "wordpress",
    label: "WordPress",
    description:
      "Publication en brouillon via l’API REST WordPress (comportement historique).",
    status: "active",
    enabled: true,
  },
  {
    id: "webflow",
    label: "Webflow",
    description:
      "Destination prévue. Connecteur et serveur MCP non disponibles dans cette version.",
    status: "coming_soon",
    enabled: false,
  },
] as const;

export function listCmsDestinations(): CmsDestinationDescriptor[] {
  return [...CMS_DESTINATION_CATALOG];
}

export function getCmsDestination(
  id: CmsDestinationId
): CmsDestinationDescriptor | undefined {
  return CMS_DESTINATION_CATALOG.find((item) => item.id === id);
}

export function isCmsDestinationEnabled(id: CmsDestinationId): boolean {
  return getCmsDestination(id)?.enabled === true;
}

/**
 * Valide une destination demandée par le client.
 * Refuse webflow et toute valeur inconnue ; défaut wordpress.
 */
export function parseCmsDestinationInput(
  value: unknown
): { ok: true; destination: CmsDestinationId } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, destination: DEFAULT_CMS_DESTINATION };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "Destination CMS invalide." };
  }
  const trimmed = value.trim();
  if (!isCmsDestinationId(trimmed)) {
    return { ok: false, error: "Destination CMS inconnue." };
  }
  if (!isCmsDestinationEnabled(trimmed)) {
    return {
      ok: false,
      error:
        trimmed === "webflow"
          ? "Webflow n’est pas encore disponible. Sélectionnez WordPress."
          : "Cette destination CMS n’est pas activée.",
    };
  }
  return { ok: true, destination: trimmed };
}

/**
 * Retourne le connecteur actif.
 * Seul WordPress est implémenté — webflow lève une erreur explicite.
 */
export function getCmsConnector(
  destination: CmsDestinationId | string | null | undefined,
  wordpressCredentials?: WordPressConfig
): CmsConnector {
  const id = normalizeCmsDestination(
    typeof destination === "string" ? destination : destination ?? null
  );

  if (id === "wordpress") {
    return createWordPressConnector(wordpressCredentials);
  }

  throw new Error(
    "Le connecteur Webflow n’est pas disponible dans cette version."
  );
}
