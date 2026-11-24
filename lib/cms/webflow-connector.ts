/**
 * Connecteur Webflow V7.10.0 — lecture / test uniquement.
 * createDraft refuse explicitement (génération non activée).
 */

import type {
  CmsConnectionTestResult,
  CmsConnector,
  CmsDraftInput,
  CmsDraftResult,
} from "@/lib/cms/types";
import { resolveWebflowConfig } from "@/lib/settings/app-settings";
import { assertWebflowDraftCreationDisabled } from "@/lib/agent/webflow-draft-tool";
import { testWebflowConnection } from "@/lib/webflow";

export function createWebflowConnector(): CmsConnector {
  return {
    id: "webflow",
    label: "Webflow",
    async createDraft(_input: CmsDraftInput): Promise<CmsDraftResult> {
      assertWebflowDraftCreationDisabled();
    },
    async testConnection(): Promise<CmsConnectionTestResult> {
      const config = await resolveWebflowConfig();
      if (!config?.apiToken) {
        return {
          ok: false,
          message: "Webflow non configuré (token API manquant).",
        };
      }
      return testWebflowConnection({
        apiToken: config.apiToken,
        siteId: config.siteId,
      });
    },
  };
}
