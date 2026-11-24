import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import {
  enqueueWordPressInventorySync,
  getWordPressInventoryDiagnostic,
} from "@/lib/seo/wordpress-inventory";
import { db } from "@/lib/db";
import {
  assertWordPressOnlyModule,
  resolveActiveWorkspace,
  WorkspaceContextError,
  workspaceWhere,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function workspaceErrorResponse(error: WorkspaceContextError) {
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status: error.status }
  );
}

async function resolveWordPressWorkspace() {
  const workspace = await resolveActiveWorkspace();
  assertWordPressOnlyModule(workspace.cmsProvider);
  return workspace;
}

export async function GET() {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  let workspace: Awaited<ReturnType<typeof resolveWordPressWorkspace>>;
  try {
    workspace = await resolveWordPressWorkspace();
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return workspaceErrorResponse(error);
    }
    throw error;
  }

  const diagnostic = await getWordPressInventoryDiagnostic(workspace.id);

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

  let workspace: Awaited<ReturnType<typeof resolveWordPressWorkspace>>;
  try {
    workspace = await resolveWordPressWorkspace();
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return workspaceErrorResponse(error);
    }
    throw error;
  }

  const existing = await db.wordPressSyncRun.findFirst({
    where: { ...workspaceWhere(workspace.id), status: "running" },
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
      workspaceId: workspace.id,
      status: "running",
      mode,
    },
  });

  enqueueWordPressInventorySync(run.id, mode);

  return NextResponse.json({ run }, { status: 202 });
}
