import { createWebflowClient } from "@/lib/webflow/client";
import { WebflowApiError } from "@/lib/webflow/errors";
import { probeWebflowAssetsRead } from "@/lib/webflow/assets";
import { listWebflowSites } from "@/lib/webflow/sites";
import type { ConnectionTestResult } from "@/lib/settings/connection-tests";

/**
 * Test non destructif : GET /sites avec le token fourni.
 * Optionnellement sonde assets:read (aucune création d’asset).
 * Ne confond pas validité du token et permissions Assets.
 */
export async function testWebflowConnection(input: {
  apiToken: string;
  siteId?: string | null;
  /** Sonde GET /sites/{id}/assets?limit=1 — défaut true si siteId fourni. */
  probeAssets?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<ConnectionTestResult> {
  const apiToken = input.apiToken.trim();
  if (!apiToken) {
    return {
      ok: false,
      message: "Token API Webflow manquant pour le test.",
    };
  }

  try {
    const client = createWebflowClient({
      apiToken,
      fetchImpl: input.fetchImpl,
    });
    const sites = await listWebflowSites(client);
    const preferredSiteId = input.siteId?.trim() || null;
    const matched = preferredSiteId
      ? sites.find((site) => site.id === preferredSiteId)
      : null;

    if (preferredSiteId && !matched) {
      return {
        ok: false,
        message:
          "Connexion OK mais le site configuré est introuvable pour ce token.",
        details: {
          siteCount: sites.length,
          configuredSiteFound: false,
          featuredImagesReady: false,
          assetsReadOk: false,
        },
      };
    }

    let assetsReadOk: boolean | null = null;
    let assetsMessage = "";
    const shouldProbeAssets =
      input.probeAssets !== false && Boolean(preferredSiteId);

    if (shouldProbeAssets && preferredSiteId) {
      const probe = await probeWebflowAssetsRead(client, preferredSiteId);
      assetsReadOk = probe.ok;
      assetsMessage = probe.message;
    }

    const baseMessage = matched
      ? `Connexion réussie — site « ${matched.displayName} » accessible (${sites.length} site${sites.length > 1 ? "s" : ""}).`
      : `Connexion réussie — ${sites.length} site${sites.length > 1 ? "s" : ""} accessible${sites.length > 1 ? "s" : ""}.`;

    const featuredNote =
      assetsReadOk === true
        ? " Images Webflow : permission assets:read détectée (assets:write requis pour le transfert)."
        : assetsReadOk === false
          ? ` Images Webflow non prêtes : ${assetsMessage}`
          : preferredSiteId
            ? ""
            : " Sélectionnez un site pour vérifier les permissions Assets (images à la une).";

    return {
      ok: true,
      message: `${baseMessage}${featuredNote}`,
      details: {
        siteCount: sites.length,
        configuredSiteFound: Boolean(matched),
        configuredSiteName: matched?.displayName ?? null,
        featuredImagesReady: assetsReadOk === true,
        assetsReadOk,
        assetsProbeMessage: assetsMessage || null,
      },
    };
  } catch (error) {
    if (error instanceof WebflowApiError) {
      return {
        ok: false,
        message: error.message,
        details: {
          code: error.code,
          status: error.status,
          retryAfterSeconds: error.retryAfterSeconds,
          featuredImagesReady: false,
        },
      };
    }
    return {
      ok: false,
      message: "Impossible de joindre l’API Webflow.",
    };
  }
}
