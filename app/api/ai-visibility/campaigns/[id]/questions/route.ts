import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import { generateCampaignQuestions } from "@/lib/ai-visibility/campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(_request: Request, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  const { id } = await context.params;
  try {
    const questions = await generateCampaignQuestions(id);
    return NextResponse.json({ questions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Génération impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  const { id } = await context.params;
  const campaign = await db.visibilityCampaign.findUnique({ where: { id } });
  if (!campaign) {
    return NextResponse.json({ error: "Campagne introuvable." }, { status: 404 });
  }
  if (campaign.status === "running") {
    return NextResponse.json(
      { error: "Impossible de modifier les questions pendant l’exécution." },
      { status: 409 }
    );
  }

  let body: { questions?: Array<{ id?: string; text: string; intent?: string }> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  if (!Array.isArray(body.questions) || body.questions.length === 0) {
    return NextResponse.json(
      { error: "Liste de questions invalide." },
      { status: 400 }
    );
  }

  await db.visibilityQuestion.deleteMany({ where: { campaignId: id } });
  await db.visibilityQuestion.createMany({
    data: body.questions.slice(0, 20).map((item, index) => ({
      campaignId: id,
      text: item.text.trim().slice(0, 400),
      intent: item.intent?.slice(0, 40) ?? "information",
      sortOrder: index,
      validated: true,
    })),
  });

  await db.visibilityCampaign.update({
    where: { id },
    data: {
      status: "questions_ready",
      questionCount: Math.min(20, body.questions.length),
    },
  });

  const questions = await db.visibilityQuestion.findMany({
    where: { campaignId: id },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({ questions });
}
