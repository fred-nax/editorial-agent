import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";
import { addOpportunityToTopicQueue } from "@/lib/seo/queue";

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
  const opportunity = await db.seoOpportunity.findUnique({ where: { id } });
  if (!opportunity) {
    return NextResponse.json({ error: "Opportunité introuvable." }, { status: 404 });
  }
  return NextResponse.json({ opportunity });
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

  if (action === "dismiss") {
    const opportunity = await db.seoOpportunity.update({
      where: { id },
      data: { status: "dismissed" },
    });
    return NextResponse.json({ opportunity });
  }

  if (action !== "queue") {
    return NextResponse.json({ error: "Action non supportée." }, { status: 400 });
  }

  try {
    const result = await addOpportunityToTopicQueue(id);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Impossible d’ajouter à la file.";
    const status = message.includes("introuvable") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
