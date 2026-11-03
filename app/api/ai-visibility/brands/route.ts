import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import {
  createVisibilityBrand,
  listVisibilityBrands,
} from "@/lib/ai-visibility/brand-service";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function GET() {
  try {
    const session = await requireAuth();
    if (!session) {
      return unauthorized();
    }
    if (!session.user) {
      return forbidden();
    }

    const brands = await listVisibilityBrands();
    return NextResponse.json({ brands }, { status: 200 });
  } catch (error) {
    logError("ai-visibility", "list brands failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "Impossible de charger les marques." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuth();
    if (!session) {
      return unauthorized();
    }
    if (!session.user) {
      return forbidden();
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
    }

    const result = await createVisibilityBrand(body);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({ brand: result.brand }, { status: 201 });
  } catch (error) {
    logError("ai-visibility", "create brand route failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "Impossible de créer la marque." },
      { status: 500 }
    );
  }
}
