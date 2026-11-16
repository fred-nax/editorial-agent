import { NextResponse } from "next/server";
import {
  buildGoogleAuthUrl,
  createOAuthState,
  isGoogleOAuthConfigured,
} from "@/lib/google/oauth";
import { isGoogleEncryptionConfigured } from "@/lib/google/crypto";
import { requireAuth } from "@/lib/require-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireAuth();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  if (!isGoogleOAuthConfigured() || !isGoogleEncryptionConfigured()) {
    return NextResponse.json(
      {
        error:
          "Google OAuth non configuré (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_TOKEN_ENCRYPTION_KEY, AUTH_URL).",
      },
      { status: 503 }
    );
  }

  const { state, nonce } = createOAuthState();
  const url = buildGoogleAuthUrl(state);
  const response = NextResponse.redirect(url);
  response.cookies.set("google_oauth_nonce", nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 15 * 60,
  });
  return response;
}
