import { db } from "../db";
import { parseStoredEditorialContext } from "../editorial-context";
import { listEditorialInventory } from "../editorial-inventory/access";
import { getWorkspaceByIdOrSlug } from "../workspace";
import { WORKSPACE_IDS } from "../workspace/constants";
import { compareEditorialSimilarity } from "./editorial-similarity";
import { compareTitleSimilarity } from "./similarity";
import type { SimilarPostMatch, SimilarTopicMatch } from "./types";

export { compareTitleSimilarity } from "./similarity";
export { compareEditorialSimilarity } from "./editorial-similarity";

const SIMILARITY_FLOOR = 0.35;

/** Angle éditorial optionnel — stocké dans `editorialContext` JSON, pas en colonne. */
function angleFromGenerationContext(editorialContext: unknown): string | null {
  return parseStoredEditorialContext(editorialContext)?.angle ?? null;
}

function scoreAgainstCorpus(
  input: {
    title: string;
    subject: string;
    angle?: string | null;
    searchIntent?: string | null;
  },
  candidate: {
    title: string;
    subject: string;
    angle?: string | null;
    searchIntent?: string | null;
    slugText?: string;
  }
): { score: number; reason: string } {
  const match = compareEditorialSimilarity(input, {
    title: candidate.title,
    subject: candidate.subject,
    angle: candidate.angle ?? null,
    searchIntent: candidate.searchIntent ?? null,
  });
  if (!candidate.slugText) {
    return { score: match.score, reason: match.reason };
  }
  const slugMatch = compareTitleSimilarity(
    `${input.title} ${input.subject}`,
    candidate.slugText
  );
  if (slugMatch.score >= match.score) {
    return { score: slugMatch.score, reason: slugMatch.reason };
  }
  return { score: match.score, reason: match.reason };
}

