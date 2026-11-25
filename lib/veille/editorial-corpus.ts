import { db } from "../db";
import { assertWorkspaceId } from "../workspace/scope";
import { getWorkspaceByIdOrSlug } from "../workspace/context";
import { getWordPressInventoryDiagnostic } from "../seo/wordpress-inventory";
import {
  checkProposals,
  resolveInventoryCoverage,
  type CorpusRecord,
  type EditorialCorpus,
  type InventoryCoverage,
  type ProposalDuplicateResult,
  type ProposalInput,
} from "./editorial-duplicates";

const POST_LIMIT = 2000;
const TOPIC_LIMIT = 1000;
const GENERATION_LIMIT = 1000;
const KNOWN_POST_STATUSES = ["publish", "draft", "pending", "future", "private"];

function httpUrl(value: string | null | undefined): string | null {
  if (!value || !/^https?:\/\//i.test(value)) {
    return null;
  }
  return value;
}

/**
 * Charge le corpus éditorial d’un espace.
 * Webflow : topics + générations uniquement (jamais l’inventaire WordPress).
 */
export async function loadEditorialCorpus(
  workspaceId: string
): Promise<EditorialCorpus> {
  const id = assertWorkspaceId(workspaceId);
  const workspace = await getWorkspaceByIdOrSlug(id);
  if (!workspace || !workspace.enabled) {
    throw new Error("Espace éditorial absent ou incohérent pour le corpus.");
  }

  const includeWordPressInventory = workspace.cmsProvider === "wordpress";

  const { isWordPressInventoryUsable } = await import(
    "@/lib/settings/inventory-guard"
  );
  const inventoryUsable =
    includeWordPressInventory && (await isWordPressInventoryUsable());

  const [diagnostic, postCount, topicCount, generationCount, posts, topics, generations] =
    await Promise.all([
      includeWordPressInventory
        ? getWordPressInventoryDiagnostic(id)
        : Promise.resolve({
            count: 0,
            byStatus: {} as Record<string, number>,
            lastSync: null,
            running: null,
          }),
      inventoryUsable
        ? db.wordPressPost.count({
            where: { workspaceId: id, status: { in: KNOWN_POST_STATUSES } },
          })
        : Promise.resolve(0),
      db.topic.count({ where: { workspaceId: id, status: { not: "archived" } } }),
      db.articleGeneration.count({
        where: { workspaceId: id, status: { in: ["completed", "failed"] } },
      }),
      inventoryUsable
        ? db.wordPressPost.findMany({
            where: { workspaceId: id, status: { in: KNOWN_POST_STATUSES } },
            select: {
              wpPostId: true,
              title: true,
              slug: true,
              url: true,
              excerpt: true,
              status: true,
            },
            take: POST_LIMIT,
          })
        : Promise.resolve([]),
      db.topic.findMany({
        where: { workspaceId: id, status: { not: "archived" } },
        select: { id: true, subject: true, angle: true, status: true },
        take: TOPIC_LIMIT,
      }),
      db.articleGeneration.findMany({
        where: { workspaceId: id, status: { in: ["completed", "failed"] } },
        select: {
          id: true,
          subject: true,
          title: true,
          slug: true,
          excerpt: true,
          wpPostId: true,
          wpUrl: true,
          topicId: true,
          status: true,
          cmsExternalId: true,
        },
        take: GENERATION_LIMIT,
      }),
    ]);
  const truncated =
    postCount > posts.length || topicCount > topics.length || generationCount > generations.length;
  const coverage = resolveInventoryCoverage({
    count: diagnostic.count,
    running: Boolean(diagnostic.running),
    truncated,
    lastSync: diagnostic.lastSync
      ? {
          status: diagnostic.lastSync.status,
          mode: diagnostic.lastSync.mode,
          expectedTotal: diagnostic.lastSync.expectedTotal,
          fetchedCount: diagnostic.lastSync.fetchedCount,
          diagnosticNote: diagnostic.lastSync.diagnosticNote,
        }
      : null,
  });
  const records: CorpusRecord[] = [
    ...posts.map((post) => ({
      source: "wordpress" as const,
      title: post.title,
      subject: post.excerpt?.trim() || post.slug.replaceAll("-", " "),
      angle: null,
      intent: null,
      url: httpUrl(post.url),
      slug: post.slug,
      wpPostId: post.wpPostId,
      topicId: null,
      generationTopicId: null,
    })),
    ...topics.map((topic) => ({
      source: "topic" as const,
      title: topic.subject,
      subject: topic.subject,
      angle: topic.angle,
      intent: null,
      url: null,
      slug: null,
      wpPostId: null,
      topicId: topic.id,
      generationTopicId: null,
    })),
    ...generations
      .filter(
        (generation) =>
          generation.status === "completed" ||
          generation.wpPostId !== null ||
          Boolean(generation.cmsExternalId)
      )
      .map((generation) => ({
        source: "generation" as const,
        title: generation.title?.trim() || generation.subject,
        subject: generation.excerpt?.trim() || generation.subject,
        angle: null,
        intent: null,
        url: httpUrl(generation.wpUrl),
        slug: generation.slug,
        wpPostId: generation.wpPostId,
        topicId: null,
        generationTopicId: generation.topicId,
      })),
  ];
  return { records, ...coverage };
}

export async function assessVeilleProposal(
  input: ProposalInput,
  workspaceId: string
): Promise<{
  result: ProposalDuplicateResult;
  coverage: InventoryCoverage;
  coverageNote: string;
  verified: boolean;
}> {
  const id = assertWorkspaceId(workspaceId);
  const corpus = await loadEditorialCorpus(id);
  const [result] = checkProposals([input], corpus);
  return {
    result,
    coverage: corpus.coverage,
    coverageNote: corpus.coverageNote,
    verified: corpus.verified,
  };
}
