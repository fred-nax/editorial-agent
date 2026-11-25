import { db } from "@/lib/db";
import {
  decryptAppSettingsSecret,
} from "@/lib/settings/decrypt";
import { APP_SETTINGS_ID } from "@/lib/settings/app-settings-id";
import { WORKSPACE_IDS } from "./constants";
import type { EditorialWorkspaceRecord } from "./context";
import { WorkspaceContextError } from "./errors";

export type WorkspaceCmsSettingsRow = {
  workspaceId: string;
  openaiAgentId: string | null;
  wpUrl: string | null;
  wpUsername: string | null;
  wpAppPasswordEncrypted: string | null;
  inventoryWpOrigin: string | null;
  inventoryValid: boolean;
  wpCategoriesJson: string | null;
  wpAllowedCategoryIds: string | null;
  wpDefaultCategoryId: number | null;
  wpCategoriesSyncedAt: Date | null;
  wpCategoriesOrigin: string | null;
  wpSeoPlugin: string | null;
  webflowApiTokenEncrypted: string | null;
  webflowSiteId: string | null;
  webflowCollectionId: string | null;
  webflowFieldMappingJson: string | null;
  webflowDefaultCategoryItemId: string | null;
  webflowDefaultAuthorItemId: string | null;
  webflowReferencesSyncedAt: Date | null;
  defaultLanguage: string | null;
};

type LegacyAppSettingsRow = {
  openaiAgentId: string | null;
  openaiWebflowAgentId: string | null;
  wpUrl: string | null;
  wpUsername: string | null;
  wpAppPasswordEncrypted: string | null;
  inventoryWpOrigin: string | null;
  inventoryValid: boolean;
  wpCategoriesJson: string | null;
  wpAllowedCategoryIds: string | null;
  wpDefaultCategoryId: number | null;
  wpCategoriesSyncedAt: Date | null;
  wpCategoriesOrigin: string | null;
  wpSeoPlugin: string | null;
  webflowApiTokenEncrypted: string | null;
  webflowSiteId: string | null;
  webflowCollectionId: string | null;
  webflowFieldMappingJson: string | null;
};

async function loadLegacyAppSettings(): Promise<LegacyAppSettingsRow | null> {
  try {
    const row = await db.appSettings.findUnique({
      where: { id: APP_SETTINGS_ID },
    });
    if (!row) {
      return null;
    }
    return {
      openaiAgentId: row.openaiAgentId,
      openaiWebflowAgentId: row.openaiWebflowAgentId,
      wpUrl: row.wpUrl,
      wpUsername: row.wpUsername,
      wpAppPasswordEncrypted: row.wpAppPasswordEncrypted,
      inventoryWpOrigin: row.inventoryWpOrigin,
      inventoryValid: row.inventoryValid !== false,
      wpCategoriesJson: row.wpCategoriesJson,
      wpAllowedCategoryIds: row.wpAllowedCategoryIds,
      wpDefaultCategoryId: row.wpDefaultCategoryId,
      wpCategoriesSyncedAt: row.wpCategoriesSyncedAt,
      wpCategoriesOrigin: row.wpCategoriesOrigin,
      wpSeoPlugin: row.wpSeoPlugin,
      webflowApiTokenEncrypted: row.webflowApiTokenEncrypted,
      webflowSiteId: row.webflowSiteId,
      webflowCollectionId: row.webflowCollectionId,
      webflowFieldMappingJson: row.webflowFieldMappingJson,
    };
  } catch {
    return null;
  }
}

function prefer(primary: string | null | undefined, fallback: string | null | undefined): string | null {
  const a = primary?.trim() || null;
  if (a) {
    return a;
  }
  return fallback?.trim() || null;
}

/**
 * Dual-read strict :
 * - WorkspaceCmsSettings en priorité ;
 * - AppSettings legacy uniquement pour l’espace dont l’appartenance est connue
 *   (WP → champs WP / agent WP ; Webflow → champs Webflow / agent Webflow).
 * Aucun croisement CMS.
 */
