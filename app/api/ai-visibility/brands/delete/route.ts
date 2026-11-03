import { NextResponse } from "next/server";
import { deleteVisibilityBrands } from "@/lib/ai-visibility/delete-brand";
import { logError } from "@/lib/logger";
import { requireAuth } from "@/lib/require-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * Suppression groupée de marques.
 * Corps : { ids: string[] } — uniquement les ids explicitement fournis.
 */
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

    const ids =
      typeof body === "object" && body && "ids" in body
        ? (body as { ids: unknown }).ids
        : undefined;

    const batch = await deleteVisibilityBrands(ids);
    if (!batch.ok) {
      return NextResponse.json({ error: batch.error }, { status: batch.status });
    }

    const { deleted, failed, requestedCount } = batch.result;
    const partial = failed.length > 0;
    const status =
      deleted.length === 0 && failed.length > 0
        ? failed.every((item) => item.status === 404)
          ? 404
          : failed.some((item) => item.status === 409)
            ? 409
            : 400
        : partial
          ? 207
          : 200;

    return NextResponse.json(
      {
        success: !partial && deleted.length > 0,
        partial,
        requestedCount,
        deleted,
        failed,
        error:
          partial || deleted.length === 0
            ? failed.length === 1
              ? failed[0]?.error
              : `${failed.length} suppression(s) en échec sur ${requestedCount}.`
            : undefined,
      },
      { status }
    );
  } catch (error) {
    logError("ai-visibility", "bulk delete brands failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "Impossible de supprimer les marques." },
      { status: 500 }
    );
  }
}
