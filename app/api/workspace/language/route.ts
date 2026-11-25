import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import {
  assertLanguageCode,
  assertRequestWorkspaceMatchesActive,
  resolveActiveWorkspace,
  WorkspaceContextError,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function workspaceErrorResponse(error: unknown) {
  if (error instanceof WorkspaceContextError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }
  const message =
    error instanceof Error ? error.message : "Erreur langue d’espace.";
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Lit la langue éditoriale de l’espace actif. */
export async function GET() {
  if (!(await requireAuth())) {
    return unauthorized();
  }
  try {
    const workspace = await resolveActiveWorkspace();
    return NextResponse.json({
      workspaceId: workspace.id,
      cmsProvider: workspace.cmsProvider,
      defaultLanguage: workspace.defaultLanguage,
    });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}

/**
 * Met à jour la langue éditoriale de l’espace actif (EditorialWorkspace +
 * WorkspaceCmsSettings). N’affecte pas les autres espaces ni les agents.
 */
export async function PATCH(request: Request) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  try {
    const workspace = await resolveActiveWorkspace();
    assertRequestWorkspaceMatchesActive(request, workspace);

    const body = (await request.json()) as { defaultLanguage?: unknown };
    const language = assertLanguageCode(body.defaultLanguage);

    const [updated] = await db.$transaction([
      db.editorialWorkspace.update({
        where: { id: workspace.id },
        data: { defaultLanguage: language },
      }),
      db.workspaceCmsSettings.updateMany({
        where: { workspaceId: workspace.id },
        data: { defaultLanguage: language },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      workspaceId: updated.id,
      cmsProvider: updated.cmsProvider,
      defaultLanguage: updated.defaultLanguage,
      active: {
        id: updated.id,
        slug: updated.slug,
        name: updated.name,
        cmsProvider: updated.cmsProvider,
        siteUrl: updated.siteUrl,
        siteLabel: updated.siteLabel,
        defaultLanguage: updated.defaultLanguage,
        enabled: updated.enabled,
      },
    });
  } catch (error) {
    if (error instanceof Error && !(error instanceof WorkspaceContextError)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return workspaceErrorResponse(error);
  }
}
