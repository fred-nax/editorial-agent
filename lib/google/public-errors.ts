/**
 * Messages d’erreur Google destinés à l’UI — jamais de chemins, Prisma brut, Turbopack.
 */

const TECHNICAL_MARKERS = [
  /Invalid `.*` invocation/i,
  /TURBOPACK/i,
  /\.next[\\/]/i,
  /prisma/i,
  /node_modules/i,
  /D:\\/i,
  /\/Users\//i,
  /\/home\//i,
  /postgresql:\/\//i,
  /at\s+\S+\s+\(/i,
  /Unknown argument/i,
  /Argument `[^`]+` is missing/i,
  /Foreign key constraint/i,
  /Unique constraint failed/i,
];

export type GooglePublicErrorKind =
  | "gsc_sync"
  | "ga4_sync"
  | "google_sync"
  | "google_auth"
  | "google_generic";

const DEFAULT_MESSAGES: Record<GooglePublicErrorKind, string> = {
  gsc_sync:
    "La synchronisation Google Search Console a échoué. Les dernières données synchronisées restent disponibles.",
  ga4_sync:
    "La synchronisation Google Analytics a échoué. Les dernières données synchronisées restent disponibles.",
  google_sync:
    "La synchronisation Google a échoué. Les dernières données synchronisées restent disponibles.",
  google_auth:
    "La connexion Google est invalide ou a expiré. Reconnectez Google dans les paramètres.",
  google_generic: "Une erreur Google est survenue. Réessayez ou reconnectez le compte.",
};

/** Indique si le texte contient des détails techniques à ne pas exposer. */
export function isTechnicalGoogleError(message: string | null | undefined): boolean {
  if (!message) {
    return false;
  }
  return TECHNICAL_MARKERS.some((re) => re.test(message));
}

/**
 * Convertit une erreur brute (Prisma, API, OAuth…) en message utilisateur sûr.
 * Conservez le détail complet uniquement dans les logs serveur.
 */
export function toPublicGoogleError(
  error: unknown,
  kind: GooglePublicErrorKind = "google_generic"
): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  if (!raw.trim()) {
    return DEFAULT_MESSAGES[kind];
  }

  const lower = raw.toLowerCase();
  if (
    lower.includes("token") &&
    (lower.includes("expired") ||
      lower.includes("revoked") ||
      lower.includes("invalid"))
  ) {
    return DEFAULT_MESSAGES.google_auth;
  }
  if (lower.includes("insufficient") || lower.includes("permission")) {
    return "Permissions Google insuffisantes pour cette opération. Vérifiez les accès du compte connecté.";
  }
  if (lower.includes("quota") || lower.includes("rate limit") || lower.includes("429")) {
    return "Quota Google temporairement dépassé. Réessayez plus tard.";
  }
  if (
    lower.includes("search console") ||
    lower.includes("webmaster") ||
    lower.includes("gsc")
  ) {
    return DEFAULT_MESSAGES.gsc_sync;
  }
  if (lower.includes("analytics") || lower.includes("ga4")) {
    return DEFAULT_MESSAGES.ga4_sync;
  }

  if (isTechnicalGoogleError(raw)) {
    if (lower.includes("gscpage") || lower.includes("search console")) {
      return DEFAULT_MESSAGES.gsc_sync;
    }
    if (lower.includes("ga4")) {
      return DEFAULT_MESSAGES.ga4_sync;
    }
    return DEFAULT_MESSAGES.google_sync;
  }

  // Message métier déjà court et sûr.
  if (raw.length <= 220 && !isTechnicalGoogleError(raw)) {
    return raw.slice(0, 220);
  }

  return DEFAULT_MESSAGES[kind];
}

/** Pour l’affichage UI d’erreurs déjà persistées (historique). */
export function sanitizeStoredGoogleError(
  stored: string | null | undefined,
  kind: GooglePublicErrorKind = "google_sync"
): string | null {
  if (!stored) {
    return null;
  }
  if (isTechnicalGoogleError(stored) || stored.length > 220) {
    return toPublicGoogleError(stored, kind);
  }
  return stored;
}
