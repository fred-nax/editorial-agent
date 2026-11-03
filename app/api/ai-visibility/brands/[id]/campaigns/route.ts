import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import {
  ALLOWED_QUESTION_COUNTS,
  ALLOWED_REPETITIONS,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  assertCampaignLimits,
} from "@/lib/ai-visibility/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: Request, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  const { id: brandId } = await context.params;
  const brand = await db.visibilityBrand.findUnique({ where: { id: brandId } });
  if (!brand) {
    return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const subject =
    typeof body.subject === "string" ? body.subject.trim().slice(0, 300) : "";
  if (!subject) {
    return NextResponse.json(
      { error: "Le sujet principal est obligatoire." },
      { status: 400 }
    );
  }

  const questionCount = Number(body.questionCount ?? 10);
  const repetitions = Number(body.repetitions ?? 1);
  const limits = assertCampaignLimits({ questionCount, repetitions });
  if (!limits.ok) {
    return NextResponse.json({ error: limits.error }, { status: 400 });
  }

  if (
    !ALLOWED_QUESTION_COUNTS.includes(
      questionCount as (typeof ALLOWED_QUESTION_COUNTS)[number]
    ) ||
    !ALLOWED_REPETITIONS.includes(
      repetitions as (typeof ALLOWED_REPETITIONS)[number]
    )
  ) {
    return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  }

  const campaign = await db.visibilityCampaign.create({
    data: {
      brandId,
      subject,
      country:
        typeof body.country === "string" && body.country.trim()
          ? body.country.trim().slice(0, 8)
          : brand.country,
      language:
        typeof body.language === "string" && body.language.trim()
          ? body.language.trim().slice(0, 8)
          : brand.language,
      questionCount,
      repetitions,
      provider: DEFAULT_PROVIDER,
      model:
        typeof body.model === "string" && body.model.trim()
          ? body.model.trim().slice(0, 80)
          : DEFAULT_MODEL,
      instructions:
        typeof body.instructions === "string"
          ? body.instructions.trim().slice(0, 2000) || null
          : null,
      estimatedCalls: limits.calls,
      status: "pending",
    },
  });

  return NextResponse.json(
    {
      campaign,
      estimatedCalls: limits.calls,
      warning:
        "Le pays demandé est un paramètre de prompt ; le fournisseur ne garantit pas une géolocalisation réelle.",
    },
    { status: 201 }
  );
}
