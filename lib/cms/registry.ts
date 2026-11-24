import { createWordPressConnector } from "@/lib/cms/wordpress-connector";
import { createWebflowConnector } from "@/lib/cms/webflow-connector";
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
 * Webflow : génération de brouillons CMS (V7.10.1) si readiness runtime OK.
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
      "Brouillons CMS via Data API V2 (agent OpenAI Webflow). Publication manuelle dans Webflow.",
    status: "active",
    // Sélectionnable côté catalogue ; la readiness runtime (token/mapping/agent)
    // décide si l’UI et l’API autorisent réellement la génération.
    enabled: true,
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
 * Retourne le connecteur actif (WordPress ou Webflow brouillon).
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

  if (id === "webflow") {
    // Test de connexion / lecture uniquement — createDraft refuse.
    return createWebflowConnector();
  }

  throw new Error(`Connecteur CMS inconnu pour « ${id} ».`);
}
