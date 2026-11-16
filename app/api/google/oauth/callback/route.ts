import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { upsertGoogleTokens } from "@/lib/google/connection";
import {
  exchangeAuthorizationCode,
  fetchGoogleUserInfo,
  verifyOAuthState,
} from "@/lib/google/oauth";
import { requireAuth } from "@/lib/require-auth";

export const runtime = "nodejs";

function settingsRedirect(query: Record<string, string>): NextResponse {
  const base = (process.env.AUTH_URL ?? "").replace(/\/$/, "") || "";
  const url = new URL(`${base}/settings`);
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const error = searchParams.get("error");
  if (error) {
    return settingsRedirect({ google: "denied" });
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state) {
    return settingsRedirect({ google: "invalid" });
  }

  try {
    const payload = verifyOAuthState(state);
    const jar = await cookies();
    const nonce = jar.get("google_oauth_nonce")?.value;
    if (!nonce || nonce !== payload.n) {
      return settingsRedirect({ google: "state" });
    }

    const tokens = await exchangeAuthorizationCode(code);
    const user = await fetchGoogleUserInfo(tokens.access_token);
    await upsertGoogleTokens({
      tokens,
      email: user.email ?? null,
      sub: user.sub ?? null,
    });

    const response = settingsRedirect({ google: "connected" });
    response.cookies.set("google_oauth_nonce", "", {
      httpOnly: true,
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch {
    return settingsRedirect({ google: "error" });
  }
}
