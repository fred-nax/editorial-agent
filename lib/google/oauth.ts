import { createHmac, randomBytes, timingSafeEqual } from "crypto";

export const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
] as const;

const STATE_TTL_MS = 15 * 60 * 1000;

function requireGoogleOAuthEnv(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const base = (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth non configuré (GOOGLE_CLIENT_ID / SECRET).");
  }
  if (!base) {
    throw new Error("AUTH_URL manquant pour construire l’URI de redirection Google.");
  }
  return {
    clientId,
    clientSecret,
    redirectUri: `${base}/api/google/oauth/callback`,
  };
}

function stateSecret(): string {
  return (
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    ""
  );
}

function sign(payloadB64: string): string {
  const secret = stateSecret();
  if (!secret) {
    throw new Error("Impossible de signer le state OAuth (secret manquant).");
  }
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

export type OAuthStatePayload = {
  n: string;
  ts: number;
};

export function createOAuthState(): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString("base64url");
  const payload: OAuthStatePayload = { n: nonce, ts: Date.now() };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url"
  );
  return { state: `${payloadB64}.${sign(payloadB64)}`, nonce };
}

export function verifyOAuthState(state: string): OAuthStatePayload {
  const [payloadB64, signature] = state.split(".");
  if (!payloadB64 || !signature) {
    throw new Error("State OAuth invalide.");
  }
  const expected = sign(payloadB64);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("State OAuth falsifié.");
  }
  const payload = JSON.parse(
    Buffer.from(payloadB64, "base64url").toString("utf8")
  ) as OAuthStatePayload;
  if (!payload?.n || typeof payload.ts !== "number") {
    throw new Error("State OAuth incomplet.");
  }
  if (Date.now() - payload.ts > STATE_TTL_MS) {
    throw new Error("State OAuth expiré.");
  }
  return payload;
}

export function buildGoogleAuthUrl(state: string): string {
  const { clientId, redirectUri } = requireGoogleOAuthEnv();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_OAUTH_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

export async function exchangeAuthorizationCode(
  code: string
): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret, redirectUri } = requireGoogleOAuthEnv();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = (await response.json()) as GoogleTokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ||
        payload.error ||
        "Échange du code OAuth Google impossible."
    );
  }
  return payload;
}

export async function refreshAccessToken(
  refreshToken: string
): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = requireGoogleOAuthEnv();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = (await response.json()) as GoogleTokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(
      payload.error_description ||
        payload.error ||
        "Renouvellement du jeton Google impossible."
    );
  }
  return payload;
}

export async function revokeGoogleToken(token: string): Promise<void> {
  const response = await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
  if (!response.ok) {
    // Révocation best-effort : le jeton local est quand même effacé.
    return;
  }
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<{
  email?: string;
  sub?: string;
}> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    return {};
  }
  return (await response.json()) as { email?: string; sub?: string };
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim() &&
      (process.env.AUTH_URL?.trim() || process.env.NEXTAUTH_URL?.trim())
  );
}

export function getGoogleRedirectUri(): string {
  return requireGoogleOAuthEnv().redirectUri;
}
