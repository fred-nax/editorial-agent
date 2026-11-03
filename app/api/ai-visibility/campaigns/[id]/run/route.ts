import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import { enqueueVisibilityCampaign } from "@/lib/ai-visibility/campaigns";

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
  const campaign = await db.visibilityCampaign.findUnique({
    where: { id },
    include: { questions: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Campagne introuvable." }, { status: 404 });
  }
  if (campaign.status === "running") {
    return NextResponse.json(
      { error: "Campagne déjà en cours.", campaign },
      { status: 409 }
    );
  }
  if (campaign.questions.length === 0) {
    return NextResponse.json(
      { error: "Validez d’abord les questions." },
      { status: 400 }
    );
  }

  const otherRunning = await db.visibilityCampaign.findFirst({
    where: { status: "running" },
  });
  if (otherRunning) {
    return NextResponse.json(
      { error: "Une campagne GEO est déjà en cours." },
      { status: 409 }
    );
  }

  enqueueVisibilityCampaign(id);

  const updated = await db.visibilityCampaign.findUnique({ where: { id } });
  return NextResponse.json({ campaign: updated }, { status: 202 });
}
