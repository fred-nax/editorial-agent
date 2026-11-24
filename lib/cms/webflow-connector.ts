/**
 * Connecteur Webflow V7.10.1 — test + création de brouillon CMS.
 */

import type {
  CmsConnectionTestResult,
  CmsConnector,
  CmsDraftInput,
  CmsDraftResult,
} from "@/lib/cms/types";
import { resolveWebflowConfig } from "@/lib/settings/app-settings";
import {
  createWebflowClient,
  createWebflowCollectionDraft,
  testWebflowConnection,
  WebflowApiError,
} from "@/lib/webflow";

export function createWebflowConnector(): CmsConnector {
  return {
    id: "webflow",
    label: "Webflow",
    async createDraft(input: CmsDraftInput): Promise<CmsDraftResult> {
      const config = await resolveWebflowConfig();
      if (!config?.apiToken) {
        throw new Error("Webflow non configuré (token API manquant).");
      }
      if (!config.collectionId) {
        throw new Error("Collection Webflow non sélectionnée.");
      }

      const client = createWebflowClient({ apiToken: config.apiToken });

      try {
        const created = await createWebflowCollectionDraft({
          client,
          collectionId: config.collectionId,
          mapping: config.fieldMapping,
          input: {
            title: input.title,
            content: input.content,
            excerpt: input.excerpt ?? "",
            slug: input.slug ?? "",
            meta_title: input.meta_title ?? "",
            meta_description: input.meta_description ?? "",
          },
          rejectIfSlugExists: true,
        });

        return {
          success: true,
          destination: "webflow",
          externalId: created.itemId,
          status: "draft",
          title: created.title,
          // Pas d’URL d’édition/publication fabriquée.
          link: "",
          webflow: {
            itemId: created.itemId,
            isDraft: true,
            slug: created.slug,
            excerpt: created.excerpt,
            meta_title: created.meta_title,
            meta_description: created.meta_description,
          },
        };
      } catch (error) {
        if (error instanceof WebflowApiError) {
          throw new Error(error.message);
        }
        throw error;
      }
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
