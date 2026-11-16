import { NextResponse } from "next/server";
import { resolveOpenAiConfig } from "@/lib/settings/app-settings";
import { testOpenAiConnection } from "@/lib/settings/connection-tests";
import { requireAuth } from "@/lib/require-auth";

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

  const overrideAgentId =
    typeof body.agentId === "string" ? body.agentId.trim() : "";
  const overrideApiKey =
    typeof body.apiKey === "string" ? body.apiKey.trim() : "";

  const stored = await resolveOpenAiConfig();
  const apiKey = overrideApiKey || stored?.apiKey || "";
  const agentId = overrideAgentId || stored?.agentId || "";

  if (!apiKey || !agentId) {
    return NextResponse.json(
      {
        ok: false,
        message: "Clé API ou identifiant d’agent manquant pour le test.",
      },
      { status: 400 }
    );
  }

  const result = await testOpenAiConnection({ apiKey, agentId });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
