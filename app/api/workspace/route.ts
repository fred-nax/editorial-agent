import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import {
  buildWorkspaceCookieOptions,
  listEnabledWorkspaces,
  requireWorkspace,
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
    error instanceof Error ? error.message : "Erreur espace éditorial.";
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Liste les espaces + espace actif (cookie validé serveur). */
export async function GET() {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  try {
    const [workspaces, active] = await Promise.all([
      listEnabledWorkspaces(),
      resolveActiveWorkspace(),
    ]);
    return NextResponse.json({
      workspaces,
      activeWorkspaceId: active.id,
      active,
    });
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}

/** Mémorise l’espace actif dans un cookie httpOnly sécurisé. */
export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  try {
    const body = (await request.json()) as { workspaceId?: unknown };
    const raw =
      typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    if (!raw) {
      return NextResponse.json(
        { error: "workspaceId obligatoire." },
        { status: 400 }
      );
    }

    const workspace = await requireWorkspace(raw);
    const cookie = buildWorkspaceCookieOptions(workspace.id);
    const response = NextResponse.json({
      ok: true,
      activeWorkspaceId: workspace.id,
      active: workspace,
    });
    response.cookies.set(cookie);
    return response;
  } catch (error) {
    return workspaceErrorResponse(error);
  }
}
