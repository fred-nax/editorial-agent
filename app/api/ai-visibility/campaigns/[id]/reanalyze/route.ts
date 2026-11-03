import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import { reanalyzeVisibilityCampaign } from "@/lib/ai-visibility/reanalyze";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * POST — réanalyse locale des réponses stockées (GEO 1.1).
 * Body optionnel :
 *   { allowLlmExtraction?: boolean, confirmLlmCost?: boolean }
 * Sans confirmation LLM → heuristique locale uniquement (0 recherche web).
 */
export async function POST(request: Request, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  const { id } = await context.params;
  const campaign = await db.visibilityCampaign.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Campagne introuvable." }, { status: 404 });
  }
  if (campaign.status === "running") {
    return NextResponse.json(
      { error: "Campagne en cours — réanalyse impossible." },
      { status: 409 }
    );
  }

  let body: {
    mode?: "reclassify" | "reextract";
    allowLlmExtraction?: boolean;
    confirmLlmCost?: boolean;
  } = {};
  try {
    const text = await request.text();
    if (text.trim()) {
      body = JSON.parse(text) as typeof body;
    }
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  if (body.allowLlmExtraction && !body.confirmLlmCost) {
    return NextResponse.json(
      {
        error:
          "L’extraction LLM a un coût distinct d’une nouvelle campagne. Renvoyez confirmLlmCost=true pour confirmer, ou omettez allowLlmExtraction pour une réanalyse locale gratuite (mode reclassify).",
        requiresConfirmation: true,
        costType: "llm_extraction",
        estimatedNote:
          "Réextraction LLM = 1 appel modèle par réponse completed (pas de recherche web).",
      },
      { status: 402 }
    );
  }

  try {
    const result = await reanalyzeVisibilityCampaign(id, {
      mode: body.mode === "reextract" ? "reextract" : "reclassify",
      allowLlmExtraction: body.allowLlmExtraction === true,
      confirmLlmCost: body.confirmLlmCost === true,
    });

    const updated = await db.visibilityCampaign.findUnique({
      where: { id },
      include: {
        brand: true,
        questions: { orderBy: { sortOrder: "asc" } },
        responses: {
          orderBy: [{ questionId: "asc" }, { repetitionIndex: "asc" }],
          include: { mentions: { include: { entity: true } } },
        },
      },
    });

    return NextResponse.json({
      result,
      campaign: updated,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur de réanalyse.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
