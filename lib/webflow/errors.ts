/**
 * Erreurs HTTP Webflow Data API V2 — messages sans secrets.
 */

export type WebflowHttpErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "server_error"
  | "timeout"
  | "network"
  | "invalid_response"
  | "bad_request";

export class WebflowApiError extends Error {
  readonly code: WebflowHttpErrorCode;
  readonly status: number | null;
  readonly retryAfterSeconds: number | null;

  constructor(
    code: WebflowHttpErrorCode,
    message: string,
    options?: { status?: number | null; retryAfterSeconds?: number | null }
  ) {
    super(message);
    this.name = "WebflowApiError";
    this.code = code;
    this.status = options?.status ?? null;
    this.retryAfterSeconds = options?.retryAfterSeconds ?? null;
  }
}

export function mapWebflowHttpStatus(
  status: number,
  retryAfterHeader: string | null
): WebflowApiError {
  const retryAfterSeconds = parseRetryAfter(retryAfterHeader);

  if (status === 401) {
    return new WebflowApiError(
      "unauthorized",
      "Authentification Webflow refusée (token API invalide ou expiré).",
      { status, retryAfterSeconds }
    );
  }
  if (status === 403) {
    return new WebflowApiError(
      "forbidden",
      "Accès Webflow refusé (scopes insuffisants ou site non autorisé).",
      { status, retryAfterSeconds }
    );
  }
  if (status === 404) {
    return new WebflowApiError(
      "not_found",
      "Ressource Webflow introuvable (site ou collection).",
      { status, retryAfterSeconds }
    );
  }
  if (status === 429) {
    return new WebflowApiError(
      "rate_limited",
      retryAfterSeconds
        ? `Limite de débit Webflow atteinte. Réessayez dans ${retryAfterSeconds}s.`
        : "Limite de débit Webflow atteinte. Réessayez plus tard.",
      { status, retryAfterSeconds }
    );
  }
  if (status >= 500) {
    return new WebflowApiError(
      "server_error",
      "Erreur serveur Webflow (5xx). Réessayez plus tard.",
      { status, retryAfterSeconds }
    );
  }
  if (status >= 400) {
    return new WebflowApiError(
      "bad_request",
      "Requête Webflow refusée (paramètres invalides).",
      { status, retryAfterSeconds }
    );
  }
  return new WebflowApiError(
    "server_error",
    "Réponse Webflow inattendue.",
    { status, retryAfterSeconds }
  );
}

function parseRetryAfter(header: string | null): number | null {
  if (!header?.trim()) {
    return null;
  }
  const asInt = Number.parseInt(header.trim(), 10);
  if (Number.isFinite(asInt) && asInt >= 0) {
    return asInt;
  }
  const asDate = Date.parse(header.trim());
  if (Number.isFinite(asDate)) {
    const seconds = Math.ceil((asDate - Date.now()) / 1000);
    return seconds > 0 ? seconds : 0;
  }
  return null;
}
