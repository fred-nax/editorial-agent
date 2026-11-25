import { db } from "@/lib/db";
import { logInfo } from "@/lib/logger";
import { assertWorkspaceId, workspaceWhere } from "@/lib/workspace";

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
      where?: {
        workspaceId?: string;
        topicId?: { not: null };
      };
    }) => Promise<number>;
  };
  opportunitySearchRun: {
    count: (args?: {
      where?: { workspaceId?: string; status?: string };
    }) => Promise<number>;
  };
};

type ResetTx = {
  opportunitySearchRun: {
    count: (args: {
      where: { workspaceId: string; status: string };
    }) => Promise<number>;
    deleteMany: (args: {
      where: { workspaceId: string };
    }) => Promise<{ count: number }>;
  };
  seoOpportunity: {
    deleteMany: (args: {
      where: { workspaceId: string };
    }) => Promise<{ count: number }>;
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
 * Aperçu avant réinitialisation (scopé à un espace éditorial).
 * Ne lit que SeoOpportunity + OpportunitySearchRun.
 */
export async function previewSeoSearchReset(
  workspaceId: string,
  client: CountClient = db as unknown as CountClient
): Promise<SeoResetPreview> {
  const scopedId = assertWorkspaceId(workspaceId);
  const scope = workspaceWhere(scopedId);

  const [opportunityCount, searchRunCount, runningSearchCount, linkedTopicRefs] =
    await Promise.all([
      client.seoOpportunity.count({ where: scope }),
      client.opportunitySearchRun.count({ where: scope }),
      client.opportunitySearchRun.count({
        where: { ...scope, status: "running" },
      }),
      client.seoOpportunity.count({
        where: { ...scope, topicId: { not: null } },
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
 * Supprime uniquement les opportunités SEO et les runs de recherche de l’espace.
 * Transaction sécurisée — aucune cascade vers Topic, ResearchConfig, CustomTheme, WordPress.
 */
export async function resetSeoSearches(
  workspaceId: string,
  client: ResetClient = db as unknown as ResetClient
): Promise<SeoResetResult> {
  const scopedId = assertWorkspaceId(workspaceId);
  const scope = workspaceWhere(scopedId);

  const result = await client.$transaction(async (tx) => {
    const running = await tx.opportunitySearchRun.count({
      where: { ...scope, status: "running" },
    });
    const blocked = blockReasonIfRunning(running);
    if (blocked) {
      throw new Error(
        "Une recherche SEO est encore en cours. Réinitialisation refusée."
      );
    }

    // Pas de FK Prisma entre SeoOpportunity.searchRunId et OpportunitySearchRun :
    // on efface d’abord les opportunités, puis les runs.
    const deletedOpportunities = await tx.seoOpportunity.deleteMany({
      where: scope,
    });
    const deletedSearchRuns = await tx.opportunitySearchRun.deleteMany({
      where: scope,
    });

    return {
      deletedOpportunities: deletedOpportunities.count,
      deletedSearchRuns: deletedSearchRuns.count,
    };
  });

  logInfo("seo-reset", "seo searches reset", {
    workspaceId: scopedId,
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
