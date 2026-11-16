import { NextResponse } from "next/server";
import {
  enqueueGoogleSync,
  getGoogleSyncStatus,
  hasRunningGoogleSync,
  recoverStaleGoogleSyncs,
  startGoogleSync,
  type GoogleSyncMode,
} from "@/lib/google/sync";
import { requireAuth } from "@/lib/require-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  await recoverStaleGoogleSyncs();
  const status = await getGoogleSyncStatus();
  return NextResponse.json(status);
}

export async function POST(request: Request) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  await recoverStaleGoogleSyncs();
  if (await hasRunningGoogleSync()) {
    return NextResponse.json(
      { error: "Une synchronisation Google est déjà en cours." },
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
    const { runId } = await startGoogleSync(mode);
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
