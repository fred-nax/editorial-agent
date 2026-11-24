import { NextResponse } from "next/server";
import { resolveWebflowConfig } from "@/lib/settings/app-settings";
import { requireAuth } from "@/lib/require-auth";
import {
  createWebflowClient,
  listWebflowSites,
  WebflowApiError,
} from "@/lib/webflow";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
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
    const sites = await listWebflowSites(client);
    return NextResponse.json({ sites });
  } catch (error) {
    const message =
      error instanceof WebflowApiError
        ? error.message
        : "Impossible de récupérer les sites Webflow.";
    const status =
      error instanceof WebflowApiError && error.status
        ? error.status === 401 || error.status === 403
          ? 400
          : error.status === 429
            ? 429
            : 502
        : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
