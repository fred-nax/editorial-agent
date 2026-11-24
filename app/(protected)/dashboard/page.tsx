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

  const [
    draftsThisMonth,
    draftsWordpressThisMonth,
    draftsWebflowThisMonth,
    pendingTopics,
    runningGenerations,
    llmCostThisMonth,
    recentArticles,
    recentTopics,
    recentWatchSearches,
  ] = await Promise.all([
    // Total brouillons réussis (WP historique null + wordpress + webflow).
    db.articleGeneration.count({
      where: {
        ...scope,
        status: "completed",
        createdAt: { gte: monthStart },
      },
    }),
    db.articleGeneration.count({
      where: {
        ...scope,
        status: "completed",
        createdAt: { gte: monthStart },
        OR: [{ cmsDestination: "wordpress" }, { cmsDestination: null }],
      },
    }),
    db.articleGeneration.count({
      where: {
        ...scope,
        status: "completed",
        createdAt: { gte: monthStart },
        cmsDestination: "webflow",
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
      <DashboardWelcome />

      <DashboardKpiCards
        items={[
          {
            label: "Brouillons créés ce mois",
            value: draftsThisMonth,
            hint: `WordPress ${draftsWordpressThisMonth} · Webflow ${draftsWebflowThisMonth}`,
          },
          { label: "File — en attente", value: pendingTopics },
          { label: "Générations en cours", value: runningGenerations },
          {
            label: "Coût LLM estimé du mois",
            value: formatEstimatedCost(llmCostThisMonth._sum.estimatedCost),
            hint: "Hors éventuels frais liés aux outils.",
          },
        ]}
      />

      {/* Google/GSC/GA4 : phase A rattaché à WordPress — pas de données de substitution pour Webflow. */}
      {workspace.cmsProvider === "wordpress" ? <DashboardSeoTrafficStrip /> : null}

      <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 lg:gap-5">
        <DashboardTopicPreview topics={recentTopics} />
        <DashboardEditorialWatchPreview items={watchPreviewItems} />
      </div>

      <DashboardRecentGenerations articles={recentArticles} />
    </DashboardFrame>
  );
}