export async function loadWorkspaceCmsSettings(
  workspace: EditorialWorkspaceRecord
): Promise<WorkspaceCmsSettingsRow> {
  const row = await db.workspaceCmsSettings.findUnique({
    where: { workspaceId: workspace.id },
  });

  const legacy = await loadLegacyAppSettings();
  const allowWpLegacy =
    workspace.cmsProvider === "wordpress" &&
    workspace.id === WORKSPACE_IDS.wordpress;
  const allowWebflowLegacy =
    workspace.cmsProvider === "webflow" &&
    workspace.id === WORKSPACE_IDS.webflow;

  if (!row && !legacy) {
    throw new WorkspaceContextError(
      "WORKSPACE_NOT_FOUND",
      `Configuration CMS absente pour l’espace ${workspace.slug}.`,
      404
    );
  }

  if (workspace.cmsProvider === "wordpress") {
    return {
      workspaceId: workspace.id,
      openaiAgentId: prefer(
        row?.openaiAgentId,
        allowWpLegacy ? legacy?.openaiAgentId : null
      ),
      wpUrl: prefer(row?.wpUrl, allowWpLegacy ? legacy?.wpUrl : null),
      wpUsername: prefer(
        row?.wpUsername,
        allowWpLegacy ? legacy?.wpUsername : null
      ),
      wpAppPasswordEncrypted: prefer(
        row?.wpAppPasswordEncrypted,
        allowWpLegacy ? legacy?.wpAppPasswordEncrypted : null
      ),
      inventoryWpOrigin: prefer(
        row?.inventoryWpOrigin,
        allowWpLegacy ? legacy?.inventoryWpOrigin : null
      ),
      inventoryValid: row?.inventoryValid ?? legacy?.inventoryValid ?? true,
      wpCategoriesJson: prefer(
        row?.wpCategoriesJson,
        allowWpLegacy ? legacy?.wpCategoriesJson : null
      ),
      wpAllowedCategoryIds: prefer(
        row?.wpAllowedCategoryIds,
        allowWpLegacy ? legacy?.wpAllowedCategoryIds : null
      ),
      wpDefaultCategoryId:
        row?.wpDefaultCategoryId ??
        (allowWpLegacy ? legacy?.wpDefaultCategoryId ?? null : null),
      wpCategoriesSyncedAt:
        row?.wpCategoriesSyncedAt ??
        (allowWpLegacy ? legacy?.wpCategoriesSyncedAt ?? null : null),
      wpCategoriesOrigin: prefer(
        row?.wpCategoriesOrigin,
        allowWpLegacy ? legacy?.wpCategoriesOrigin : null
      ),
      wpSeoPlugin: prefer(
        row?.wpSeoPlugin,
        allowWpLegacy ? legacy?.wpSeoPlugin : null
      ),
      webflowApiTokenEncrypted: null,
      webflowSiteId: null,
      webflowCollectionId: null,
      webflowFieldMappingJson: null,
      webflowDefaultCategoryItemId: null,
      webflowDefaultAuthorItemId: null,
      webflowReferencesSyncedAt: null,
      defaultLanguage: row?.defaultLanguage ?? workspace.defaultLanguage,
    };
  }

  return {
    workspaceId: workspace.id,
    openaiAgentId: prefer(
      row?.openaiAgentId,
      allowWebflowLegacy ? legacy?.openaiWebflowAgentId : null
    ),
    wpUrl: null,
    wpUsername: null,
    wpAppPasswordEncrypted: null,
    inventoryWpOrigin: null,
    inventoryValid: true,
    wpCategoriesJson: null,
    wpAllowedCategoryIds: null,
    wpDefaultCategoryId: null,
    wpCategoriesSyncedAt: null,
    wpCategoriesOrigin: null,
    wpSeoPlugin: null,
    webflowApiTokenEncrypted: prefer(
      row?.webflowApiTokenEncrypted,
      allowWebflowLegacy ? legacy?.webflowApiTokenEncrypted : null
    ),
    webflowSiteId: prefer(
      row?.webflowSiteId,
      allowWebflowLegacy ? legacy?.webflowSiteId : null
    ),
    webflowCollectionId: prefer(
      row?.webflowCollectionId,
      allowWebflowLegacy ? legacy?.webflowCollectionId : null
    ),
    webflowFieldMappingJson: prefer(
      row?.webflowFieldMappingJson,
      allowWebflowLegacy ? legacy?.webflowFieldMappingJson : null
    ),
    webflowDefaultCategoryItemId: row?.webflowDefaultCategoryItemId ?? null,
    webflowDefaultAuthorItemId: row?.webflowDefaultAuthorItemId ?? null,
    webflowReferencesSyncedAt: row?.webflowReferencesSyncedAt ?? null,
    defaultLanguage: row?.defaultLanguage ?? workspace.defaultLanguage,
  };
}

export function decryptWorkspaceSecret(
  encrypted: string | null | undefined
): string | null {
  return decryptAppSettingsSecret(encrypted);
}
