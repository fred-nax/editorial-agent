import { NextResponse } from "next/server";
import { isGoogleOAuthConfigured } from "@/lib/google/oauth";
import {
  sanitizeStoredGoogleError,
  toPublicGoogleError,
} from "@/lib/google/public-errors";
import { propertyLooksCompatibleWithSite } from "@/lib/google/url-normalize";
import { resolveWorkspacePublicSiteUrl } from "@/lib/google/site-url";
import { getGoogleSyncStatus } from "@/lib/google/sync";
import { requireGoogleAnalyticsWorkspace } from "@/lib/google/workspace-guard";
import { requireAuth } from "@/lib/require-auth";
import { WorkspaceContextError } from "@/lib/workspace";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  let workspace;
  try {
    workspace = await requireGoogleAnalyticsWorkspace(request);
  } catch (error) {
    if (error instanceof WorkspaceContextError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    throw error;
  }

  const { last, lastSuccess, running, connection } = await getGoogleSyncStatus(
    workspace.id
  );
  const selection = connection?.selection ?? null;
  const siteUrl = await resolveWorkspacePublicSiteUrl(workspace.id);
  const gscConfigured = Boolean(selection?.gscPropertyUrl);
  const gscCompatible = propertyLooksCompatibleWithSite(
    selection?.gscPropertyUrl,
    siteUrl
  );
  const syncError = sanitizeStoredGoogleError(last?.error, "google_sync");
  const connectionError = connection?.lastError
    ? toPublicGoogleError(connection.lastError, "google_auth")
    : null;

  return NextResponse.json({
    oauthConfigured: isGoogleOAuthConfigured(),
    connected: Boolean(connection && connection.status === "connected"),
    status: connection?.status ?? "disconnected",
    accountEmail: connection?.googleAccountEmail ?? null,
    lastError: connectionError,
    connectedAt: connection?.connectedAt?.toISOString() ?? null,
    cmsProvider: workspace.cmsProvider,
    workspaceId: workspace.id,
    publicSiteUrl: siteUrl,
    ga4Supported: true,
    selection: selection
      ? {
          gscPropertyUrl: selection.gscPropertyUrl,
          gscPropertyType: selection.gscPropertyType,
          gscPermissionLevel: selection.gscPermissionLevel,
          ga4AccountId: selection.ga4AccountId,
          ga4PropertyId: selection.ga4PropertyId,
          ga4PropertyName: selection.ga4PropertyName,
          gscCompatibleWithSite: gscCompatible,
          /** Alias rétrocompat UI WordPress. */
          gscCompatibleWithWp: gscCompatible,
        }
      : null,
    states: {
      gscConfigured,
      gscCompatible,
      syncRunning: Boolean(running),
      hasPreviousData: Boolean(lastSuccess),
      lastAttemptFailed: last?.status === "failed",
    },
    sync: {
      running: Boolean(running),
      lastStatus: last?.status ?? null,
      /** Dernière tentative (succès ou échec). */
      lastFinishedAt: last?.finishedAt?.toISOString() ?? null,
      lastError: syncError,
      lastMode: last?.mode ?? null,
      /** Dernière synchronisation réussie (distincte de la dernière tentative). */
      lastSuccessAt: lastSuccess?.finishedAt?.toISOString() ?? null,
      lastSuccessMode: lastSuccess?.mode ?? null,
    },
  });
}
