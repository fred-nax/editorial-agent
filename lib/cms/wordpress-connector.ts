import {
  resolveWordPressConfig,
  type WordPressConfig,
} from "@/lib/settings/app-settings";
import { testWordPressConnection } from "@/lib/settings/connection-tests";
import { createWordPressDraft } from "@/lib/wordpress";
import type {
  CmsConnectionTestResult,
  CmsConnector,
  CmsDraftInput,
  CmsDraftResult,
} from "@/lib/cms/types";

/**
 * Connecteur WordPress — réutilise intégralement createWordPressDraft
 * et le test de connexion non destructif existants.
 * Le schéma tool OpenAI create_wordpress_draft reste inchangé.
 */
export function createWordPressConnector(
  credentials?: WordPressConfig
): CmsConnector {
  return {
    id: "wordpress",
    label: "WordPress",

    async createDraft(input: CmsDraftInput): Promise<CmsDraftResult> {
      const result = await createWordPressDraft(
        {
          title: input.title,
          content: input.content,
          excerpt: input.excerpt,
          slug: input.slug,
          meta_title: input.meta_title,
          meta_description: input.meta_description,
          categoryIds: input.categoryIds,
        },
        credentials
      );

      return {
        success: true,
        destination: "wordpress",
        externalId: String(result.post_id),
        status: result.status,
        title: result.title,
        link: result.link,
        wordpress: {
          post_id: result.post_id,
          categories: result.categories,
          meta_title: result.meta_title,
          meta_description: result.meta_description,
          seo_plugin: result.seo_plugin as string,
          seo_persisted: result.seo_persisted,
          seo_error: result.seo_error,
        },
      };
    },

    async testConnection(): Promise<CmsConnectionTestResult> {
      const config = credentials ?? (await resolveWordPressConfig());
      if (!config) {
        return {
          ok: false,
          message: "WordPress non configuré.",
        };
      }
      return testWordPressConnection({
        url: config.url,
        username: config.username,
        appPassword: config.appPassword,
      });
    },
  };
}
