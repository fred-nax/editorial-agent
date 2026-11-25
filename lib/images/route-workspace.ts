import { NextResponse } from "next/server";
import {
  assertModuleAllowedForWorkspace,
  resolveActiveWorkspace,
  WorkspaceContextError,
  type EditorialWorkspaceRecord,
} from "@/lib/workspace";

/**
 * Espace actif pour les routes image à la une (WordPress ou Webflow).
 * Lève WorkspaceContextError (à convertir via workspaceContextErrorResponse).
 */
export async function resolveFeaturedImageWorkspace(): Promise<EditorialWorkspaceRecord> {
  const workspace = await resolveActiveWorkspace();
  assertModuleAllowedForWorkspace(workspace, "featured_image");
  return workspace;
}

export function workspaceContextErrorResponse(error: WorkspaceContextError) {
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status: error.status }
  );
}
