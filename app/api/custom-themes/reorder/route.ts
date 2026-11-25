import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { reorderThemes } from "@/lib/seo/theme-catalog";
import {
  resolveActiveWorkspace,
  WorkspaceContextError,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return unauthorized();
  }

  let workspaceId: string;
  try {
    workspaceId = (await resolveActiveWorkspace()).id;
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    throw error;
  }

  let body: { orderedIds?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  if (!Array.isArray(body.orderedIds)) {
    return NextResponse.json(
      { error: "orderedIds doit être une liste d’identifiants." },
      { status: 400 }
    );
  }

  const orderedIds = body.orderedIds.filter(
    (item): item is string => typeof item === "string" && item.length > 0
  );

  try {
    const themes = await reorderThemes(orderedIds, workspaceId);
    return NextResponse.json({ themes });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Réordonnancement impossible.",
      },
      { status: 400 }
    );
  }
}
