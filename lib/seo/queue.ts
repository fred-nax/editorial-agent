import { db } from "../db";
import { scoreToTopicPriority } from "./priority";

export { scoreToTopicPriority } from "./priority";

/**
 * Ajoute une opportunité à la file Topic sans lancer la génération.
 * Idempotent si déjà added_to_queue avec topicId.
 */
export async function addOpportunityToTopicQueue(opportunityId: string) {
  const opportunity = await db.seoOpportunity.findUnique({
    where: { id: opportunityId },
  });

  if (!opportunity) {
    throw new Error("Opportunité introuvable.");
  }

  if (opportunity.status === "added_to_queue" && opportunity.topicId) {
    const existing = await db.topic.findUnique({
      where: { id: opportunity.topicId },
    });
    if (existing) {
      return { topic: existing, opportunity, alreadyAdded: true as const };
    }
  }

  const duplicateTopic = await db.topic.findFirst({
    where: {
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

  const notesParts = [
    opportunity.rationale ? `Justification : ${opportunity.rationale}` : null,
    opportunity.searchIntent
      ? `Intention : ${opportunity.searchIntent}`
      : null,
    `Score priorité : ${opportunity.scoreTotal}/100`,
    opportunity.duplicateRisk
      ? `Risque doublon : ${opportunity.duplicateRisk}`
      : null,
  ].filter(Boolean);

  const topic = await db.topic.create({
    data: {
      subject: opportunity.subject,
      status: "pending",
      priority: scoreToTopicPriority(opportunity.scoreTotal),
      category: opportunity.theme,
      angle: opportunity.angle,
      notes: notesParts.join("\n"),
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
