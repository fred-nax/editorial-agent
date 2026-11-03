import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import { isEntityCategory } from "@/lib/ai-visibility/constants";
import { updateEntityManualCorrection } from "@/lib/ai-visibility/entity-store";
import { parseAliasList } from "@/lib/ai-visibility/entities";

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
  const entity = await db.visibilityEntity.findUnique({
    where: { id },
    include: {
      parentEntity: true,
      childEntities: true,
      mentions: {
        include: {
          response: {
            include: {
              question: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      },
    },
  });

  if (!entity) {
    return NextResponse.json({ error: "Entité introuvable." }, { status: 404 });
  }

  const citations = await db.visibilityCitation.findMany({
    where: {
      responseId: { in: entity.mentions.map((item) => item.responseId) },
    },
  });

  return NextResponse.json({ entity, citations });
}

/**
 * PATCH — correction manuelle (catégorie / alias / nom canonique).
 * categoryManual=true → ne sera plus écrasée par une réanalyse auto.
 */
export async function PATCH(request: Request, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const category =
    typeof body.category === "string" && isEntityCategory(body.category)
      ? body.category
      : undefined;
  if (body.category !== undefined && !category) {
    return NextResponse.json({ error: "Catégorie invalide." }, { status: 400 });
  }

  const result = await updateEntityManualCorrection({
    entityId: id,
    category: category as Parameters<
      typeof updateEntityManualCorrection
    >[0]["category"],
    aliases:
      body.aliases !== undefined ? parseAliasList(body.aliases) : undefined,
    canonicalName:
      typeof body.canonicalName === "string" ? body.canonicalName : undefined,
    domain:
      body.domain === null
        ? null
        : typeof body.domain === "string"
          ? body.domain
          : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  const entity = await db.visibilityEntity.findUnique({ where: { id } });
  return NextResponse.json({ entity });
}
