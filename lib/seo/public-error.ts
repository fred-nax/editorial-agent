/**
 * Messages exposés à l’UI pour les recherches d’opportunités.
 * Les détails techniques (Prisma, stack) restent dans les logs serveur.
 */

export function toPublicOpportunitySearchError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Erreur recherche d’opportunités.";

  const sanitized = raw
    .replace(/postgresql:\/\/[^\s"'`]+/gi, "[db]")
    .replace(/postgres:\/\/[^\s"'`]+/gi, "[db]")
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, "[secret]")
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, "Bearer [secret]");

  if (
    /Invalid\s*`?prisma\.|prisma\.[a-zA-Z]+\.|invocation:|Unknown argument/i.test(
      sanitized
    )
  ) {
    return "La recherche d’opportunités a échoué en raison d’une erreur technique interne. Les détails ont été enregistrés côté serveur.";
  }

  if (/ECONNREFUSED|ETIMEDOUT|fetch failed|network/i.test(sanitized)) {
    return "La recherche d’opportunités a échoué (service distant indisponible). Réessayez plus tard.";
  }

  const trimmed = sanitized.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return "La recherche d’opportunités a échoué.";
  }
  return trimmed.slice(0, 280);
}
