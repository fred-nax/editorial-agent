import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import {
  previewSeoSearchReset,
  resetSeoSearches,
} from "@/lib/seo/reset-searches";
import {
  assertModuleAllowedForWorkspace,
  assertRequestWorkspaceMatchesActive,
  resolveActiveWorkspace,
  WorkspaceContextError,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function workspaceErrorResponse(error: WorkspaceContextError) {
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status: error.status }
  );
}

async function resolveResetWorkspace(request: Request) {
  const workspace = await resolveActiveWorkspace();
  assertModuleAllowedForWorkspace(workspace, "opportunities");
  assertRequestWorkspaceMatchesActive(request, workspace);
  return workspace;
}

/** Aperçu des volumes concernés (aucune suppression). */
export async function GET(request: Request) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  try {
    const workspace = await resolveResetWorkspace(request);
    const preview = await previewSeoSearchReset(workspace.id);
    return NextResponse.json({ preview });
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return workspaceErrorResponse(error);
    }
    const message =
      error instanceof Error
        ? error.message.slice(0, 300)
        : "Impossible de préparer la réinitialisation.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Réinitialise les recherches SEO (opportunités + runs) de l’espace actif.
 * Corps attendu : { confirm: true }
 */
export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  let workspace;
  try {
    workspace = await resolveResetWorkspace(request);
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return workspaceErrorResponse(error);
    }
    throw error;
  }

  let confirm = false;
  try {
    const body = (await request.json()) as { confirm?: unknown };
    confirm = body.confirm === true;
  } catch {
    confirm = false;
  }

  if (!confirm) {
    return NextResponse.json(
      {
        error:
          "Confirmation requise. Envoyez { \"confirm\": true } pour réinitialiser.",
      },
      { status: 400 }
    );
  }

  try {
    const preview = await previewSeoSearchReset(workspace.id);
    if (!preview.canReset) {
      return NextResponse.json(
        { error: preview.blockReason ?? "Réinitialisation refusée." },
        { status: 409 }
      );
    }

    const result = await resetSeoSearches(workspace.id);
    return NextResponse.json({ ok: true, result, preview });
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return workspaceErrorResponse(error);
    }
    const message =
      error instanceof Error
        ? error.message.slice(0, 300)
        : "Réinitialisation impossible.";
    const status = message.includes("encore en cours") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
