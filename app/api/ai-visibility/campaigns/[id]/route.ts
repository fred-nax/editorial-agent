import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deleteVisibilityCampaign } from "@/lib/ai-visibility/delete-campaign";
import { logError } from "@/lib/logger";
import { requireAuth } from "@/lib/require-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(_request: Request, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  const { id } = await context.params;
  const campaign = await db.visibilityCampaign.findUnique({
    where: { id },
    include: {
      brand: true,
      questions: { orderBy: { sortOrder: "asc" } },
      responses: {
        orderBy: [{ questionId: "asc" }, { repetitionIndex: "asc" }],
        include: {
          mentions: { include: { entity: true } },
        },
      },
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campagne introuvable." }, { status: 404 });
  }

  const citations = await db.visibilityCitation.findMany({
    where: { responseId: { in: campaign.responses.map((item) => item.id) } },
  });

  return NextResponse.json({ campaign, citations });
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    if (!(await requireAuth())) {
      return unauthorized();
    }

    const { id } = await context.params;
    const result = await deleteVisibilityCampaign(id);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      brandId: result.brandId,
      subject: result.subject,
    });
  } catch (error) {
    logError("ai-visibility", "DELETE campaign failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "Impossible de supprimer la campagne." },
      { status: 500 }
    );
  }
}
