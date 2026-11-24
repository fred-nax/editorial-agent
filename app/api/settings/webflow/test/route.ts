import { NextResponse } from "next/server";
import { resolveWebflowConfig } from "@/lib/settings/app-settings";
import { requireAuth } from "@/lib/require-auth";
import { testWebflowConnection } from "@/lib/webflow";

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
    body = {};
  }

  const overrideToken =
    typeof body.apiToken === "string" ? body.apiToken.trim() : "";
  const overrideSiteId =
    typeof body.siteId === "string" ? body.siteId.trim() : "";

  const stored = await resolveWebflowConfig();
  const apiToken = overrideToken || stored?.apiToken || "";
  const siteId = overrideSiteId || stored?.siteId || null;

  if (!apiToken) {
    return NextResponse.json(
      {
        ok: false,
        message: "Token API Webflow manquant pour le test.",
      },
      { status: 400 }
    );
  }

  const result = await testWebflowConnection({ apiToken, siteId });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
