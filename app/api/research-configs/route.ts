import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import { validateResearchConfiguration } from "@/lib/seo/research-config";
import { listActiveEditorialDomains } from "@/lib/seo/theme-catalog";
import {
  resolveActiveWorkspace,
  WorkspaceContextError,
  workspaceWhere,
} from "@/lib/workspace";
import type { ResearchGoal, ResearchMode } from "@prisma/client";

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

export async function GET() {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  try {
    const workspace = await resolveActiveWorkspace();
    const configs = await db.researchConfig.findMany({
      where: workspaceWhere(workspace.id),
      orderBy: { updatedAt: "desc" },
      include: { customTheme: true },
    });
    return NextResponse.json({ configs });
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return workspaceErrorResponse(error);
    }
    throw error;
  }
}

export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const name =
    typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!name) {
    return NextResponse.json(
      { error: "Le nom de la configuration est obligatoire." },
      { status: 400 }
    );
  }

  let workspaceId: string;
  try {
    workspaceId = (await resolveActiveWorkspace()).id;
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return workspaceErrorResponse(error);
    }
    throw error;
  }

  const catalog = await listActiveEditorialDomains(workspaceId);
  const validated = validateResearchConfiguration(body, {
    catalog: catalog.length > 0 ? catalog : undefined,
  });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  if (validated.value.customThemeId) {
    const theme = await db.customTheme.findFirst({
      where: {
        id: validated.value.customThemeId,
        ...workspaceWhere(workspaceId),
      },
      select: { id: true },
    });
    if (!theme) {
      return NextResponse.json(
        { error: "Thématique introuvable." },
        { status: 404 }
      );
    }
  }

  const config = await db.researchConfig.create({
    data: {
      workspaceId,
      name,
      mode: validated.value.mode as ResearchMode,
      researchGoal: validated.value.researchGoal as ResearchGoal,
      domains: validated.value.domainSelections,
      customTopic: validated.value.customTopic,
      researchInstructions: validated.value.researchInstructions,
      requestedCount: validated.value.requestedCount,
      customThemeId: validated.value.customThemeId,
    },
  });

  return NextResponse.json({ config }, { status: 201 });
}
