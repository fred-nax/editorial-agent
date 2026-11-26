import type { Metadata } from "next";
import Link from "next/link";
import {
  DashboardEditorialWatchPreview,
  type EditorialWatchPreviewItem,
} from "@/components/dashboard/editorial-watch-preview";
import { DashboardFrame } from "@/components/dashboard/frame";
import { DashboardKpiCards } from "@/components/dashboard/kpi-cards";
import { DashboardRecentGenerations } from "@/components/dashboard/recent-generations";
import { DashboardSeoTrafficStrip } from "@/components/dashboard/seo-traffic-strip";
import { DashboardTopicPreview } from "@/components/dashboard/topic-preview";
import { DashboardWelcome } from "@/components/dashboard/DashboardWelcome";
import { db } from "@/lib/db";
import { formatEstimatedCost } from "@/lib/format";
import { recoverStaleGenerations } from "@/lib/generation-recovery";
import {
  getUsageSummary,
  resolveUsagePeriod,
} from "@/lib/openai-usage-aggregate";
import { parseWatchSnapshot } from "@/lib/veille/history";
import { resolveActiveWorkspace, workspaceWhere } from "@/lib/workspace";

export const metadata: Metadata = {
  title: "Dashboard",
};

export const dynamic = "force-dynamic";

function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Publications persistées dans EditorialWatchSearch.results (pas les suggestions SEO éphémères). */
function recentWatchPublications(
  rows: Array<{ searchedAt: Date; results: unknown }>
): EditorialWatchPreviewItem[] {
  const items: EditorialWatchPreviewItem[] = [];
  const seenUrls = new Set<string>();

  for (const row of rows) {
    const snapshot = parseWatchSnapshot(row.results);
    if (!snapshot) {
      continue;
    }
    for (const article of snapshot.articles) {
      const urlKey = article.url.toLowerCase();
      if (seenUrls.has(urlKey)) {
        continue;
      }
      seenUrls.add(urlKey);
      items.push({
        title: article.title,
        sourceName: article.sourceName,
        kind: article.kind,
        detectedAt: row.searchedAt,
        publishedOn: article.publishedOn,
      });
      if (items.length >= 3) {
        return items;
      }
    }
  }

  return items;
}

export default async function DashboardPage() {
  await recoverStaleGenerations();
  const monthStart = startOfCurrentMonth();
  const workspace = await resolveActiveWorkspace();
  const scope = workspaceWhere(workspace.id);
  const cmsLabel =
    workspace.cmsProvider === "webflow" ? "Webflow" : "WordPress";
  const siteCaption =
    workspace.siteLabel?.trim() ||
    workspace.siteUrl?.replace(/^https?:\/\//i, "").replace(/\/$/, "") ||
    cmsLabel;

  const monthPeriod = resolveUsagePeriod({
    preset: "custom",
    from: monthStart.toISOString(),
    to: new Date().toISOString(),
  });

  const [
    draftsThisMonth,
    pendingTopics,
    runningGenerations,
    llmCostThisMonth,
    usageMonth,
    recentArticles,
    recentTopics,
    recentWatchSearches,
  ] = await Promise.all([
    db.articleGeneration.count({
      where: {
        ...scope,
        status: "completed",
        createdAt: { gte: monthStart },
      },
    }),
    db.topic.count({
      where: { ...scope, status: "pending" },
    }),
    db.articleGeneration.count({
      where: {
        ...scope,
        status: { in: ["queued", "running"] },
      },
    }),
    db.articleGeneration.aggregate({
      where: {
        ...scope,
        status: "completed",
        createdAt: { gte: monthStart },
        estimatedCost: { not: null },
      },
      _sum: { estimatedCost: true },
    }),
    getUsageSummary({
      workspaceId: workspace.id,
      from: monthPeriod.from,
      to: monthPeriod.to,
      operationType: "all",
      model: "all",
      status: "all",
      completeness: "all",
    }),
    db.articleGeneration.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        subject: true,
        title: true,
        status: true,
        createdAt: true,
        wpPostId: true,
        wpUrl: true,
        cmsDestination: true,
        cmsExternalId: true,
        estimatedCost: true,
        progressStage: true,
        error: true,
      },
    }),
    db.topic.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true,
        subject: true,
        status: true,
        origin: true,
        createdAt: true,
      },
    }),
    db.editorialWatchSearch.findMany({
      where: { ...scope, status: "completed" },
      orderBy: { searchedAt: "desc" },
      take: 8,
      select: {
        searchedAt: true,
        results: true,
      },
    }),
  ]);

  const watchPreviewItems = recentWatchPublications(recentWatchSearches);

  return (
    <DashboardFrame>
      <DashboardWelcome
        workspaceName={workspace.name}
        cmsLabel={cmsLabel}
        siteCaption={siteCaption}
      />

      <DashboardKpiCards
        items={[
          {
            label: "Brouillons créés ce mois",
            value: draftsThisMonth,
            hint: `Espace ${workspace.name}`,
          },
          { label: "File — en attente", value: pendingTopics },
          { label: "Générations en cours", value: runningGenerations },
          {
            label: "Coût LLM estimé du mois",
            value: formatEstimatedCost(llmCostThisMonth._sum.estimatedCost),
            hint: "Somme des estimations LLM historiques connues (ArticleGeneration) — hors images/tools.",
          },
        ]}
      />

      <div className="rounded-2xl border border-[#D7EAF6] bg-[#EDF7FD] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-700">
              Coût OpenAI consolidé connu (mois)
            </p>
            <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
              {usageMonth.knownEstimatedCostLabel}
            </p>
            <p className="mt-1 max-w-2xl text-xs text-slate-600">
              Estimation locale connue — registre :{" "}
              {usageMonth.registryEventCount} événement(s) (
              {formatEstimatedCost(usageMonth.registryKnownCostUsd)}) ; LLM
              historiques : {usageMonth.legacyLlmCount} (
              {formatEstimatedCost(usageMonth.legacyLlmCostUsd)}). Ce n’est pas
              une facture OpenAI.
            </p>
          </div>
          <Link
            href="/usage"
            className="rounded-md border border-[#0F5270]/30 bg-white px-3 py-2 text-sm font-medium text-[#0F5270] hover:bg-white/80"
          >
            Voir Consommation
          </Link>
        </div>
      </div>

      {/* V7.14.1 : GSC + GA4 par espace. Jamais de données d’un autre espace. */}
      <DashboardSeoTrafficStrip workspaceId={workspace.id} />

      <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 lg:gap-5">
        <DashboardTopicPreview topics={recentTopics} />
        <DashboardEditorialWatchPreview items={watchPreviewItems} />
      </div>

      <DashboardRecentGenerations articles={recentArticles} />
    </DashboardFrame>
  );
}
