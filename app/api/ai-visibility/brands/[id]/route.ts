import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateBrandInput } from "@/lib/ai-visibility/brands";
import { deleteVisibilityBrand } from "@/lib/ai-visibility/delete-brand";
import { logError } from "@/lib/logger";
import { requireAuth } from "@/lib/require-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requireAuth();
    if (!session) {
      return unauthorized();
    }
    if (!session.user) {
      return forbidden();
    }

    const { id } = await context.params;
    const brand = await db.visibilityBrand.findUnique({
      where: { id },
      include: {
        campaigns: { orderBy: { createdAt: "desc" }, take: 50 },
        entities: {
          where: { kind: "competitor" },
          orderBy: { updatedAt: "desc" },
          take: 50,
        },
      },
    });
    if (!brand) {
      return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });
    }
    return NextResponse.json({ brand }, { status: 200 });
  } catch (error) {
    logError("ai-visibility", "get brand failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "Impossible de charger la marque." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const session = await requireAuth();
    if (!session) {
      return unauthorized();
    }
    if (!session.user) {
      return forbidden();
    }

    const { id } = await context.params;
    const existing = await db.visibilityBrand.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
    }

    const validated = validateBrandInput({
      name: existing.name,
      primaryDomain: existing.primaryDomain,
      ...(typeof body === "object" && body ? body : {}),
    });
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const brand = await db.visibilityBrand.update({
      where: { id },
      data: validated.value,
    });
    return NextResponse.json({ brand }, { status: 200 });
  } catch (error) {
    logError("ai-visibility", "patch brand failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "Impossible de mettre à jour la marque." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const session = await requireAuth();
    if (!session) {
      return unauthorized();
    }
    if (!session.user) {
      return forbidden();
    }

    const { id } = await context.params;
    const result = await deleteVisibilityBrand(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true, brand: result.brand });
  } catch (error) {
    logError("ai-visibility", "DELETE brand failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "Impossible de supprimer la marque." },
      { status: 500 }
    );
  }
}
