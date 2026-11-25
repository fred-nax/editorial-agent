/**
 * Diagnostic non destructif : images à la une Webflow prêtes ?
 * Ne confond pas « token valide » et « permissions assets + mapping image ».
 * Aucune création d’asset.
 */

import { resolveWebflowConfig } from "@/lib/settings/app-settings";
import { createWebflowClient } from "@/lib/webflow/client";
import { probeWebflowAssetsRead } from "@/lib/webflow/assets";
import type { WebflowFieldMapping } from "@/lib/webflow/types";

export type WebflowFeaturedImageReadiness = {
  /** Token + site + mapping image + sonde assets:read OK. */
  ready: boolean;
  /** Token Webflow présent (≠ permissions assets). */
  tokenConfigured: boolean;
  siteConfigured: boolean;
  collectionConfigured: boolean;
  featuredImageMapped: boolean;
  altTextMapped: boolean;
  assetsReadOk: boolean | null;
  reasons: string[];
  siteId: string | null;
  collectionId: string | null;
};

function mappingHasFeaturedImage(mapping: WebflowFieldMapping): boolean {
  const image = mapping.featured_image;
  return Boolean(image?.fieldId?.trim() && image?.fieldSlug?.trim());
}

function mappingHasAlt(mapping: WebflowFieldMapping): boolean {
  const alt = mapping.alt_text;
  return Boolean(alt?.fieldId?.trim() && alt?.fieldSlug?.trim());
}

/**
 * Évalue la disponibilité de la fonctionnalité images Webflow.
 * Sonde assets:read uniquement si token + site présents (GET liste, limit=1).
 */
export async function getWebflowFeaturedImageReadiness(options?: {
  probeAssets?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<WebflowFeaturedImageReadiness> {
  const reasons: string[] = [];
  const config = await resolveWebflowConfig();
  const tokenConfigured = Boolean(config?.apiToken?.trim());
  const siteId = config?.siteId?.trim() || null;
  const collectionId = config?.collectionId?.trim() || null;
  const mapping = config?.fieldMapping ?? {};

  const siteConfigured = Boolean(siteId);
  const collectionConfigured = Boolean(collectionId);
  const featuredImageMapped = mappingHasFeaturedImage(mapping);
  const altTextMapped = mappingHasAlt(mapping);

  if (!tokenConfigured) {
    reasons.push("Token API Webflow manquant.");
  }
  if (!siteConfigured) {
    reasons.push("Site Webflow non sélectionné.");
  }
  if (!collectionConfigured) {
    reasons.push("Collection Webflow non sélectionnée.");
  }
  if (!featuredImageMapped) {
    reasons.push(
      "Mapping CMS « featured_image » (champ Image) manquant — requis pour associer l’image à la une."
    );
  }
  if (!altTextMapped) {
    reasons.push(
      "Mapping CMS « alt_text » manquant (recommandé pour le texte ALT séparé)."
    );
  }

  let assetsReadOk: boolean | null = null;
  const shouldProbe = options?.probeAssets !== false;

  if (shouldProbe && tokenConfigured && siteId) {
    try {
      const client = createWebflowClient({
        apiToken: config!.apiToken,
        fetchImpl: options?.fetchImpl,
      });
      const probe = await probeWebflowAssetsRead(client, siteId);
      assetsReadOk = probe.ok;
      if (!probe.ok) {
        reasons.push(probe.message);
        reasons.push(
          "Sans assets:read (et assets:write pour le transfert), les images Webflow ne sont pas prêtes — même si le token sites/cms est valide."
        );
      }
    } catch (error) {
      assetsReadOk = false;
      reasons.push(
        error instanceof Error
          ? `Sonde Assets impossible : ${error.message}`
          : "Sonde Assets impossible."
      );
    }
  } else if (!tokenConfigured || !siteId) {
    assetsReadOk = null;
  }

  // alt_text optionnel pour « ready » (ALT peut aller dans l’objet Image) ;
  // featured_image + assets:read obligatoires.
  const ready =
    tokenConfigured &&
    siteConfigured &&
    collectionConfigured &&
    featuredImageMapped &&
    assetsReadOk === true;

  return {
    ready,
    tokenConfigured,
    siteConfigured,
    collectionConfigured,
    featuredImageMapped,
    altTextMapped,
    assetsReadOk,
    reasons: ready ? [] : [...new Set(reasons)],
    siteId,
    collectionId,
  };
}
