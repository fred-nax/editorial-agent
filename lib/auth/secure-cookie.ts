/**
 * AUTH-003 / OPS-03A / V7.16.4 — détermine si getToken doit lire `__Secure-…`.
 *
 * Derrière un reverse-proxy qui termine le TLS, `req.nextUrl.protocol` est
 * souvent `http:` alors que le navigateur détient `__Secure-authjs.session-token`.
 * Sans `secureCookie: true`, getToken lit `authjs.session-token` → null → 401
 * alors que `auth()` (RSC / routes) fonctionne encore.
 *
 * Priorité à la config serveur (`AUTH_URL` / `NEXTAUTH_URL`) — ne jamais
 * rétrograder vers un cookie non sécurisé en production HTTPS sur la base
 * d’un `X-Forwarded-Proto` client falsifiable.
 */
export function resolveSecureSessionCookie(input: {
  authUrl?: string | null;
  nextAuthUrl?: string | null;
  forwardedProto?: string | null;
  requestProtocol?: string | null;
  nodeEnv?: string | null;
}): boolean {
  const authUrl = input.authUrl?.trim() || input.nextAuthUrl?.trim() || "";

  // Source de vérité déploiement : URL publique canonique.
  if (authUrl.startsWith("https://")) {
    return true;
  }
  if (authUrl.startsWith("http://")) {
    return false;
  }

  const requestIsHttps = (input.requestProtocol ?? "")
    .toLowerCase()
    .startsWith("https");
  if (requestIsHttps) {
    return true;
  }

  // XFF : uniquement pour *monter* vers secure si AUTH_URL absent.
  // Jamais utilisé pour forcer non-secure quand un signal https existe déjà
  // (requestIsHttps ci-dessus) ou en NODE_ENV=production.
  const forwarded = input.forwardedProto?.split(",")[0]?.trim().toLowerCase();
  if (forwarded === "https") {
    return true;
  }

  // Production sans AUTH_URL : préférer le cookie Secure (défense en profondeur).
  // Les installs Naxialis exigent AUTH_URL en prod (garde env) ; ce défaut
  // évite un fallback permissif si la garde est contournée.
  if ((input.nodeEnv ?? "").trim() === "production") {
    return true;
  }

  return false;
}
