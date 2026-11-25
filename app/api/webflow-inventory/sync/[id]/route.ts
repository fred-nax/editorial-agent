import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import {
  assertModuleAllowedForWorkspace,
  assertWebflowOnlyModule,
  resolveActiveWorkspace,
  WorkspaceContextError,
  workspaceWhere,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(_request: Request, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  let workspace;
  try {
    workspace = await resolveActiveWorkspace();
    assertWebflowOnlyModule(workspace.cmsProvider);
    assertModuleAllowedForWorkspace(workspace, "inventory");
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    throw error;
  }

  const { id } = await context.params;
  const run = await db.webflowSyncRun.findFirst({
    where: { id, ...workspaceWhere(workspace.id) },
  });
  if (!run) {
    return NextResponse.json(
      { error: "Synchronisation introuvable dans cet espace." },
      { status: 404 }
    );
  }

  return NextResponse.json({ run });
}
