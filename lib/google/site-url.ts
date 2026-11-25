/**
 * URL publique de référence pour valider une propriété GSC par espace.
 */

import { resolveWordPressConfig } from "@/lib/settings/app-settings";
import {
  getWorkspaceByIdOrSlug,
  loadWorkspaceCmsSettings,
} from "@/lib/workspace";

export async function resolveWorkspacePublicSiteUrl(
  workspaceId: string
): Promise<string | null> {
  const workspace = await getWorkspaceByIdOrSlug(workspaceId);
  if (!workspace) {
    return null;
  }

  try {
    const settings = await loadWorkspaceCmsSettings(workspace);
    const fromSettings = settings.gscPublicSiteUrl?.trim();
    if (fromSettings) {
      return fromSettings.replace(/\/$/, "");
    }
  } catch {
    // settings absents
  }

  const fromWorkspace = workspace.siteUrl?.trim();
  if (fromWorkspace) {
    return fromWorkspace.replace(/\/$/, "");
  }

  if (workspace.cmsProvider === "wordpress") {
    const wp = await resolveWordPressConfig();
    if (wp?.url) {
      return wp.url.replace(/\/$/, "");
    }
    const envWp = process.env.WP_URL?.trim();
    if (envWp) {
      return envWp.replace(/\/$/, "");
    }
  }

  return null;
}
