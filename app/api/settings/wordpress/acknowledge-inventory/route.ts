import { NextResponse } from "next/server";
import { acknowledgeInventorySiteSwitch } from "@/lib/settings/app-settings";
import { requireAuth } from "@/lib/require-auth";

export const runtime = "nodejs";

/** Confirme le changement de site WP pour l’inventaire (sans suppression). */
export async function POST() {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  try {
    const settings = await acknowledgeInventorySiteSwitch();
    return NextResponse.json(settings);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Confirmation impossible.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
