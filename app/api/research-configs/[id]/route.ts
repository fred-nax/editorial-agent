import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import { validateResearchConfiguration } from "@/lib/seo/research-config";
import type { ResearchGoal, ResearchMode } from "@prisma/client";

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

  const { id } = await context.params;
  const config = await db.researchConfig.findUnique({
    where: { id },
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

  const { id } = await context.params;
  const existing = await db.researchConfig.findUnique({ where: { id } });
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

  const validated = validateResearchConfiguration({
    ...body,
    mode: body.mode ?? existing.mode,
    researchGoal: body.researchGoal ?? existing.researchGoal,
    requestedCount: body.requestedCount ?? existing.requestedCount,
    customTopic: body.customTopic ?? existing.customTopic,
    researchInstructions:
      body.researchInstructions ?? existing.researchInstructions,
    domains: body.domains ?? existing.domains,
  });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
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

  const { id } = await context.params;
  const existing = await db.researchConfig.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Configuration introuvable." }, { status: 404 });
  }

  // Détache les runs (SetNull) puis supprime la config — historique conservé.
  await db.opportunitySearchRun.updateMany({
    where: { configId: id },
    data: { configId: null },
  });
  await db.researchConfig.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
