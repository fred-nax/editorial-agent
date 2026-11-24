import type { Metadata } from "next";
import { ArticleHistory } from "@/components/ArticleHistory";
import {
  ArticleHistoryFilters,
  parseHistoryCmsFilter,
} from "@/components/articles/ArticleHistoryFilters";
import { db } from "@/lib/db";
import { recoverStaleGenerations } from "@/lib/generation-recovery";
import type { Prisma } from "@prisma/client";

export const metadata: Metadata = {
  title: "Historique",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ cms?: string | string[] }>;

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }
  return value?.trim() ?? "";
}

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await recoverStaleGenerations();
  const params = await searchParams;
  const cmsFilter = parseHistoryCmsFilter(firstParam(params.cms));

  const where: Prisma.ArticleGenerationWhereInput =
    cmsFilter === "webflow"
      ? { cmsDestination: "webflow" }
      : cmsFilter === "wordpress"
        ? {
            OR: [
              { cmsDestination: "wordpress" },
              { cmsDestination: null },
            ],
          }
        : {};

  const articles = await db.articleGeneration.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Historique</h1>
          <p className="mt-1 text-sm text-slate-600">
            Générations WordPress et Webflow enregistrées en base.
          </p>
        </div>
        <ArticleHistoryFilters current={cmsFilter} />
      </div>
      <ArticleHistory articles={articles} />
    </div>
  );
}
