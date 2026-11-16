import { NextResponse } from "next/server";
import { getGoogleConnection } from "@/lib/google/connection";
import { isGoogleOAuthConfigured } from "@/lib/google/oauth";
import { propertyLooksCompatibleWithWp } from "@/lib/google/url-normalize";
import { getGoogleSyncStatus } from "@/lib/google/sync";
import { requireAuth } from "@/lib/require-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { last, running, connection } = await getGoogleSyncStatus();
  const selection = connection?.selection ?? null;
  const wpUrl = process.env.WP_URL ?? null;

  return NextResponse.json({
    oauthConfigured: isGoogleOAuthConfigured(),
    connected: Boolean(connection && connection.status === "connected"),
    status: connection?.status ?? "disconnected",
    accountEmail: connection?.googleAccountEmail ?? null,
    lastError: connection?.lastError ?? null,
    connectedAt: connection?.connectedAt?.toISOString() ?? null,
    selection: selection
      ? {
          gscPropertyUrl: selection.gscPropertyUrl,
          gscPropertyType: selection.gscPropertyType,
          gscPermissionLevel: selection.gscPermissionLevel,
          ga4AccountId: selection.ga4AccountId,
          ga4PropertyId: selection.ga4PropertyId,
          ga4PropertyName: selection.ga4PropertyName,
          gscCompatibleWithWp: propertyLooksCompatibleWithWp(
            selection.gscPropertyUrl,
            wpUrl
          ),
        }
      : null,
    sync: {
      running: Boolean(running),
      lastStatus: last?.status ?? null,
      lastFinishedAt: last?.finishedAt?.toISOString() ?? null,
      lastError: last?.error ?? null,
      lastMode: last?.mode ?? null,
    },
  });
}
