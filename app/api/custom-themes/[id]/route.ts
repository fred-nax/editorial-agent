import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/require-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  const { id } = await context.params;
  let body: {
    name?: string;
    description?: string | null;
    active?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const existing = await db.customTheme.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Thématique introuvable." }, { status: 404 });
  }

  const data: {
    name?: string;
    description?: string | null;
    active?: boolean;
  } = {};

  if (typeof body.name === "string") {
    const name = body.name.trim().slice(0, 120);
    if (!name) {
      return NextResponse.json({ error: "Nom invalide." }, { status: 400 });
    }
    data.name = name;
  }
  if (body.description !== undefined) {
    data.description =
      typeof body.description === "string"
        ? body.description.trim().slice(0, 500) || null
        : null;
  }
  if (typeof body.active === "boolean") {
    data.active = body.active;
  }

  const theme = await db.customTheme.update({
    where: { id },
    data,
  });
  return NextResponse.json({ theme });
}

/** Désactivation uniquement — pas de suppression destructive. */
export async function DELETE(_request: Request, context: RouteContext) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  const { id } = await context.params;
  const existing = await db.customTheme.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Thématique introuvable." }, { status: 404 });
  }

  const theme = await db.customTheme.update({
    where: { id },
    data: { active: false },
  });
  return NextResponse.json({ theme, deactivated: true });
}
