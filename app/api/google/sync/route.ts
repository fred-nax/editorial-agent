import { NextResponse } from "next/server";
import { requireGoogleAnalyticsWorkspace } from "@/lib/google/workspace-guard";
import {
  enqueueGoogleSync,
  getGoogleSyncStatus,
  hasRunningGoogleSync,
  recoverStaleGoogleSyncs,
  startGoogleSync,
  type GoogleSyncMode,
} from "@/lib/google/sync";
import { requireAuth } from "@/lib/require-auth";
import { WorkspaceContextError } from "@/lib/workspace";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  let workspace;
  try {
    workspace = await requireGoogleAnalyticsWorkspace(request);
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    throw error;
  }
  await recoverStaleGoogleSyncs(undefined, workspace.id);
  const status = await getGoogleSyncStatus(workspace.id);
  return NextResponse.json(status);
}

export async function POST(request: Request) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  let workspace;
  try {
    workspace = await requireGoogleAnalyticsWorkspace(request);
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    throw error;
  }

  await recoverStaleGoogleSyncs(undefined, workspace.id);
  if (await hasRunningGoogleSync(workspace.id)) {
    return NextResponse.json(
      { error: "Une synchronisation Google est déjà en cours pour cet espace." },
      { status: 409 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    mode?: GoogleSyncMode;
  };
  const mode: GoogleSyncMode =
    body.mode === "initial" || body.mode === "daily" || body.mode === "manual"
      ? body.mode
      : "manual";

  try {
    const { runId } = await startGoogleSync(mode, workspace.id);
    enqueueGoogleSync(runId);
    return NextResponse.json({ runId, status: "running" }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Synchronisation impossible.",
      },
      { status: 400 }
    );
  }
}
