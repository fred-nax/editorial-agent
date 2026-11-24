import { NextResponse } from "next/server";
import { resolveWebflowConfig } from "@/lib/settings/app-settings";
import { requireAuth } from "@/lib/require-auth";
import {
  createWebflowClient,
  listWebflowCollections,
  WebflowApiError,
} from "@/lib/webflow";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const url = new URL(request.url);
  const siteIdParam = url.searchParams.get("siteId")?.trim() || "";
  const config = await resolveWebflowConfig();
  if (!config?.apiToken) {
    return NextResponse.json(
      { error: "Webflow non configuré (token API manquant)." },
      { status: 400 }
    );
  }

  const siteId = siteIdParam || config.siteId || "";
  if (!siteId) {
    return NextResponse.json(
      { error: "Identifiant de site Webflow requis." },
      { status: 400 }
    );
  }

  try {
    const client = createWebflowClient({ apiToken: config.apiToken });
    const collections = await listWebflowCollections(client, siteId);
    return NextResponse.json({ collections, siteId });
  } catch (error) {
    const message =
      error instanceof WebflowApiError
        ? error.message
        : "Impossible de récupérer les collections Webflow.";
    const status =
      error instanceof WebflowApiError && error.status === 429 ? 429 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
