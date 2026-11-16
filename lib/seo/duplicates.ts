import { db } from "../db";
import { compareEditorialSimilarity } from "./editorial-similarity";
import { compareTitleSimilarity } from "./similarity";
import type { SimilarPostMatch, SimilarTopicMatch } from "./types";

export { compareTitleSimilarity } from "./similarity";
export { compareEditorialSimilarity } from "./editorial-similarity";

export async function findSimilarContent(input: {
  title: string;
  subject: string;
  angle?: string | null;
  searchIntent?: string | null;
}): Promise<{
  similarPosts: SimilarPostMatch[];
  similarTopics: SimilarTopicMatch[];
  duplicateRisk: "none" | "low" | "medium" | "high";
}> {
  const { isWordPressInventoryUsable } = await import(
    "@/lib/settings/inventory-guard"
  );
  const inventoryUsable = await isWordPressInventoryUsable();

  const [posts, topics] = await Promise.all([
    inventoryUsable
      ? db.wordPressPost.findMany({
          select: {
            wpPostId: true,
            title: true,
            url: true,
            slug: true,
            excerpt: true,
          },
          take: 2000,
        })
      : Promise.resolve([]),
    db.topic.findMany({
      where: { status: { in: ["pending", "generating", "completed"] } },
      select: { id: true, subject: true, angle: true },
      take: 1000,
    }),
  ]);

  const similarPosts = posts
    .map((post) => {
      const match = compareEditorialSimilarity(
        {
          title: input.title,
          subject: input.subject,
          angle: input.angle,
          searchIntent: input.searchIntent,
        },
        {
          title: post.title,
          subject: post.excerpt ?? post.slug.replace(/-/g, " "),
          angle: null,
          searchIntent: null,
        }
      );
      const slugMatch = compareTitleSimilarity(
        `${input.title} ${input.subject}`,
        post.slug.replace(/-/g, " ")
      );
      const score = Math.max(match.score, slugMatch.score);
      const reason =
        slugMatch.score >= match.score ? slugMatch.reason : match.reason;
      return {
        wpPostId: post.wpPostId,
        title: post.title,
        url: post.url,
        slug: post.slug,
        score: Number(score.toFixed(3)),
        reason,
      };
    })
    .filter((item) => item.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const similarTopics = topics
    .map((topic) => {
      const match = compareEditorialSimilarity(
        {
          title: input.title,
          subject: input.subject,
          angle: input.angle,
          searchIntent: input.searchIntent,
        },
        {
          title: topic.subject,
          subject: topic.subject,
          angle: topic.angle,
          searchIntent: null,
        }
      );
      return {
        topicId: topic.id,
        subject: topic.subject,
        score: Number(match.score.toFixed(3)),
        reason: match.reason,
      };
    })
    .filter((item) => item.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const top = Math.max(
    similarPosts[0]?.score ?? 0,
    similarTopics[0]?.score ?? 0
  );

  let duplicateRisk: "none" | "low" | "medium" | "high" = "none";
  if (top >= 0.85) {
    duplicateRisk = "high";
  } else if (top >= 0.55) {
    duplicateRisk = "medium";
  } else if (top >= 0.35) {
    duplicateRisk = "low";
  }

  return { similarPosts, similarTopics, duplicateRisk };
}
