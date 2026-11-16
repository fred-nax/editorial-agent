import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import {
  enqueueGoogleSync,
  hasRunningGoogleSync,
  recoverStaleGoogleSyncs,
  startGoogleSync,
} from "@/lib/google/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorizeCron(request: Request): boolean {
  const expected = process.env.GOOGLE_SYNC_CRON_SECRET?.trim();
  if (!expected) {
    return false;
  }
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const provided = match?.[1]?.trim() ?? "";
  if (!provided) {
    return false;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Endpoint cron VPS sécurisé (Bearer GOOGLE_SYNC_CRON_SECRET).
 * Exemple : 0 5 * * * curl -X POST -H "Authorization: Bearer …" https://…/api/google/sync/cron
 */
export async function POST(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  await recoverStaleGoogleSyncs();
  if (await hasRunningGoogleSync()) {
    return NextResponse.json(
      { ok: true, skipped: true, reason: "already_running" },
      { status: 200 }
    );
  }

  try {
    const { runId } = await startGoogleSync("daily");
    enqueueGoogleSync(runId);
    return NextResponse.json({ ok: true, runId, mode: "daily" }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Synchronisation impossible.",
      },
      { status: 400 }
    );
  }
}
