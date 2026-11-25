/**
 * Configuration Webflow pour l’inventaire — espace actif uniquement.
 * Jamais de fallback WordPress.
 */

import {
  decryptWorkspaceSecret,
  loadWorkspaceCmsSettings,
  type EditorialWorkspaceRecord,
} from "@/lib/workspace";
import { parseWebflowFieldMappingJson } from "@/lib/webflow/mapping";
import type { WebflowFieldMapping } from "@/lib/webflow/types";
import { WorkspaceContextError } from "@/lib/workspace/errors";

export type WebflowInventoryConfig = {
  workspaceId: string;
  apiToken: string;
  siteId: string;
  collectionId: string;
  fieldMapping: WebflowFieldMapping;
};

/**
 * Résout token / site / collection / mapping pour l’espace Webflow donné.
 * Utilise WorkspaceCmsSettings (+ dual-read legacy AppSettings Webflow).
 */
export async function resolveWebflowInventoryConfig(
  workspace: EditorialWorkspaceRecord
): Promise<WebflowInventoryConfig> {
  if (workspace.cmsProvider !== "webflow") {
    throw new WorkspaceContextError(
      "WORKSPACE_CMS_MISMATCH",
      "L’inventaire Webflow est réservé à un espace Webflow.",
      403
    );
  }

  const settings = await loadWorkspaceCmsSettings(workspace);
  const apiToken = decryptWorkspaceSecret(settings.webflowApiTokenEncrypted);
  const siteId = settings.webflowSiteId?.trim() || "";
  const collectionId = settings.webflowCollectionId?.trim() || "";

  if (!apiToken) {
    throw new WorkspaceContextError(
      "WORKSPACE_OPERATION_FORBIDDEN",
      "Token API Webflow manquant pour cet espace. Configurez-le dans Intégrations.",
      400
    );
  }
  if (!siteId || !collectionId) {
    throw new WorkspaceContextError(
      "WORKSPACE_OPERATION_FORBIDDEN",
      "Site ID et Collection ID Webflow requis pour synchroniser l’inventaire.",
      400
    );
  }

  const fieldMapping = parseWebflowFieldMappingJson(
    settings.webflowFieldMappingJson
  );
  const titleSlug = fieldMapping.title?.fieldSlug?.trim();
  const slugSlug = fieldMapping.slug?.fieldSlug?.trim();
  if (!titleSlug || !slugSlug) {
    throw new WorkspaceContextError(
      "WORKSPACE_OPERATION_FORBIDDEN",
      "Mapping CMS Webflow incomplet (title et slug obligatoires) pour l’inventaire.",
      400
    );
  }

  return {
    workspaceId: workspace.id,
    apiToken,
    siteId,
    collectionId,
    fieldMapping,
  };
}
