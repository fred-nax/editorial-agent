import type { Metadata } from "next";
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
import { parseWatchSnapshot } from "@/lib/veille/history";

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

  const [
    draftsThisMonth,
    pendingTopics,
    runningGenerations,
    llmCostThisMonth,
    recentArticles,
    recentTopics,
    recentWatchSearches,
  ] = await Promise.all([
    db.articleGeneration.count({
      where: {
        status: "completed",
        createdAt: { gte: monthStart },
      },
    }),
    db.topic.count({
      where: { status: "pending" },
    }),
    db.articleGeneration.count({
      where: {
        status: { in: ["queued", "running"] },
      },
    }),
    db.articleGeneration.aggregate({
      where: {
        status: "completed",
        createdAt: { gte: monthStart },
        estimatedCost: { not: null },
      },
      _sum: { estimatedCost: true },
    }),
    db.articleGeneration.findMany({
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
        estimatedCost: true,
        progressStage: true,
        error: true,
      },
    }),
    db.topic.findMany({
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
      where: { status: "completed" },
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
      <DashboardWelcome />

      <DashboardKpiCards
        items={[
          { label: "Brouillons créés ce mois", value: draftsThisMonth },
          { label: "File — en attente", value: pendingTopics },
          { label: "Générations en cours", value: runningGenerations },
          {
            label: "Coût LLM estimé du mois",
            value: formatEstimatedCost(llmCostThisMonth._sum.estimatedCost),
            hint: "Hors éventuels frais liés aux outils.",
          },
        ]}
      />

      <DashboardSeoTrafficStrip />

      <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 lg:gap-5">
        <DashboardTopicPreview topics={recentTopics} />
        <DashboardEditorialWatchPreview items={watchPreviewItems} />
      </div>

      <DashboardRecentGenerations articles={recentArticles} />
    </DashboardFrame>
  );
}
