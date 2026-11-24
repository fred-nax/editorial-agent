import { NextResponse } from "next/server";
import { resolveWebflowConfig } from "@/lib/settings/app-settings";
import { requireAuth } from "@/lib/require-auth";
import {
  createWebflowClient,
  getWebflowCollectionDetails,
  WebflowApiError,
} from "@/lib/webflow";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ collectionId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { collectionId: rawId } = await context.params;
  const collectionId = rawId?.trim() || "";
  if (!collectionId) {
    return NextResponse.json(
      { error: "Identifiant de collection manquant." },
      { status: 400 }
    );
  }

  const config = await resolveWebflowConfig();
  if (!config?.apiToken) {
    return NextResponse.json(
      { error: "Webflow non configuré (token API manquant)." },
      { status: 400 }
    );
  }

  try {
    const client = createWebflowClient({ apiToken: config.apiToken });
    const collection = await getWebflowCollectionDetails(client, collectionId);
    return NextResponse.json({ collection });
  } catch (error) {
    const message =
      error instanceof WebflowApiError
        ? error.message
        : "Impossible de récupérer les champs de la collection.";
    const status =
      error instanceof WebflowApiError && error.status === 429 ? 429 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
