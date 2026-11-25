import { db } from "../db";
import { getWorkspaceByIdOrSlug } from "../workspace";
import { scoreToTopicPriority } from "./priority";

export { scoreToTopicPriority } from "./priority";

/**
 * Ajoute une opportunité à la file Topic sans lancer la génération.
 * Idempotent si déjà added_to_queue avec topicId.
 * Conserve le workspaceId de l’opportunité (pas de conversion croisée).
 */
export async function addOpportunityToTopicQueue(opportunityId: string) {
  const opportunity = await db.seoOpportunity.findUnique({
    where: { id: opportunityId },
  });

  if (!opportunity) {
    throw new Error("Opportunité introuvable.");
  }

  if (opportunity.status === "added_to_queue" && opportunity.topicId) {
    const existing = await db.topic.findFirst({
      where: { id: opportunity.topicId, workspaceId: opportunity.workspaceId },
    });
    if (existing) {
      return { topic: existing, opportunity, alreadyAdded: true as const };
    }
  }

  const duplicateTopic = await db.topic.findFirst({
    where: {
      workspaceId: opportunity.workspaceId,
      status: { in: ["pending", "generating"] },
      subject: opportunity.subject,
    },
  });

  if (duplicateTopic) {
    const updated = await db.seoOpportunity.update({
      where: { id: opportunity.id },
      data: {
        status: "added_to_queue",
        topicId: duplicateTopic.id,
      },
    });
    return {
      topic: duplicateTopic,
      opportunity: updated,
      alreadyAdded: true as const,
    };
  }

  const workspace = await getWorkspaceByIdOrSlug(opportunity.workspaceId);
  const language =
    workspace?.defaultLanguage ??
    (workspace?.cmsProvider === "webflow" ? "en-US" : "fr");

  const notesParts = [
    opportunity.rationale ? `Justification : ${opportunity.rationale}` : null,
    opportunity.searchIntent
      ? `Intention : ${opportunity.searchIntent}`
      : null,
    opportunity.angle ? `Angle : ${opportunity.angle}` : null,
    `Thématique : ${opportunity.theme}`,
    `Langue espace : ${language}`,
    `Score priorité : ${opportunity.scoreTotal}/100`,
    opportunity.duplicateRisk
      ? `Risque doublon (lexical) : ${opportunity.duplicateRisk}`
      : null,
    `Origine : opportunité SEO ${opportunity.id}`,
  ].filter(Boolean);

  const cmsDefaults =
    workspace?.cmsProvider === "webflow"
      ? await db.workspaceCmsSettings.findUnique({
          where: { workspaceId: opportunity.workspaceId },
          select: {
            webflowDefaultCategoryItemId: true,
            webflowDefaultAuthorItemId: true,
          },
        })
      : null;

  const topic = await db.topic.create({
    data: {
      workspaceId: opportunity.workspaceId,
      subject: opportunity.subject,
      status: "pending",
      priority: scoreToTopicPriority(opportunity.scoreTotal),
      category: opportunity.theme,
      angle: opportunity.angle,
      origin: "seo_opportunity",
      sourceTitle: opportunity.title,
      notes: notesParts.join("\n"),
      webflowCategoryItemId: cmsDefaults?.webflowDefaultCategoryItemId ?? null,
      webflowAuthorItemId: cmsDefaults?.webflowDefaultAuthorItemId ?? null,
    },
  });

  const updated = await db.seoOpportunity.update({
    where: { id: opportunity.id },
    data: {
      status: "added_to_queue",
      topicId: topic.id,
    },
  });

  return { topic, opportunity: updated, alreadyAdded: false as const };
}
