import {
  assertModuleAllowedForWorkspace,
  assertRequestWorkspaceMatchesActive,
  resolveActiveWorkspace,
  type EditorialWorkspaceRecord,
} from "@/lib/workspace";

/**
 * Guard neutre Analytics / Search Console (V7.14.0).
 * WordPress et Webflow autorisés ; isolation via workspace actif.
 * Ancien nom conservé en alias pour non-régression des imports / tests.
 */
export async function requireGoogleAnalyticsWorkspace(
  request?: Request
): Promise<EditorialWorkspaceRecord> {
  const workspace = await resolveActiveWorkspace();
  if (request) {
    assertRequestWorkspaceMatchesActive(request, workspace);
  }
  assertModuleAllowedForWorkspace(workspace, "analytics");
  return workspace;
}

/** @deprecated Alias V7.11–V7.13 — utiliser requireGoogleAnalyticsWorkspace. */
export async function requireWordPressGoogleWorkspace(
  request?: Request
): Promise<EditorialWorkspaceRecord> {
  return requireGoogleAnalyticsWorkspace(request);
}
