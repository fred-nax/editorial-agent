import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

export class WordPressUrlError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "WordPressUrlError";
    this.status = status;
  }
}

/** Origin normalisée `https://host` (sans slash final, host en minuscules). */
export function normalizeWpOrigin(rawUrl: string): string {
  const url = new URL(rawUrl.trim());
  return `${url.protocol}//${url.host}`.replace(/\/$/, "").toLowerCase();
}

export function isPrivateOrReservedIp(hostnameOrIp: string): boolean {
  let host = hostnameOrIp.replace(/^\[|\]$/g, "").toLowerCase();

  // IPv4-mappées (::ffff:127.0.0.1) — SEC-005
  if (host.startsWith("::ffff:")) {
    host = host.slice("::ffff:".length);
  }

  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }

  const ipVersion = isIP(host);
  if (!ipVersion) {
    return false;
  }

  if (ipVersion === 4) {
    const parts = host.split(".").map((p) => Number(p));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
      return true;
    }
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  if (host === "::1") return true;
  if (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    return true;
  }
  // IPv4 décimal dans une forme IPv6 restante
  if (host.includes(".")) {
    const mapped = host.split(":").pop();
    if (mapped && isIP(mapped) === 4) {
      return isPrivateOrReservedIp(mapped);
    }
  }
  return false;
}

function allowInsecureHttp(): boolean {
  if (process.env.ALLOW_INSECURE_WP_URL === "1") {
    return true;
  }
  return process.env.NODE_ENV === "development";
}

/**
 * Valide une URL WordPress publique (anti-SSRF, synchrone).
 * En production : HTTPS obligatoire (sauf ALLOW_INSECURE_WP_URL=1).
 */
export function assertSafeWordPressUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) {
    throw new WordPressUrlError("URL WordPress invalide.");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new WordPressUrlError("URL WordPress invalide.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new WordPressUrlError("L’URL WordPress doit utiliser http ou https.");
  }

  if (url.protocol === "http:" && !allowInsecureHttp()) {
    throw new WordPressUrlError(
      "L’URL WordPress doit utiliser HTTPS en production."
    );
  }

  if (url.username || url.password) {
    throw new WordPressUrlError(
      "L’URL WordPress ne doit pas contenir d’identifiants."
    );
  }

  if (!url.hostname || isPrivateOrReservedIp(url.hostname)) {
    throw new WordPressUrlError(
      "URL WordPress refusée (hôte local ou réseau privé)."
    );
  }

  url.hash = "";
  const normalized = `${url.protocol}//${url.host}${url.pathname}`.replace(
    /\/$/,
    ""
  );
  return normalized || `${url.protocol}//${url.host}`;
}

/** Valide l’URL puis refuse les résolutions DNS vers des IP privées. */
export async function assertSafeWordPressUrlResolved(
  raw: string
): Promise<string> {
  const normalized = assertSafeWordPressUrl(raw);
  const hostname = new URL(normalized).hostname;
  if (isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new WordPressUrlError(
        "URL WordPress refusée (adresse IP privée)."
      );
    }
    return normalized;
  }

  try {
    const result = await lookup(hostname, { all: true });
    if (!result.length) {
      throw new WordPressUrlError("Impossible de résoudre l’hôte WordPress.");
    }
    for (const entry of result) {
      if (isPrivateOrReservedIp(entry.address)) {
        throw new WordPressUrlError(
          "URL WordPress refusée (résolution DNS vers réseau privé)."
        );
      }
    }
  } catch (error) {
    if (error instanceof WordPressUrlError) {
      throw error;
    }
    throw new WordPressUrlError("Impossible de résoudre l’hôte WordPress.");
  }

  return normalized;
}

/**
 * fetch WordPress sans suivre les redirections (anti-SSRF).
 * Revalide l’URL/IP à chaque appel (SEC-005) — pas seulement à l’enregistrement.
 */
export async function fetchWordPressNoRedirect(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  await assertSafeWordPressUrlResolved(url);
  const response = await fetch(url, {
    ...init,
    redirect: "manual",
  });
  if (response.status >= 300 && response.status < 400) {
    throw new WordPressUrlError(
      "Redirection WordPress refusée (sécurité SSRF).",
      502
    );
  }
  return response;
}
