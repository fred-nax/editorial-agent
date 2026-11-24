import { NextResponse } from "next/server";
import { resolveWebflowConfig } from "@/lib/settings/app-settings";
import { requireAuth } from "@/lib/require-auth";
import {
  createWebflowClient,
  getWebflowCollectionDetails,
  normalizeWebflowFieldMappingInput,
  validateWebflowFieldMapping,
  WebflowApiError,
} from "@/lib/webflow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object") {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 });
  }

  const config = await resolveWebflowConfig();
  if (!config?.apiToken) {
    return NextResponse.json(
      { error: "Webflow non configuré (token API manquant)." },
      { status: 400 }
    );
  }

  const collectionId =
    (typeof body.collectionId === "string" && body.collectionId.trim()) ||
    config.collectionId ||
    "";
  if (!collectionId) {
    return NextResponse.json(
      { error: "Identifiant de collection requis pour valider le mapping." },
      { status: 400 }
    );
  }

  const mapping = normalizeWebflowFieldMappingInput(
    body.fieldMapping ?? config.fieldMapping
  );

  try {
    const client = createWebflowClient({ apiToken: config.apiToken });
    const collection = await getWebflowCollectionDetails(client, collectionId);
    const validation = validateWebflowFieldMapping(mapping, collection.fields);
    return NextResponse.json({
      ok: validation.ok,
      issues: validation.issues,
      collection: {
        id: collection.id,
        displayName: collection.displayName,
        fieldCount: collection.fields.length,
      },
    });
  } catch (error) {
    const message =
      error instanceof WebflowApiError
        ? error.message
        : "Validation du mapping impossible.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
