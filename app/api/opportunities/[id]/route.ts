import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import { addOpportunityToTopicQueue } from "@/lib/seo/queue";
import {
  assertModuleAllowedForWorkspace,
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

function workspaceErrorResponse(error: WorkspaceContextError) {
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status: error.status }
  );
}

export async function GET(_request: Request, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  try {
    const workspace = await resolveActiveWorkspace();
    assertModuleAllowedForWorkspace(workspace, "opportunities");

    const { id } = await context.params;
    const opportunity = await db.seoOpportunity.findFirst({
      where: { id, ...workspaceWhere(workspace.id) },
    });
    if (!opportunity) {
      return NextResponse.json(
        { error: "Opportunité introuvable." },
        { status: 404 }
      );
    }
    return NextResponse.json({ opportunity });
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return workspaceErrorResponse(error);
    }
    throw error;
  }
}

export async function POST(request: Request, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  const { id } = await context.params;
  let action = "queue";
  try {
    const body = (await request.json()) as { action?: string };
    if (typeof body.action === "string") {
      action = body.action;
    }
  } catch {
    // default queue
  }

  try {
    const workspace = await resolveActiveWorkspace();
    assertModuleAllowedForWorkspace(workspace, "opportunities");

    // Appartenance à l’espace vérifiée avant toute mutation / mise en file.
    const existing = await db.seoOpportunity.findFirst({
      where: { id, ...workspaceWhere(workspace.id) },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Opportunité introuvable." },
        { status: 404 }
      );
    }

    if (action === "dismiss") {
      const result = await db.seoOpportunity.updateMany({
        where: { id, ...workspaceWhere(workspace.id) },
        data: { status: "dismissed" },
      });
      if (result.count === 0) {
        return NextResponse.json(
          { error: "Opportunité introuvable." },
          { status: 404 }
        );
      }
      const opportunity = await db.seoOpportunity.findFirst({
        where: { id, ...workspaceWhere(workspace.id) },
      });
      return NextResponse.json({ opportunity });
    }

    if (action !== "queue") {
      return NextResponse.json({ error: "Action non supportée." }, { status: 400 });
    }

    const result = await addOpportunityToTopicQueue(id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return workspaceErrorResponse(error);
    }
    const message =
      error instanceof Error ? error.message : "Impossible d’ajouter à la file.";
    const status = message.includes("introuvable") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
