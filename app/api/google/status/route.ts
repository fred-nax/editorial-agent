import { NextResponse } from "next/server";
import { isGoogleOAuthConfigured } from "@/lib/google/oauth";
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

  const { last, running, connection } = await getGoogleSyncStatus(workspace.id);
  const selection = connection?.selection ?? null;
  const siteUrl = await resolveWorkspacePublicSiteUrl(workspace.id);
  const gscConfigured = Boolean(selection?.gscPropertyUrl);
  const gscCompatible = propertyLooksCompatibleWithSite(
    selection?.gscPropertyUrl,
    siteUrl
  );

  return NextResponse.json({
    oauthConfigured: isGoogleOAuthConfigured(),
    connected: Boolean(connection && connection.status === "connected"),
    status: connection?.status ?? "disconnected",
    accountEmail: connection?.googleAccountEmail ?? null,
    lastError: connection?.lastError ?? null,
    connectedAt: connection?.connectedAt?.toISOString() ?? null,
    cmsProvider: workspace.cmsProvider,
    workspaceId: workspace.id,
    publicSiteUrl: siteUrl,
    /** Webflow : GA4 hors périmètre V7.14.0. */
    ga4Supported: workspace.cmsProvider === "wordpress",
    selection: selection
      ? {
          gscPropertyUrl: selection.gscPropertyUrl,
          gscPropertyType: selection.gscPropertyType,
          gscPermissionLevel: selection.gscPermissionLevel,
          ga4AccountId:
            workspace.cmsProvider === "wordpress"
              ? selection.ga4AccountId
              : null,
          ga4PropertyId:
            workspace.cmsProvider === "wordpress"
              ? selection.ga4PropertyId
              : null,
          ga4PropertyName:
            workspace.cmsProvider === "wordpress"
              ? selection.ga4PropertyName
              : null,
          gscCompatibleWithSite: gscCompatible,
          /** Alias rétrocompat UI WordPress. */
          gscCompatibleWithWp: gscCompatible,
        }
      : null,
    states: {
      gscConfigured,
      gscCompatible,
      syncRunning: Boolean(running),
      hasPreviousData: Boolean(last && last.status === "completed"),
    },
    sync: {
      running: Boolean(running),
      lastStatus: last?.status ?? null,
      lastFinishedAt: last?.finishedAt?.toISOString() ?? null,
      lastError: last?.error ?? null,
      lastMode: last?.mode ?? null,
    },
  });
}
