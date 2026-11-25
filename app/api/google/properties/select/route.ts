import { NextResponse } from "next/server";
import { savePropertySelection } from "@/lib/google/connection";
import { assertGscPropertyMatchesSite } from "@/lib/google/url-normalize";
import { resolveWorkspacePublicSiteUrl } from "@/lib/google/site-url";
import { requireGoogleAnalyticsWorkspace } from "@/lib/google/workspace-guard";
import { requireAuth } from "@/lib/require-auth";
import { WorkspaceContextError } from "@/lib/workspace";

export const runtime = "nodejs";

type Body = {
  gscPropertyUrl?: string | null;
  gscPropertyType?: string | null;
  gscPermissionLevel?: string | null;
  ga4AccountId?: string | null;
  ga4PropertyId?: string | null;
  ga4PropertyName?: string | null;
  /** URL publique du site (Webflow) — optionnelle si déjà en settings. */
  publicSiteUrl?: string | null;
};

export async function POST(request: Request) {
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

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  // Persiste l’URL publique si fournie (surtout Webflow).
  if (typeof body.publicSiteUrl === "string" && body.publicSiteUrl.trim()) {
    const url = body.publicSiteUrl.trim().replace(/\/$/, "");
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("invalid");
      }
    } catch {
      return NextResponse.json(
        { error: "URL publique du site invalide." },
        { status: 400 }
      );
    }
    const { db } = await import("@/lib/db");
    await db.editorialWorkspace.update({
      where: { id: workspace.id },
      data: { siteUrl: url },
    });
    await db.workspaceCmsSettings.upsert({
      where: { workspaceId: workspace.id },
      create: { workspaceId: workspace.id, gscPublicSiteUrl: url },
      update: { gscPublicSiteUrl: url },
    });
  }

  const gscUrl =
    body.gscPropertyUrl === undefined
      ? undefined
      : body.gscPropertyUrl?.trim() || null;

  if (gscUrl) {
    const siteUrl = await resolveWorkspacePublicSiteUrl(workspace.id);
    try {
      assertGscPropertyMatchesSite({
        gscPropertyUrl: gscUrl,
        siteUrl,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Propriété Search Console incompatible.",
        },
        { status: 400 }
      );
    }
  }

  // Webflow : ignorer toute sélection GA4 (hors périmètre).
  const ga4Allowed = workspace.cmsProvider === "wordpress";

  try {
    await savePropertySelection({
      workspaceId: workspace.id,
      gscPropertyUrl: gscUrl,
      gscPropertyType: body.gscPropertyType ?? null,
      gscPermissionLevel: body.gscPermissionLevel ?? null,
      ga4AccountId: ga4Allowed ? body.ga4AccountId ?? null : null,
      ga4PropertyId: ga4Allowed ? body.ga4PropertyId ?? null : null,
      ga4PropertyName: ga4Allowed ? body.ga4PropertyName ?? null : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Enregistrement de la propriété impossible.",
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
