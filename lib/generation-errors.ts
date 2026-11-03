export const STALE_GENERATION_MS = 30 * 60 * 1000;

export const INTERRUPTED_ERROR =
  "Génération interrompue avant sa finalisation.";

export function toStoredError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim().slice(0, 500);
  }

  return "Erreur inconnue.";
}

export function toPublicGenerationError(
  error: string | null | undefined
): string | null {
  if (!error) {
    return null;
  }

  const lower = error.toLowerCase();

  if (
    lower.includes("interrompue") ||
    lower.includes("cancelled") ||
    lower.includes("annulé")
  ) {
    return "La génération a été interrompue.";
  }

  if (
    lower.includes("wordpress") ||
    lower.includes("create_wordpress_draft") ||
    lower.includes("brouillon") ||
    lower.includes("no_draft")
  ) {
    return "Impossible de créer le brouillon WordPress.";
  }

  if (
    lower.includes("openai") ||
    lower.includes("tour") ||
    lower.includes("session") ||
    lower.includes("agent")
  ) {
    return "Erreur OpenAI pendant la génération.";
  }

  return "La génération a échoué.";
}
