import { NextResponse } from "next/server";
import { updateWpSeoPlugin } from "@/lib/settings/app-settings";
import { logError } from "@/lib/logger";
import { requireAuth } from "@/lib/require-auth";

export const runtime = "nodejs";

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
  const plugin = record.plugin;

  if (typeof plugin !== "string") {
    return NextResponse.json(
      { error: "Champ « plugin » requis (slim_seo | yoast_seo)." },
      { status: 400 }
    );
  }

  try {
    const settings = await updateWpSeoPlugin(plugin);
    return NextResponse.json(settings);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Enregistrement impossible.";
    logError("settings-seo-plugin", "update failed");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
