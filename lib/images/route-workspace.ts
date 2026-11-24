import { NextResponse } from "next/server";
import {
  assertModuleAllowedForWorkspace,
  assertWordPressOnlyModule,
  resolveActiveWorkspace,
  WorkspaceContextError,
  type EditorialWorkspaceRecord,
} from "@/lib/workspace";

/**
 * Espace actif pour les routes image à la une : WordPress uniquement.
 * Lève WorkspaceContextError (à convertir via workspaceContextErrorResponse).
 */
export async function resolveFeaturedImageWorkspace(): Promise<EditorialWorkspaceRecord> {
  const workspace = await resolveActiveWorkspace();
  assertModuleAllowedForWorkspace(workspace, "featured_image");
  assertWordPressOnlyModule(workspace.cmsProvider);
  return workspace;
}

export function workspaceContextErrorResponse(error: WorkspaceContextError) {
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status: error.status }
  );
}
