import { NextResponse } from "next/server";
import { syncWordPressCategories } from "@/lib/settings/app-settings";
import { logError } from "@/lib/logger";
import { requireAuth } from "@/lib/require-auth";

export const runtime = "nodejs";

export async function POST() {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    const settings = await syncWordPressCategories();
    return NextResponse.json(settings);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Synchronisation des catégories impossible.";
    logError("settings-categories-sync", "sync failed");
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
