import { db } from "@/lib/db";
import {
  aggregateGscRows,
  formatUtcDate,
  periodStart,
  resolveAvailablePeriod,
  seriesFromDaily,
  type PeriodKey,
} from "@/lib/google/aggregates";
import { aiSourceLabel, isAiSourceKey } from "@/lib/google/ai-referrers";
import { getGoogleConnection } from "@/lib/google/connection";
import {
  buildPropertyDailySeries,
  enrichTopPages,
  indexLatestArticleIdByWpPostId,
  indexPublishedPostsByNorm,
  type DashboardTopPageView,
  type PropertyDailyPoint,
} from "@/lib/google/dashboard-presentation";

async function latestPropertyStatDate(
  propertyUrl: string
): Promise<Date | null> {
  const latest = await db.gscPropertyDailyStat.findFirst({
    where: { propertyUrl, hasData: true },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  return latest?.date ?? null;
}

async function latestPageStatDate(
  propertyUrl: string,
  pageUrlNorm?: string
): Promise<Date | null> {
  const latest = await db.gscPageDailyStat.findFirst({
    where: {
      propertyUrl,
      hasData: true,
      ...(pageUrlNorm ? { pageUrlNorm } : {}),
    },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  return latest?.date ?? null;
}

function wsScope(workspaceId?: string): { workspaceId: string } | Record<string, never> {
  return workspaceId != null && workspaceId.length > 0
    ? { workspaceId }
    : {};
}

function endOfTodayUTC(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

export async function getPagePerformance(input: {
  pageUrlNorm: string;
  periodDays: PeriodKey;
  workspaceId?: string;
}) {
  const connection = await getGoogleConnection(input.workspaceId);
  const selection = connection?.selection;
  const gscProperty = selection?.gscPropertyUrl ?? null;
  const ga4Property = selection?.ga4PropertyId ?? null;

  const latestGsc =
    (gscProperty
      ? (await latestPropertyStatDate(gscProperty)) ??
        (await latestPageStatDate(gscProperty, input.pageUrlNorm))
      : null) ?? null;
  const gscPeriod = resolveAvailablePeriod(latestGsc, input.periodDays);
  const gscStart = gscPeriod?.start ?? null;
  const gscEnd = gscPeriod?.end ?? null;

  // GA4 inchangé : fenêtre glissante jusqu’à aujourd’hui (hors consolidation GSC).
  const ga4End = endOfTodayUTC();
  const ga4Start = periodStart(input.periodDays, ga4End);

  const [gscRows, queryRows, ga4Rows, sourceRows] = await Promise.all([
    gscProperty && gscStart && gscEnd
      ? db.gscPageDailyStat.findMany({
          where: {
            propertyUrl: gscProperty,
            pageUrlNorm: input.pageUrlNorm,
            date: { gte: gscStart, lte: gscEnd },
          },
          orderBy: { date: "asc" },
        })
      : Promise.resolve([]),
    gscProperty && gscStart && gscEnd
      ? db.gscQueryDailyStat.findMany({
          where: {
            propertyUrl: gscProperty,
            pageUrlNorm: input.pageUrlNorm,
            date: { gte: gscStart, lte: gscEnd },
          },
        })
      : Promise.resolve([]),
    ga4Property
      ? db.ga4PageDailyStat.findMany({
          where: {
            propertyId: ga4Property,
            pageUrlNorm: input.pageUrlNorm,
            date: { gte: ga4Start, lte: ga4End },
          },
          orderBy: { date: "asc" },
        })
      : Promise.resolve([]),
    ga4Property
      ? db.ga4PageSourceDailyStat.findMany({
          where: {
            propertyId: ga4Property,
            pageUrlNorm: input.pageUrlNorm,
            date: { gte: ga4Start, lte: ga4End },
          },
        })
      : Promise.resolve([]),
  ]);

  const gsc = aggregateGscRows(gscRows);
  const gscSeries =
    gscStart && gscEnd
      ? seriesFromDaily(
          gscRows.map((r) => ({ date: r.date, value: r.clicks })),
          gscStart,
          gscEnd
        )
      : [];

  const queryAgg = new Map<
    string,
    { query: string; clicks: number; impressions: number; positionWeighted: number }
  >();
  for (const row of queryRows) {
    const cur = queryAgg.get(row.query) ?? {
      query: row.query,
      clicks: 0,
      impressions: 0,
      positionWeighted: 0,
    };
    cur.clicks += row.clicks;
    cur.impressions += row.impressions;
    cur.positionWeighted += row.position * row.impressions;
    queryAgg.set(row.query, cur);
  }
  const topQueries = [...queryAgg.values()]
    .map((q) => ({
      query: q.query,
      clicks: q.clicks,
      impressions: q.impressions,
      ctr: q.impressions > 0 ? q.clicks / q.impressions : null,
      position: q.impressions > 0 ? q.positionWeighted / q.impressions : null,
    }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10);

  const sessions = ga4Rows.reduce((sum, r) => sum + r.sessions, 0);
  const aiSessions = ga4Rows.reduce((sum, r) => sum + r.aiSessions, 0);
  const ga4Series = seriesFromDaily(
    ga4Rows.map((r) => ({ date: r.date, value: r.sessions })),
    ga4Start,
    ga4End
  );

  const bySource = new Map<string, number>();
  for (const row of sourceRows) {
    bySource.set(row.sourceKey, (bySource.get(row.sourceKey) ?? 0) + row.sessions);
  }
  const aiBreakdown = [...bySource.entries()]
    .filter(([key]) => isAiSourceKey(key))
    .map(([key, value]) => ({
      key,
      label: aiSourceLabel(key),
      sessions: value,
    }))
    .sort((a, b) => b.sessions - a.sessions);

  return {
    periodDays: input.periodDays,
    periodStart: gscStart ? formatUtcDate(gscStart) : null,
    periodEnd: gscEnd ? formatUtcDate(gscEnd) : null,
    connected: Boolean(connection && connection.status === "connected"),
    hasGscProperty: Boolean(gscProperty),
    hasGa4Property: Boolean(ga4Property),
    gsc: {
      ...gsc,
      hasAnyRow: gscRows.length > 0,
      series: gscSeries,
      topQueries,
    },
    ga4: {
      sessions,
      aiSessions,
      hasAnyRow: ga4Rows.length > 0,
      series: ga4Series,
      aiBreakdown,
    },
  };
}

export async function getDashboardSeoSummary(
  periodDays: PeriodKey = 28,
  workspaceId?: string
) {
  const connection = await getGoogleConnection(workspaceId);
  const selection = connection?.selection;
  const gscProperty = selection?.gscPropertyUrl ?? null;
  const ga4Property = selection?.ga4PropertyId ?? null;

  if (!connection || connection.status !== "connected") {
    return {
      connected: false,
      hasGscProperty: Boolean(gscProperty),
      hasGa4Property: Boolean(ga4Property),
      gsc: null,
      aiSessions: 0,
      topPages: [] as DashboardTopPageView[],
      propertySeries: [] as PropertyDailyPoint[],
      periodDays,
      periodStart: null as string | null,
      periodEnd: null as string | null,
      lastSyncAt: null as string | null,
    };
  }

  const latest = gscProperty
    ? await latestPropertyStatDate(gscProperty)
    : null;
  const period = resolveAvailablePeriod(latest, periodDays);
  const start = period?.start ?? null;
  const end = period?.end ?? null;

  // KPI globaux : exclusivement GscPropertyDailyStat (jamais la somme des pages).
  const propertyRows =
    gscProperty && start && end
      ? await db.gscPropertyDailyStat.findMany({
          where: {
            propertyUrl: gscProperty,
            date: { gte: start, lte: end },
            ...wsScope(workspaceId),
          },
          orderBy: { date: "asc" },
          select: {
            date: true,
            clicks: true,
            impressions: true,
            ctr: true,
            position: true,
            hasData: true,
          },
        })
      : [];
  const gsc = aggregateGscRows(propertyRows);
  const propertySeries =
    start && end
      ? buildPropertyDailySeries(propertyRows, start, end)
      : [];

  // Top pages : agrégation SQL LIMIT 5 (évite de charger toutes les lignes journalières).
  const topGrouped =
    gscProperty && start && end
      ? await db.gscPageDailyStat.groupBy({
          by: ["pageUrlNorm"],
          where: {
            propertyUrl: gscProperty,
            date: { gte: start, lte: end },
            ...wsScope(workspaceId),
          },
          _sum: { clicks: true, impressions: true },
          orderBy: { _sum: { clicks: "desc" } },
          take: 5,
        })
      : [];

  const topNorms = topGrouped.map((row) => row.pageUrlNorm);
  const wpIdHints =
    topNorms.length > 0 && gscProperty && start && end
      ? await db.gscPageDailyStat.findMany({
          where: {
            propertyUrl: gscProperty,
            date: { gte: start, lte: end },
            pageUrlNorm: { in: topNorms },
            wpPostId: { not: null },
            ...wsScope(workspaceId),
          },
          select: { pageUrlNorm: true, wpPostId: true },
          distinct: ["pageUrlNorm"],
        })
      : [];
  const wpIdByNorm = new Map(
    wpIdHints
      .filter((row) => typeof row.wpPostId === "number")
      .map((row) => [row.pageUrlNorm, row.wpPostId as number] as const)
  );

  const topRaw = topGrouped.map((row) => ({
    pageUrlNorm: row.pageUrlNorm,
    clicks: row._sum.clicks ?? 0,
    impressions: row._sum.impressions ?? 0,
    wpPostId: wpIdByNorm.get(row.pageUrlNorm) ?? null,
  }));

  // Enrichissement titres : uniquement les posts liés au top 5 (scopé workspace).
  const hintWpIds = [
    ...new Set(
      topRaw
        .map((page) => page.wpPostId)
        .filter((id): id is number => typeof id === "number" && id > 0)
    ),
  ];
  const publishedPosts =
    topRaw.length === 0
      ? []
      : await db.wordPressPost.findMany({
          where: {
            status: "publish",
            ...(workspaceId ? { workspaceId } : {}),
            OR: [
              ...(hintWpIds.length > 0
                ? [{ wpPostId: { in: hintWpIds } }]
                : []),
              {
                url: {
                  in: topRaw.map((page) => page.pageUrlNorm),
                },
              },
            ],
          },
          select: { wpPostId: true, title: true, url: true },
        });
  const postsByNorm = indexPublishedPostsByNorm(publishedPosts);
  const postsById = new Map(
    publishedPosts.map((post) => [post.wpPostId, post] as const)
  );
  const wpIds = [
    ...new Set(
      topRaw
        .map((page) => {
          if (typeof page.wpPostId === "number" && page.wpPostId > 0) {
            return page.wpPostId;
          }
          return postsByNorm.get(page.pageUrlNorm)?.wpPostId ?? null;
        })
        .filter((id): id is number => typeof id === "number" && id > 0)
    ),
  ];
  const articles =
    wpIds.length > 0
      ? await db.articleGeneration.findMany({
          where: {
            wpPostId: { in: wpIds },
            ...(workspaceId ? { workspaceId } : {}),
          },
          select: { id: true, wpPostId: true },
          orderBy: { createdAt: "desc" },
        })
      : [];
  const topPages = enrichTopPages({
    pages: topRaw,
    postsByNorm,
    postsById,
    articleIdByWpPostId: indexLatestArticleIdByWpPostId(articles),
  });

  // Sessions IA : fenêtre GA4 indépendante (pas liée à la consolidation GSC).
  const ga4End = endOfTodayUTC();
  const ga4Start = periodStart(periodDays, ga4End);
  const aiAgg = ga4Property
    ? await db.ga4PageDailyStat.aggregate({
        where: {
          propertyId: ga4Property,
          date: { gte: ga4Start, lte: ga4End },
          ...wsScope(workspaceId),
        },
        _sum: { aiSessions: true },
      })
    : { _sum: { aiSessions: 0 } };

  const lastSync = await db.googleSyncRun.findFirst({
    where: {
      status: "completed",
      ...wsScope(workspaceId),
    },
    orderBy: { finishedAt: "desc" },
    select: { finishedAt: true },
  });

  return {
    connected: true,
    hasGscProperty: Boolean(gscProperty),
    hasGa4Property: Boolean(ga4Property),
    gsc: {
      clicks: gsc.clicks,
      impressions: gsc.impressions,
      ctr: gsc.ctr,
      position: gsc.position,
      hasAnyRow: propertyRows.length > 0,
    },
    aiSessions: aiAgg._sum.aiSessions ?? 0,
    topPages,
    propertySeries,
    periodDays,
    periodStart: start ? formatUtcDate(start) : null,
    periodEnd: end ? formatUtcDate(end) : null,
    lastSyncAt: lastSync?.finishedAt?.toISOString() ?? null,
  };
}
