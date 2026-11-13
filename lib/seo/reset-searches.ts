import { db } from "@/lib/db";
import { logInfo } from "@/lib/logger";

export type SeoResetPreview = {
  opportunityCount: number;
  searchRunCount: number;
  runningSearchCount: number;
  /** Nombre d’opportunités liées à un Topic (référence souple topicId) — Topics non touchés. */
  linkedTopicRefs: number;
  canReset: boolean;
  blockReason: string | null;
};

export type SeoResetResult = {
  deletedOpportunities: number;
  deletedSearchRuns: number;
  preserved: {
    researchConfigs: true;
    topics: true;
    customThemes: true;
    wordPressPosts: true;
  };
};

type CountClient = {
  seoOpportunity: {
    count: (args?: {
      where?: { topicId?: { not: null } };
    }) => Promise<number>;
  };
  opportunitySearchRun: {
    count: (args?: { where?: { status?: string } }) => Promise<number>;
  };
};

type ResetTx = {
  opportunitySearchRun: {
    count: (args: { where: { status: string } }) => Promise<number>;
    deleteMany: (args?: Record<string, never>) => Promise<{ count: number }>;
  };
  seoOpportunity: {
    deleteMany: (args?: Record<string, never>) => Promise<{ count: number }>;
  };
};

type ResetClient = {
  $transaction: <T>(fn: (tx: ResetTx) => Promise<T>) => Promise<T>;
};

export function blockReasonIfRunning(runningSearchCount: number): string | null {
  if (runningSearchCount > 0) {
    return "Une recherche SEO est encore en cours. Attendez sa fin avant de réinitialiser.";
  }
  return null;
}

/**
 * Aperçu avant réinitialisation.
 * Ne lit que SeoOpportunity + OpportunitySearchRun.
 */
export async function previewSeoSearchReset(
  client: CountClient = db as unknown as CountClient
): Promise<SeoResetPreview> {
  const [opportunityCount, searchRunCount, runningSearchCount, linkedTopicRefs] =
    await Promise.all([
      client.seoOpportunity.count(),
      client.opportunitySearchRun.count(),
      client.opportunitySearchRun.count({ where: { status: "running" } }),
      client.seoOpportunity.count({
        where: { topicId: { not: null } },
      }),
    ]);

  const blockReason = blockReasonIfRunning(runningSearchCount);
  return {
    opportunityCount,
    searchRunCount,
    runningSearchCount,
    linkedTopicRefs,
    canReset: blockReason === null,
    blockReason,
  };
}

/**
 * Supprime uniquement les opportunités SEO et les runs de recherche.
 * Transaction sécurisée — aucune cascade vers Topic, ResearchConfig, CustomTheme, WordPress.
 */
export async function resetSeoSearches(
  client: ResetClient = db as unknown as ResetClient
): Promise<SeoResetResult> {
  const result = await client.$transaction(async (tx) => {
    const running = await tx.opportunitySearchRun.count({
      where: { status: "running" },
    });
    const blocked = blockReasonIfRunning(running);
    if (blocked) {
      throw new Error(
        "Une recherche SEO est encore en cours. Réinitialisation refusée."
      );
    }

    // Pas de FK Prisma entre SeoOpportunity.searchRunId et OpportunitySearchRun :
    // on efface d’abord les opportunités, puis les runs.
    const deletedOpportunities = await tx.seoOpportunity.deleteMany({});
    const deletedSearchRuns = await tx.opportunitySearchRun.deleteMany({});

    return {
      deletedOpportunities: deletedOpportunities.count,
      deletedSearchRuns: deletedSearchRuns.count,
    };
  });

  logInfo("seo-reset", "seo searches reset", {
    deletedOpportunities: result.deletedOpportunities,
    deletedSearchRuns: result.deletedSearchRuns,
  });

  return {
    ...result,
    preserved: {
      researchConfigs: true,
      topics: true,
      customThemes: true,
      wordPressPosts: true,
    },
  };
}
