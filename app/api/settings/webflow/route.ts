import { NextResponse } from "next/server";
import { updateWebflowSettings } from "@/lib/settings/app-settings";
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
    const settings = await updateWebflowSettings({
      apiToken:
        record.apiToken === undefined ? undefined : String(record.apiToken),
      agentId:
        record.agentId === undefined
          ? undefined
          : record.agentId === null
            ? null
            : String(record.agentId),
      siteId:
        record.siteId === undefined
          ? undefined
          : record.siteId === null
            ? null
            : String(record.siteId),
      collectionId:
        record.collectionId === undefined
          ? undefined
          : record.collectionId === null
            ? null
            : String(record.collectionId),
      fieldMapping:
        record.fieldMapping === undefined ? undefined : record.fieldMapping,
    });
    return NextResponse.json(settings);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Enregistrement impossible.";
    logError("settings-webflow", "update failed");
    const status = message.includes("ENCRYPTION") ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
