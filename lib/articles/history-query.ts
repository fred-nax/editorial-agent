/**
 * Lecture paginée de l’historique des générations (PERF-001).
 * Jamais de colonnes lourdes (trace, editorialContext, contenu).
 */

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { workspaceWhere } from "@/lib/workspace";

export const ARTICLE_HISTORY_SELECT = {
  id: true,
  subject: true,
  title: true,
  status: true,
  createdAt: true,
  wpPostId: true,
  cmsDestination: true,
  cmsExternalId: true,
  estimatedCost: true,
  progressStage: true,
} as const satisfies Prisma.ArticleGenerationSelect;

export type ArticleHistoryRow = Prisma.ArticleGenerationGetPayload<{
  select: typeof ARTICLE_HISTORY_SELECT;
}>;

export const ARTICLE_HISTORY_PAGE_SIZES = [20, 50, 100] as const;
export const DEFAULT_ARTICLE_HISTORY_PAGE_SIZE = 20;

export function parseArticleHistoryPage(raw: string | null | undefined): number {
  const n = Number(raw ?? "1");
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export function parseArticleHistoryPageSize(
  raw: string | null | undefined
): number {
  const n = Number(raw ?? String(DEFAULT_ARTICLE_HISTORY_PAGE_SIZE));
  if (ARTICLE_HISTORY_PAGE_SIZES.includes(n as (typeof ARTICLE_HISTORY_PAGE_SIZES)[number])) {
    return n;
  }
  return DEFAULT_ARTICLE_HISTORY_PAGE_SIZE;
}

export async function listArticleHistory(input: {
  workspaceId: string;
  page?: number;
  pageSize?: number;
  status?: string | null;
  q?: string | null;
}): Promise<{
  articles: ArticleHistoryRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}> {
  const pageSize = parseArticleHistoryPageSize(
    input.pageSize != null ? String(input.pageSize) : undefined
  );
  let page = Math.max(1, input.page ?? 1);

  const where: Prisma.ArticleGenerationWhereInput = {
    ...workspaceWhere(input.workspaceId),
  };

  if (input.status?.trim() && input.status !== "all") {
    where.status = input.status.trim() as Prisma.EnumGenerationStatusFilter;
  }

  const q = input.q?.trim();
  if (q) {
    where.OR = [
      { subject: { contains: q, mode: "insensitive" } },
      { title: { contains: q, mode: "insensitive" } },
    ];
  }

  const total = await db.articleGeneration.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  if (page > pageCount) {
    page = pageCount;
  }

  const articles = await db.articleGeneration.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: ARTICLE_HISTORY_SELECT,
  });

  return { articles, total, page, pageSize, pageCount };
}
