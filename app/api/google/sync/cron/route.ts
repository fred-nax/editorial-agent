import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
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
 * Synchronise chaque espace disposant d’une propriété GSC (et/ou GA4 WP).
 */
export async function POST(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  await recoverStaleGoogleSyncs();

  const selections = await db.googlePropertySelection.findMany({
    where: {
      OR: [
        { gscPropertyUrl: { not: null } },
        { ga4PropertyId: { not: null } },
      ],
    },
    select: { workspaceId: true, gscPropertyUrl: true, ga4PropertyId: true },
  });

  const started: string[] = [];
  const skipped: Array<{ workspaceId: string; reason: string }> = [];

  for (const sel of selections) {
    if (await hasRunningGoogleSync(sel.workspaceId)) {
      skipped.push({ workspaceId: sel.workspaceId, reason: "already_running" });
      continue;
    }
    try {
      const { runId } = await startGoogleSync("daily", sel.workspaceId);
      enqueueGoogleSync(runId);
      started.push(runId);
    } catch (error) {
      skipped.push({
        workspaceId: sel.workspaceId,
        reason:
          error instanceof Error ? error.message : "Synchronisation impossible.",
      });
    }
  }

  return NextResponse.json(
    {
      ok: true,
      mode: "daily",
      started,
      skipped,
      workspacesConsidered: selections.length,
    },
    { status: started.length > 0 ? 202 : 200 }
  );
}
