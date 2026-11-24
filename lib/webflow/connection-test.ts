import { createWebflowClient } from "@/lib/webflow/client";
import { WebflowApiError } from "@/lib/webflow/errors";
import { listWebflowSites } from "@/lib/webflow/sites";
import type { ConnectionTestResult } from "@/lib/settings/connection-tests";

/**
 * Test non destructif : GET /sites avec le token fourni.
 * Aucune écriture, aucune publication.
 */
export async function testWebflowConnection(input: {
  apiToken: string;
  siteId?: string | null;
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
        },
      };
    }

    return {
      ok: true,
      message: matched
        ? `Connexion réussie — site « ${matched.displayName} » accessible (${sites.length} site${sites.length > 1 ? "s" : ""}).`
        : `Connexion réussie — ${sites.length} site${sites.length > 1 ? "s" : ""} accessible${sites.length > 1 ? "s" : ""}.`,
      details: {
        siteCount: sites.length,
        configuredSiteFound: Boolean(matched),
        configuredSiteName: matched?.displayName ?? null,
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
        },
      };
    }
    return {
      ok: false,
      message: "Impossible de joindre l’API Webflow.",
    };
  }
}
