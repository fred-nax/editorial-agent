export type TopicDeleteStatus =
  | "pending"
  | "generating"
  | "completed"
  | "archived";

export type TopicDeleteDecision =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Règles de suppression d’un sujet de la file éditoriale.
 * Ne touche jamais ArticleGeneration ni WordPress.
 */
export function decideTopicDeletion(input: {
  status: TopicDeleteStatus;
  linkedGenerationCount: number;
}): TopicDeleteDecision {
  if (input.status === "generating") {
    return {
      ok: false,
      status: 409,
      error: "Impossible de supprimer un sujet en cours de génération.",
    };
  }

  if (input.linkedGenerationCount > 0) {
    return {
      ok: false,
      status: 409,
      error:
        "Ce sujet est lié à une génération. Archivez-le plutôt que de le supprimer.",
    };
  }

  if (input.status !== "pending" && input.status !== "archived") {
    return {
      ok: false,
      status: 409,
      error: "Seul un sujet non généré peut être supprimé.",
    };
  }

  return { ok: true };
}
