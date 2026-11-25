import {
  assertModuleAllowedForWorkspace,
  resolveActiveWorkspace,
  type EditorialWorkspaceRecord,
} from "@/lib/workspace";

/**
 * Google Analytics / GSC restent rattachés à l’espace WordPress (Phase A).
 * Empêche une requête depuis Webflow de lire ou muter la sélection WP.
 */
export async function requireWordPressGoogleWorkspace(): Promise<EditorialWorkspaceRecord> {
  const workspace = await resolveActiveWorkspace();
  assertModuleAllowedForWorkspace(workspace, "analytics");
  return workspace;
}
