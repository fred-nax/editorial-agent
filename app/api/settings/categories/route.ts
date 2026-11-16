import { NextResponse } from "next/server";
import {
  getPublicAppSettings,
  updateWordPressCategorySelection,
} from "@/lib/settings/app-settings";
import { logError } from "@/lib/logger";
import { requireAuth } from "@/lib/require-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const settings = await getPublicAppSettings();
  return NextResponse.json(settings);
}

export async function PATCH(request: Request) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const record = body as Record<string, unknown>;

  let allowedIds: number[] | undefined;
  if (record.allowedIds !== undefined) {
    if (!Array.isArray(record.allowedIds)) {
      return NextResponse.json(
        { error: "allowedIds doit être un tableau d’identifiants." },
        { status: 400 }
      );
    }
    allowedIds = [];
    for (const value of record.allowedIds) {
      const id = Number(value);
      if (!Number.isInteger(id) || id <= 0) {
        return NextResponse.json(
          { error: "Identifiant de catégorie invalide." },
          { status: 400 }
        );
      }
      allowedIds.push(id);
    }
  }

  let defaultCategoryId: number | null | undefined;
  if (record.defaultCategoryId !== undefined) {
    if (record.defaultCategoryId === null) {
      defaultCategoryId = null;
    } else {
      const id = Number(record.defaultCategoryId);
      if (!Number.isInteger(id) || id <= 0) {
        return NextResponse.json(
          { error: "Catégorie par défaut invalide." },
          { status: 400 }
        );
      }
      defaultCategoryId = id;
    }
  }

  try {
    const settings = await updateWordPressCategorySelection({
      allowedIds,
      defaultCategoryId,
    });
    return NextResponse.json(settings);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Enregistrement impossible.";
    logError("settings-categories", "update failed");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
