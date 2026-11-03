import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import {
  enqueueWordPressInventorySync,
  getWordPressInventoryDiagnostic,
} from "@/lib/seo/wordpress-inventory";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  const diagnostic = await getWordPressInventoryDiagnostic();

  return NextResponse.json({
    count: diagnostic.count,
    byStatus: diagnostic.byStatus,
    lastSync: diagnostic.lastSync,
    running: diagnostic.running,
    diagnostic: {
      expectedTotal: diagnostic.lastSync?.expectedTotal ?? null,
      fetchedCount: diagnostic.lastSync?.fetchedCount ?? null,
      upsertedCount: diagnostic.lastSync?.upsertedCount ?? null,
      storedCount:
        diagnostic.lastSync?.storedCount ?? diagnostic.count,
      pagesFetched: diagnostic.lastSync?.pagesFetched ?? null,
      totalPages: diagnostic.lastSync?.totalPages ?? null,
      statusBreakdown:
        diagnostic.lastSync?.statusBreakdown ?? diagnostic.byStatus,
      note: diagnostic.lastSync?.diagnosticNote ?? null,
      lastError: diagnostic.lastSync?.error ?? null,
      lastStatus: diagnostic.lastSync?.status ?? null,
      lastFinishedAt: diagnostic.lastSync?.finishedAt ?? null,
    },
  });
}

export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  const existing = await db.wordPressSyncRun.findFirst({
    where: { status: "running" },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Une synchronisation est déjà en cours.", run: existing },
      { status: 409 }
    );
  }

  let mode: "full" | "incremental" = "incremental";
  try {
    const body = (await request.json()) as { mode?: string };
    if (body.mode === "full") {
      mode = "full";
    }
  } catch {
    // body optional
  }

  const run = await db.wordPressSyncRun.create({
    data: {
      status: "running",
      mode,
    },
  });

  enqueueWordPressInventorySync(run.id, mode);

  return NextResponse.json({ run }, { status: 202 });
}
