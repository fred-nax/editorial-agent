import { NextResponse } from "next/server";
import { resolveWordPressConfig } from "@/lib/settings/app-settings";
import { testWordPressConnection } from "@/lib/settings/connection-tests";
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

  const overrideUrl = typeof body.url === "string" ? body.url.trim() : "";
  const overrideUsername =
    typeof body.username === "string" ? body.username.trim() : "";
  const overridePassword =
    typeof body.appPassword === "string" ? body.appPassword.trim() : "";

  const stored = await resolveWordPressConfig();
  const url = overrideUrl || stored?.url || "";
  const username = overrideUsername || stored?.username || "";
  const appPassword = overridePassword || stored?.appPassword || "";

  if (!url || !username || !appPassword) {
    return NextResponse.json(
      {
        ok: false,
        message: "Identifiants WordPress incomplets pour le test.",
      },
      { status: 400 }
    );
  }

  const result = await testWordPressConnection({
    url,
    username,
    appPassword,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
