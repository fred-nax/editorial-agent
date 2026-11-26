/**
 * Résolution d’adresse IP client pour le rate-limit login (V7.16.1).
 *
 * Par défaut, ne fait **pas** confiance aux en-têtes X-Forwarded-For
 * (usurpables par un client). Derrière un reverse proxy Docker/VPS,
 * positionner AUTH_TRUST_PROXY=1 (le proxy doit écraser/contrôler XFF).
 */

export type ClientIpSource = "x-forwarded-for" | "x-real-ip" | "unknown";

export type ResolvedClientIp = {
  ip: string;
  source: ClientIpSource;
  trustedProxy: boolean;
};

function firstForwardedClientIp(xff: string): string | null {
  // Chaîne « client, proxy1, proxy2 » — le client est le premier hop.
  const parts = xff
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return null;
  }
  return parts[0] ?? null;
}

function normalizeIp(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.startsWith("::ffff:")) {
    return trimmed.slice("::ffff:".length);
  }
  return trimmed;
}

export function isAuthTrustProxyEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const raw = env.AUTH_TRUST_PROXY?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * Extrait une IP utilisable pour le rate-limit depuis les en-têtes de requête.
 */
export function resolveClientIpFromHeaders(
  headers: Headers | { get(name: string): string | null },
  env: NodeJS.ProcessEnv = process.env
): ResolvedClientIp {
  const trustedProxy = isAuthTrustProxyEnabled(env);

  if (trustedProxy) {
    const xff = headers.get("x-forwarded-for");
    if (xff) {
      const client = firstForwardedClientIp(xff);
      if (client) {
        return {
          ip: normalizeIp(client),
          source: "x-forwarded-for",
          trustedProxy: true,
        };
      }
    }
    const realIp = headers.get("x-real-ip")?.trim();
    if (realIp) {
      return {
        ip: normalizeIp(realIp),
        source: "x-real-ip",
        trustedProxy: true,
      };
    }
  }

  return {
    ip: "unknown",
    source: "unknown",
    trustedProxy,
  };
}
