import { WorkspaceContextError } from "./errors";
import type { WorkspaceCmsProvider } from "./constants";

export function assertSameWorkspace(
  expectedWorkspaceId: string,
  actualWorkspaceId: string | null | undefined,
  entityLabel = "ressource"
): void {
  if (!actualWorkspaceId || actualWorkspaceId !== expectedWorkspaceId) {
    throw new WorkspaceContextError(
      "WORKSPACE_MISMATCH",
      `${entityLabel} introuvable dans cet espace éditorial.`,
      404
    );
  }
}

export function assertWorkspaceCmsProvider(
  workspaceProvider: string,
  expected: WorkspaceCmsProvider
): void {
  if (workspaceProvider !== expected) {
    throw new WorkspaceContextError(
      "WORKSPACE_CMS_MISMATCH",
      `Cette opération est réservée à l’espace ${expected} (espace actif : ${workspaceProvider}).`,
      403
    );
  }
}

/**
 * Cohérence génération : workspace.cmsProvider ↔ cmsDestination.
 * Aucun fallback silencieux.
 */
export function assertGenerationWorkspaceConsistency(input: {
  workspaceCmsProvider: string;
  cmsDestination: string | null | undefined;
}): void {
  const destination = (input.cmsDestination ?? "wordpress").trim().toLowerCase();
  if (input.workspaceCmsProvider === "wordpress" && destination !== "wordpress") {
    throw new WorkspaceContextError(
      "WORKSPACE_CMS_MISMATCH",
      `Incohérence : espace WordPress mais destination CMS « ${destination} ».`,
      400
    );
  }
  if (input.workspaceCmsProvider === "webflow" && destination !== "webflow") {
    throw new WorkspaceContextError(
      "WORKSPACE_CMS_MISMATCH",
      `Incohérence : espace Webflow mais destination CMS « ${destination} ».`,
      400
    );
  }
}

/** Modules WP-only refusés dans un espace Webflow (pas de compensation de données). */
export function assertWordPressOnlyModule(workspaceCmsProvider: string): void {
  assertWorkspaceCmsProvider(workspaceCmsProvider, "wordpress");
}

/** Modules Webflow-only refusés dans un espace WordPress. */
export function assertWebflowOnlyModule(workspaceCmsProvider: string): void {
  assertWorkspaceCmsProvider(workspaceCmsProvider, "webflow");
}
