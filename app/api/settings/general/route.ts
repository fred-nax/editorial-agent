import { NextResponse } from "next/server";
import { updateGeneralSettings } from "@/lib/settings/app-settings";
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
  try {
    const settings = await updateGeneralSettings({
      clientName:
        record.clientName === undefined
          ? undefined
          : record.clientName === null
            ? null
            : String(record.clientName),
      siteName:
        record.siteName === undefined
          ? undefined
          : record.siteName === null
            ? null
            : String(record.siteName),
    });
    return NextResponse.json(settings);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Enregistrement impossible.";
    if (!message.includes("trop long")) {
      logError("settings-general", "update failed");
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