async function findSimilarWordPressPosts(
  input: {
    title: string;
    subject: string;
    angle?: string | null;
    searchIntent?: string | null;
  },
  workspaceId: string
): Promise<SimilarPostMatch[]> {
  const { isWordPressInventoryUsable } = await import(
    "@/lib/settings/inventory-guard"
  );
  const inventoryUsable = await isWordPressInventoryUsable();
  if (!inventoryUsable) {
    return [];
  }

  const posts = await db.wordPressPost.findMany({
    where: { workspaceId },
    select: {
      wpPostId: true,
      title: true,
      url: true,
      slug: true,
      excerpt: true,
    },
    take: 2000,
  });

  return posts
    .map((post) => {
      const { score, reason } = scoreAgainstCorpus(input, {
        title: post.title,
        subject: post.excerpt ?? post.slug.replace(/-/g, " "),
        slugText: post.slug.replace(/-/g, " "),
      });
      return {
        wpPostId: post.wpPostId,
        cmsExternalId: String(post.wpPostId),
        cmsProvider: "wordpress" as const,
        title: post.title,
        url: post.url,
        slug: post.slug,
        score: Number(score.toFixed(3)),
        reason,
      };
    })
    .filter((item) => item.score >= SIMILARITY_FLOOR)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

async function findSimilarWebflowInventory(
  input: {
    title: string;
    subject: string;
    angle?: string | null;
    searchIntent?: string | null;
  },
  workspaceId: string
): Promise<SimilarPostMatch[]> {
  // Brouillons inclus (purpose duplicates) — jamais d’inventaire WordPress.
  const { items } = await listEditorialInventory({
    workspaceId,
    purpose: "duplicates",
    take: 2000,
  });

  const generations = await db.articleGeneration.findMany({
    where: {
      workspaceId,
      cmsDestination: "webflow",
      status: { in: ["completed", "running", "pending"] },
    },
    select: {
      id: true,
      subject: true,
      title: true,
      editorialContext: true,
      cmsExternalId: true,
    },
    take: 500,
  });

  const inventoryIds = new Set(
    items.map((item) => item.cmsExternalId).filter(Boolean)
  );

  const fromInventory = items.map((item) => {
    const { score, reason } = scoreAgainstCorpus(input, {
      title: item.title,
      subject: item.excerpt ?? item.contentText?.slice(0, 400) ?? item.slug.replace(/-/g, " "),
      slugText: item.slug.replace(/-/g, " "),
    });
    return {
      wpPostId: null as number | null,
      cmsExternalId: item.cmsExternalId,
      cmsProvider: "webflow" as const,
      title: item.title,
      url: item.url ?? "",
      slug: item.slug,
      score: Number(score.toFixed(3)),
      reason,
    };
  });

  const fromGenerations = generations
    .filter(
      (gen) => !gen.cmsExternalId || !inventoryIds.has(gen.cmsExternalId)
    )
    .map((gen) => {
      const title = (gen.title ?? gen.subject).trim() || gen.subject;
      const { score, reason } = scoreAgainstCorpus(input, {
        title,
        subject: gen.subject,
        angle: angleFromGenerationContext(gen.editorialContext),
      });
      return {
        wpPostId: null as number | null,
        cmsExternalId: gen.cmsExternalId ?? `generation:${gen.id}`,
        cmsProvider: "webflow" as const,
        title,
        url: "",
        slug: "",
        score: Number(score.toFixed(3)),
        reason,
      };
    });

  return [...fromInventory, ...fromGenerations]
    .filter((item) => item.score >= SIMILARITY_FLOOR)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

async function findSimilarRegisteredOpportunities(
  input: {
    title: string;
    subject: string;
    angle?: string | null;
    searchIntent?: string | null;
  },
  workspaceId: string,
  cmsProvider: "wordpress" | "webflow"
): Promise<SimilarPostMatch[]> {
  const opportunities = await db.seoOpportunity.findMany({
    where: {
      workspaceId,
      status: { in: ["new", "reviewed", "added_to_queue"] },
    },
    select: {
      id: true,
      title: true,
      subject: true,
      angle: true,
      searchIntent: true,
    },
    take: 1000,
  });

  return opportunities
    .map((opp) => {
      const { score, reason } = scoreAgainstCorpus(input, {
        title: opp.title,
        subject: opp.subject,
        angle: opp.angle,
        searchIntent: opp.searchIntent,
      });
      return {
        wpPostId: null as number | null,
        cmsExternalId: `opportunity:${opp.id}`,
        cmsProvider,
        title: opp.title,
        url: "",
        slug: "",
        score: Number(score.toFixed(3)),
        reason: `${reason} — opportunité déjà enregistrée (similarité lexicale, pas une cannibalisation SEO).`,
      };
    })
    .filter((item) => item.score >= SIMILARITY_FLOOR)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export async function findSimilarContent(
  input: {
    title: string;
    subject: string;
    angle?: string | null;
    searchIntent?: string | null;
  },
  workspaceId: string = WORKSPACE_IDS.wordpress
): Promise<{
  similarPosts: SimilarPostMatch[];
  similarTopics: SimilarTopicMatch[];
  duplicateRisk: "none" | "low" | "medium" | "high";
}> {
  const workspace = await getWorkspaceByIdOrSlug(workspaceId);
  const cmsProvider = workspace?.cmsProvider ?? "wordpress";

  const [cmsMatches, topics, opportunityMatches] = await Promise.all([
    cmsProvider === "webflow"
      ? findSimilarWebflowInventory(input, workspaceId)
      : findSimilarWordPressPosts(input, workspaceId),
    db.topic.findMany({
      where: {
        workspaceId,
        status: { in: ["pending", "generating", "completed"] },
      },
      select: { id: true, subject: true, angle: true },
      take: 1000,
    }),
    findSimilarRegisteredOpportunities(input, workspaceId, cmsProvider),
  ]);

  const similarPosts = [...cmsMatches, ...opportunityMatches]
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
    .filter((item) => item.score >= SIMILARITY_FLOOR)
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

/** Compte inventaire CMS de l’espace (préflight opportunités). */
export async function countWorkspaceInventoryForOpportunities(
  workspaceId: string
): Promise<{ count: number; cmsProvider: "wordpress" | "webflow" }> {
  const workspace = await getWorkspaceByIdOrSlug(workspaceId);
  if (!workspace) {
    return { count: 0, cmsProvider: "wordpress" };
  }
  if (workspace.cmsProvider === "webflow") {
    const count = await db.webflowCmsItem.count({
      where: { workspaceId, missingAt: null },
    });
    return { count, cmsProvider: "webflow" };
  }
  const count = await db.wordPressPost.count({ where: { workspaceId } });
  return { count, cmsProvider: "wordpress" };
}
