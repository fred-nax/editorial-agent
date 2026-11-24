import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import { validateResearchConfiguration } from "@/lib/seo/research-config";
import { listActiveEditorialDomains } from "@/lib/seo/theme-catalog";
import type { ResearchGoal, ResearchMode } from "@prisma/client";
import {
  resolveActiveWorkspace,
  WorkspaceContextError,
  workspaceWhere,
  type EditorialWorkspaceRecord,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

type WorkspaceResolution =
  | { ok: true; workspace: EditorialWorkspaceRecord }
  | { ok: false; response: NextResponse };

async function getWorkspaceOrResponse(): Promise<WorkspaceResolution> {
  try {
    return { ok: true, workspace: await resolveActiveWorkspace() };
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.status }
        ),
      };
    }
    throw error;
  }
}

export async function GET(_request: Request, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  const resolved = await getWorkspaceOrResponse();
  if (!resolved.ok) {
    return resolved.response;
  }
  const { workspace } = resolved;

  const { id } = await context.params;
  const config = await db.researchConfig.findFirst({
    where: { id, ...workspaceWhere(workspace.id) },
    include: { customTheme: true },
  });
  if (!config) {
    return NextResponse.json({ error: "Configuration introuvable." }, { status: 404 });
  }
  return NextResponse.json({ config });
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  const resolved = await getWorkspaceOrResponse();
  if (!resolved.ok) {
    return resolved.response;
  }
  const { workspace } = resolved;

  const { id } = await context.params;
  const existing = await db.researchConfig.findFirst({
    where: { id, ...workspaceWhere(workspace.id) },
  });
  if (!existing) {
    return NextResponse.json({ error: "Configuration introuvable." }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const name =
    typeof body.name === "string"
      ? body.name.trim().slice(0, 120)
      : existing.name;
  if (!name) {
    return NextResponse.json({ error: "Nom invalide." }, { status: 400 });
  }

  const catalog = await listActiveEditorialDomains(workspace.id);
  const validated = validateResearchConfiguration(
    {
      ...body,
      mode: body.mode ?? existing.mode,
      researchGoal: body.researchGoal ?? existing.researchGoal,
      requestedCount: body.requestedCount ?? existing.requestedCount,
      customTopic: body.customTopic ?? existing.customTopic,
      researchInstructions:
        body.researchInstructions ?? existing.researchInstructions,
      domains: body.domains ?? existing.domains,
    },
    { catalog: catalog.length > 0 ? catalog : undefined }
  );
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  if (validated.value.customThemeId) {
    const theme = await db.customTheme.findFirst({
      where: {
        id: validated.value.customThemeId,
        ...workspaceWhere(workspace.id),
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

  const config = await db.researchConfig.update({
    where: { id },
    data: {
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

  return NextResponse.json({ config });
}

export async function DELETE(_request: Request, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  const resolved = await getWorkspaceOrResponse();
  if (!resolved.ok) {
    return resolved.response;
  }
  const { workspace } = resolved;

  const { id } = await context.params;
  const existing = await db.researchConfig.findFirst({
    where: { id, ...workspaceWhere(workspace.id) },
  });
  if (!existing) {
    return NextResponse.json({ error: "Configuration introuvable." }, { status: 404 });
  }

  // Détache les runs (SetNull) puis supprime la config — historique conservé.
  await db.opportunitySearchRun.updateMany({
    where: { configId: id, ...workspaceWhere(workspace.id) },
    data: { configId: null },
  });
  await db.researchConfig.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
