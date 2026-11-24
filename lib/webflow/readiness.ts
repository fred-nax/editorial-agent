/**
 * Critères d’activation de la génération Webflow (V7.10.1).
 */

import {
  resolveOpenAiConfig,
  resolveWebflowConfig,
} from "@/lib/settings/app-settings";
import {
  createWebflowClient,
  getWebflowCollectionDetails,
  validateWebflowFieldMapping,
  WEBFLOW_REQUIRED_EDITORIAL_FIELDS,
} from "@/lib/webflow";

export type WebflowGenerationReadiness = {
  ok: boolean;
  reasons: string[];
  siteId: string | null;
  collectionId: string | null;
  agentConfigured: boolean;
  tokenConfigured: boolean;
  mappingComplete: boolean;
  mappingValid: boolean;
};

/**
 * Vérifie que la génération Webflow peut être proposée / lancée.
 * N’écrit rien à distance. Les tests doivent mocker fetch si besoin.
 */
export async function getWebflowGenerationReadiness(options?: {
  /** Si true, revalide le mapping contre le schéma collection distant. */
  verifyRemoteSchema?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<WebflowGenerationReadiness> {
  const reasons: string[] = [];
  const config = await resolveWebflowConfig();
  const openai = await resolveOpenAiConfig();

  const tokenConfigured = Boolean(config?.apiToken);
  const agentConfigured = Boolean(config?.agentId);
  const siteId = config?.siteId ?? null;
  const collectionId = config?.collectionId ?? null;
  const mapping = config?.fieldMapping ?? {};

  if (!tokenConfigured) {
    reasons.push("Token API Webflow manquant.");
  }
  if (!agentConfigured) {
    reasons.push("Agent OpenAI Webflow manquant.");
  }
  if (!openai?.apiKey) {
    reasons.push("Clé API OpenAI manquante.");
  }
  if (!siteId) {
    reasons.push("Site Webflow non sélectionné.");
  }
  if (!collectionId) {
    reasons.push("Collection Webflow non sélectionnée.");
  }

  let mappingComplete = true;
  for (const key of WEBFLOW_REQUIRED_EDITORIAL_FIELDS) {
    if (!mapping[key]?.fieldId || !mapping[key]?.fieldSlug) {
      mappingComplete = false;
      reasons.push(`Mapping incomplet pour « ${key} ».`);
    }
  }

  let mappingValid = mappingComplete;
  if (
    options?.verifyRemoteSchema !== false &&
    tokenConfigured &&
    collectionId &&
    mappingComplete
  ) {
    try {
      const client = createWebflowClient({
        apiToken: config!.apiToken,
        fetchImpl: options?.fetchImpl,
      });
      const details = await getWebflowCollectionDetails(client, collectionId);
      const validation = validateWebflowFieldMapping(mapping, details.fields);
      mappingValid = validation.ok;
      if (!validation.ok) {
        for (const issue of validation.issues.slice(0, 6)) {
          reasons.push(issue.message);
        }
      }
    } catch (error) {
      mappingValid = false;
      reasons.push(
        error instanceof Error
          ? `Validation mapping distante impossible : ${error.message}`
          : "Validation mapping distante impossible."
      );
    }
  }

  const ok =
    tokenConfigured &&
    agentConfigured &&
    Boolean(openai?.apiKey) &&
    Boolean(siteId) &&
    Boolean(collectionId) &&
    mappingComplete &&
    mappingValid;

  return {
    ok,
    reasons: ok ? [] : [...new Set(reasons)],
    siteId,
    collectionId,
    agentConfigured,
    tokenConfigured,
    mappingComplete,
    mappingValid,
  };
}
