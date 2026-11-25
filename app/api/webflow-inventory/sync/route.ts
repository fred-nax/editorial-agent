import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import {
  enqueueWebflowInventorySync,
  getWebflowInventoryDiagnostic,
  recoverStaleWebflowSyncRuns,
} from "@/lib/webflow/inventory";
import { resolveWebflowInventoryConfig } from "@/lib/webflow/inventory-config";
import {
  assertModuleAllowedForWorkspace,
  assertWebflowOnlyModule,
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

async function resolveWebflowWorkspace() {
  const workspace = await resolveActiveWorkspace();
  assertWebflowOnlyModule(workspace.cmsProvider);
  assertModuleAllowedForWorkspace(workspace, "inventory");
  return workspace;
}

export async function GET() {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  let workspace: Awaited<ReturnType<typeof resolveWebflowWorkspace>>;
  try {
    workspace = await resolveWebflowWorkspace();
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return workspaceErrorResponse(error);
    }
    throw error;
  }

  await recoverStaleWebflowSyncRuns(workspace.id);
  const diagnostic = await getWebflowInventoryDiagnostic(workspace.id);

  return NextResponse.json({
    count: diagnostic.count,
    byStatus: diagnostic.byStatus,
    lastSync: diagnostic.lastSync,
    running: diagnostic.running,
    diagnostic: {
      expectedTotal: diagnostic.lastSync?.expectedTotal ?? null,
      fetchedCount: diagnostic.lastSync?.fetchedCount ?? null,
      upsertedCount: diagnostic.lastSync?.upsertedCount ?? null,
      createdCount: diagnostic.lastSync?.createdCount ?? null,
      updatedCount: diagnostic.lastSync?.updatedCount ?? null,
      unchangedCount: diagnostic.lastSync?.unchangedCount ?? null,
      missingCount: diagnostic.lastSync?.missingCount ?? null,
      storedCount: diagnostic.lastSync?.storedCount ?? diagnostic.count,
      pagesFetched: diagnostic.lastSync?.pagesFetched ?? null,
      totalPages: diagnostic.lastSync?.totalPages ?? null,
      liveFetchedCount: diagnostic.lastSync?.liveFetchedCount ?? null,
      statusBreakdown:
        diagnostic.lastSync?.statusBreakdown ?? diagnostic.byStatus,
      note: diagnostic.lastSync?.diagnosticNote ?? null,
      lastError: diagnostic.lastSync?.error ?? null,
      lastStatus: diagnostic.lastSync?.status ?? null,
      lastFinishedAt: diagnostic.lastSync?.finishedAt ?? null,
      siteId: diagnostic.lastSync?.siteId ?? null,
      collectionId: diagnostic.lastSync?.collectionId ?? null,
    },
  });
}

export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  let workspace: Awaited<ReturnType<typeof resolveWebflowWorkspace>>;
  try {
    workspace = await resolveWebflowWorkspace();
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return workspaceErrorResponse(error);
    }
    throw error;
  }

  await recoverStaleWebflowSyncRuns(workspace.id);

  const existing = await db.webflowSyncRun.findFirst({
    where: { ...workspaceWhere(workspace.id), status: "running" },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Une synchronisation Webflow est déjà en cours.", run: existing },
      { status: 409 }
    );
  }

  let mode: "full" | "incremental" = "full";
  try {
    const body = (await request.json()) as { mode?: string };
    if (body.mode === "incremental") {
      mode = "incremental";
    }
  } catch {
    // body optional — défaut full (pas de curseur modified_after côté Webflow)
  }

  // Valide la config avant de créer le run (évite runs failed inutiles).
  try {
    await resolveWebflowInventoryConfig(workspace);
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return workspaceErrorResponse(error);
    }
    throw error;
  }

  const run = await db.webflowSyncRun.create({
    data: {
      workspaceId: workspace.id,
      status: "running",
      mode,
    },
  });

  enqueueWebflowInventorySync(run.id);

  return NextResponse.json({ run }, { status: 202 });
}
