import { db } from "../db";
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

export async function loadEditorialCorpus(): Promise<EditorialCorpus> {
  const { isWordPressInventoryUsable } = await import(
    "@/lib/settings/inventory-guard"
  );
  const inventoryUsable = await isWordPressInventoryUsable();

  const [diagnostic, postCount, topicCount, generationCount, posts, topics, generations] =
    await Promise.all([
      getWordPressInventoryDiagnostic(),
      inventoryUsable
        ? db.wordPressPost.count({
            where: { status: { in: KNOWN_POST_STATUSES } },
          })
        : Promise.resolve(0),
      db.topic.count({ where: { status: { not: "archived" } } }),
      db.articleGeneration.count({
        where: { status: { in: ["completed", "failed"] } },
      }),
      inventoryUsable
        ? db.wordPressPost.findMany({
            where: { status: { in: KNOWN_POST_STATUSES } },
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
        where: { status: { not: "archived" } },
        select: { id: true, subject: true, angle: true, status: true },
        take: TOPIC_LIMIT,
      }),
      db.articleGeneration.findMany({
        where: { status: { in: ["completed", "failed"] } },
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
      .filter((generation) => generation.status === "completed" || generation.wpPostId !== null)
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

export async function assessVeilleProposal(input: ProposalInput): Promise<{
  result: ProposalDuplicateResult;
  coverage: InventoryCoverage;
  coverageNote: string;
  verified: boolean;
}> {
  const corpus = await loadEditorialCorpus();
  const [result] = checkProposals([input], corpus);
  return {
    result,
    coverage: corpus.coverage,
    coverageNote: corpus.coverageNote,
    verified: corpus.verified,
  };
}
