import { db } from "@/lib/db";
import {
  aggregateGscRows,
  formatUtcDate,
  resolveAvailablePeriod,
  type PeriodKey,
} from "@/lib/google/aggregates";
import { aiSourceLabel, isAiSourceKey } from "@/lib/google/ai-referrers";
import { getGoogleConnection } from "@/lib/google/connection";
import {
  buildPropertyDailySeries,
  enrichTopPages,
  indexLatestArticleIdByWpPostId,
  indexPublishedPostsByNorm,
  readableUrlLabel,
  type DashboardTopPageView,
  type PropertyDailyPoint,
} from "@/lib/google/dashboard-presentation";
import {
  contentTypeLabel,
  matchesContentTypeFilter,
  resolveInventoryContentType,
  type AnalyticsContentTypeFilter,
  type ResolvedContentType,
} from "@/lib/analytics/content-type";
import type { AnalyticsSortDir } from "@/lib/analytics/params";

export type AnalyticsConnectionState = {
  connected: boolean;
  hasGscProperty: boolean;
  hasGa4Property: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
};

export type AnalyticsPeriodMeta = {
  periodDays: PeriodKey;
  periodStart: string | null;
  periodEnd: string | null;
  daysRequested: number;
  daysWithData: number;
  incomplete: boolean;
};

export type AnalyticsPageRow = DashboardTopPageView & {
  position: number | null;
  ctr: number | null;
  hasGscData: boolean;
};

export type AnalyticsContentType = ResolvedContentType;

export type AnalyticsQueryRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
};

export type AnalyticsArticleRow = {
  wpPostId: number;
  title: string;
  publicUrl: string;
  pageUrlNorm: string | null;
  articleHref: string | null;
  contentType: ResolvedContentType;
  contentTypeLabel: string;
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  position: number | null;
  aiSessions: number | null;
  lastActivityAt: string | null;
  hasGscData: boolean;
  hasAiData: boolean;
};

type PageAgg = {
  pageUrlNorm: string;
  clicks: number;
  impressions: number;
  positionWeighted: number;
  wpPostId: number | null;
  lastDate: string | null;
};

async function connectionState(workspaceId?: string): Promise<{
  state: AnalyticsConnectionState;
  gscProperty: string | null;
  ga4Property: string | null;
}> {
  const connection = await getGoogleConnection(workspaceId);
  const selection = connection?.selection;
  const gscProperty = selection?.gscPropertyUrl ?? null;
  const ga4Property = selection?.ga4PropertyId ?? null;
  const lastSync = await db.googleSyncRun.findFirst({
    where: workspaceId ? { workspaceId } : undefined,
    orderBy: { startedAt: "desc" },
  });
  return {
    gscProperty,
    ga4Property,
    state: {
      connected: Boolean(connection && connection.status === "connected"),
      hasGscProperty: Boolean(gscProperty),
      hasGa4Property: Boolean(ga4Property),
      lastSyncAt: lastSync?.finishedAt?.toISOString() ?? null,
      lastSyncError:
        lastSync?.status === "failed" ? (lastSync.error ?? "Échec sync") : null,
    },
  };
}

async function latestPropertyStatDate(propertyUrl: string): Promise<Date | null> {
  const latest = await db.gscPropertyDailyStat.findFirst({
    where: { propertyUrl, hasData: true },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  return latest?.date ?? null;
}

async function latestGa4StatDate(propertyId: string): Promise<Date | null> {
  const latest = await db.ga4PageDailyStat.findFirst({
    where: { propertyId },
    orderBy: { date: "desc" },
    select: { date: true },
  });
  return latest?.date ?? null;
}

function periodMeta(
  periodDays: PeriodKey,
  start: Date | null,
  end: Date | null,
  daysWithData: number
): AnalyticsPeriodMeta {
  return {
    periodDays,
    periodStart: start ? formatUtcDate(start) : null,
    periodEnd: end ? formatUtcDate(end) : null,
    daysRequested: periodDays,
    daysWithData,
    incomplete: Boolean(start && end && daysWithData < periodDays),
  };
}

function aggregatePageRows(
  rows: Array<{
    pageUrlNorm: string;
    clicks: number;
    impressions: number;
    position: number;
    wpPostId: number | null;
    date: Date;
    hasData?: boolean;
  }>
): PageAgg[] {
  const byPage = new Map<string, PageAgg>();
  for (const row of rows) {
    if (row.hasData === false) {
      continue;
    }
    const cur = byPage.get(row.pageUrlNorm) ?? {
      pageUrlNorm: row.pageUrlNorm,
      clicks: 0,
      impressions: 0,
      positionWeighted: 0,
      wpPostId: null,
      lastDate: null,
    };
    cur.clicks += row.clicks;
    cur.impressions += row.impressions;
    cur.positionWeighted += row.position * row.impressions;
    if (cur.wpPostId == null && typeof row.wpPostId === "number") {
      cur.wpPostId = row.wpPostId;
    }
    const day = formatUtcDate(row.date);
    if (!cur.lastDate || day > cur.lastDate) {
      cur.lastDate = day;
    }
    byPage.set(row.pageUrlNorm, cur);
  }
  return [...byPage.values()];
}

async function loadPublishedMaps(workspaceId?: string) {
  const publishedPosts = await db.wordPressPost.findMany({
    where: {
      status: "publish",
      ...(workspaceId ? { workspaceId } : {}),
    },
    select: { wpPostId: true, title: true, url: true, contentType: true },
  });
  const postsByNorm = indexPublishedPostsByNorm(publishedPosts);
  const postsById = new Map(
    publishedPosts.map((post) => [post.wpPostId, post] as const)
  );
  const articles = await db.articleGeneration.findMany({
    where: {
      wpPostId: { in: publishedPosts.map((p) => p.wpPostId) },
      ...(workspaceId ? { workspaceId } : {}),
    },
    select: { id: true, wpPostId: true },
    orderBy: { createdAt: "desc" },
  });
  return {
    publishedPosts,
    postsByNorm,
    postsById,
    articleIdByWpPostId: indexLatestArticleIdByWpPostId(articles),
  };
}

function toAnalyticsPageRows(
  pages: PageAgg[],
  maps: Awaited<ReturnType<typeof loadPublishedMaps>>
): AnalyticsPageRow[] {
  const enriched = enrichTopPages({
    pages: pages.map((p) => ({
      pageUrlNorm: p.pageUrlNorm,
      clicks: p.clicks,
      impressions: p.impressions,
      wpPostId: p.wpPostId,
    })),
    postsByNorm: maps.postsByNorm,
    postsById: maps.postsById,
    articleIdByWpPostId: maps.articleIdByWpPostId,
  });
  return enriched.map((view, i) => {
    const raw = pages[i]!;
    return {
      ...view,
      ctr: raw.impressions > 0 ? raw.clicks / raw.impressions : null,
      position:
        raw.impressions > 0 ? raw.positionWeighted / raw.impressions : null,
      hasGscData: true,
    };
  });
}

function sortByNumber<T>(
  rows: T[],
  getter: (row: T) => number | null,
  dir: AnalyticsSortDir
): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = getter(a);
    const bv = getter(b);
    if (av === null && bv === null) {
      return 0;
    }
    if (av === null) {
      return 1;
    }
    if (bv === null) {
      return -1;
    }
    return (av - bv) * sign;
  });
}

function paginate<T>(rows: T[], page: number, pageSize: number) {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    total,
    page: safePage,
    pageCount,
    pageSize,
  };
}

export async function getAnalyticsOverview(
  periodDays: PeriodKey,
  contentType: AnalyticsContentTypeFilter = "all",
  workspaceId?: string
) {
  const { state, gscProperty, ga4Property } = await connectionState(workspaceId);
  if (!state.connected) {
    return {
      connection: state,
      period: periodMeta(periodDays, null, null, 0),
      gsc: null as null,
      propertySeries: [] as PropertyDailyPoint[],
      topPages: [] as AnalyticsPageRow[],
      contentType,
      aiSessions: 0,
      aiSources: [] as Array<{ key: string; label: string; sessions: number }>,
    };
  }

  const latest = gscProperty ? await latestPropertyStatDate(gscProperty) : null;
  const period = resolveAvailablePeriod(latest, periodDays);
  const start = period?.start ?? null;
  const end = period?.end ?? null;

  const propertyRows =
    gscProperty && start && end
      ? await db.gscPropertyDailyStat.findMany({
          where: { propertyUrl: gscProperty, date: { gte: start, lte: end } },
          orderBy: { date: "asc" },
        })
      : [];
  const gsc = aggregateGscRows(propertyRows);
  const propertySeries =
    start && end ? buildPropertyDailySeries(propertyRows, start, end) : [];

  const pageRows =
    gscProperty && start && end
      ? await db.gscPageDailyStat.findMany({
          where: { propertyUrl: gscProperty, date: { gte: start, lte: end } },
        })
      : [];
  const maps = await loadPublishedMaps(workspaceId);
  const topPages = toAnalyticsPageRows(aggregatePageRows(pageRows), maps)
    .filter((row) => matchesContentTypeFilter(row.contentType, contentType))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 5);

  const ga4Latest = ga4Property ? await latestGa4StatDate(ga4Property) : null;
  const ga4Period = resolveAvailablePeriod(ga4Latest, periodDays);
  const ga4Start = ga4Period?.start ?? null;
  const ga4End = ga4Period?.end ?? null;

  const aiAgg =
    ga4Property && ga4Start && ga4End
      ? await db.ga4PageDailyStat.aggregate({
          where: {
            propertyId: ga4Property,
            date: { gte: ga4Start, lte: ga4End },
          },
          _sum: { aiSessions: true },
        })
      : { _sum: { aiSessions: 0 } };

  const sourceRows =
    ga4Property && ga4Start && ga4End
      ? await db.ga4PageSourceDailyStat.findMany({
          where: {
            propertyId: ga4Property,
            date: { gte: ga4Start, lte: ga4End },
          },
          select: { sourceKey: true, sessions: true },
        })
      : [];
  const bySource = new Map<string, number>();
  for (const row of sourceRows) {
    if (!isAiSourceKey(row.sourceKey)) {
      continue;
    }
    bySource.set(
      row.sourceKey,
      (bySource.get(row.sourceKey) ?? 0) + row.sessions
    );
  }
  const aiSources = [...bySource.entries()]
    .map(([key, sessions]) => ({
      key,
      label: aiSourceLabel(key),
      sessions,
    }))
    .filter((s) => s.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions);

  return {
    connection: state,
    period: periodMeta(periodDays, start, end, gsc.daysWithData),
    gsc: {
      clicks: gsc.clicks,
      impressions: gsc.impressions,
      ctr: gsc.ctr,
      position: gsc.position,
      hasAnyRow: propertyRows.length > 0,
    },
    propertySeries,
    topPages,
    contentType,
    aiSessions: aiAgg._sum.aiSessions ?? 0,
    aiSources,
  };
}

export async function getAnalyticsSeo(input: {
  periodDays: PeriodKey;
  q?: string;
  sort?: string;
  dir?: AnalyticsSortDir;
  page?: number;
  pageSize?: number;
  contentType?: AnalyticsContentTypeFilter;
  workspaceId?: string;
}) {
  const contentType = input.contentType ?? "all";
  const overview = await getAnalyticsOverview(
    input.periodDays,
    contentType,
    input.workspaceId
  );
  const { state, gscProperty } = await connectionState(input.workspaceId);
  const dir = input.dir ?? "desc";
  const pageSize = input.pageSize ?? 20;
  const query = (input.q ?? "").trim().toLowerCase();

  if (!state.connected || !gscProperty || !overview.period.periodStart) {
    return {
      ...overview,
      queriesPartial: true as const,
      queries: paginate([] as AnalyticsQueryRow[], 1, pageSize),
      pages: [] as AnalyticsPageRow[],
    };
  }

  const start = new Date(`${overview.period.periodStart}T00:00:00.000Z`);
  const end = new Date(`${overview.period.periodEnd}T00:00:00.000Z`);

  const [queryRows, pageRows] = await Promise.all([
    db.gscQueryDailyStat.findMany({
      where: { propertyUrl: gscProperty, date: { gte: start, lte: end } },
    }),
    db.gscPageDailyStat.findMany({
      where: { propertyUrl: gscProperty, date: { gte: start, lte: end } },
    }),
  ]);

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
  let queries: AnalyticsQueryRow[] = [...queryAgg.values()].map((q) => ({
    query: q.query,
    clicks: q.clicks,
    impressions: q.impressions,
    ctr: q.impressions > 0 ? q.clicks / q.impressions : null,
    position: q.impressions > 0 ? q.positionWeighted / q.impressions : null,
  }));
  if (query) {
    queries = queries.filter((row) => row.query.toLowerCase().includes(query));
  }
  const querySort = input.sort ?? "clicks";
  queries = sortByNumber(
    queries,
    (row) => {
      if (querySort === "impressions") return row.impressions;
      if (querySort === "ctr") return row.ctr;
      if (querySort === "position") return row.position;
      return row.clicks;
    },
    dir
  );

  const maps = await loadPublishedMaps(input.workspaceId);
  let pages = toAnalyticsPageRows(aggregatePageRows(pageRows), maps).filter(
    (row) => matchesContentTypeFilter(row.contentType, contentType)
  );
  if (query) {
    pages = pages.filter((row) => row.label.toLowerCase().includes(query));
  }
  const pageSort = input.sort ?? "clicks";
  pages = sortByNumber(
    pages,
    (row) => {
      if (pageSort === "impressions") return row.impressions;
      if (pageSort === "ctr") return row.ctr;
      if (pageSort === "position") return row.position;
      return row.clicks;
    },
    dir
  ).slice(0, 50);

  return {
    ...overview,
    queriesPartial: true as const,
    queries: paginate(queries, input.page ?? 1, pageSize),
    pages,
  };
}

export async function getAnalyticsAiTraffic(
  periodDays: PeriodKey,
  workspaceId?: string
) {
  const { state, ga4Property } = await connectionState(workspaceId);
  if (!state.connected || !ga4Property) {
    return {
      connection: state,
      period: periodMeta(periodDays, null, null, 0),
      aiSessions: 0,
      destinationPages: 0,
      aiSources: [] as Array<{ key: string; label: string; sessions: number }>,
      series: [] as Array<{ date: string; value: number | null }>,
      destinations: [] as Array<{
        pageUrlNorm: string;
        label: string;
        articleHref: string | null;
        publicUrl: string;
        sourceKey: string;
        sourceLabel: string;
        sessions: number;
      }>,
      note: "Les visites IA correspondent uniquement aux sessions dont la provenance est identifiable dans Google Analytics 4.",
    };
  }

  const latest = await latestGa4StatDate(ga4Property);
  const period = resolveAvailablePeriod(latest, periodDays);
  const start = period?.start ?? null;
  const end = period?.end ?? null;

  const [dailyRows, sourceRows] = await Promise.all([
    start && end
      ? db.ga4PageDailyStat.findMany({
          where: {
            propertyId: ga4Property,
            date: { gte: start, lte: end },
          },
        })
      : Promise.resolve([]),
    start && end
      ? db.ga4PageSourceDailyStat.findMany({
          where: {
            propertyId: ga4Property,
            date: { gte: start, lte: end },
          },
        })
      : Promise.resolve([]),
  ]);

  const aiSessions = dailyRows.reduce((sum, row) => sum + row.aiSessions, 0);
  const byDate = new Map<string, number>();
  const pagesWithAi = new Set<string>();
  for (const row of dailyRows) {
    if (row.aiSessions > 0) {
      pagesWithAi.add(row.pageUrlNorm);
    }
    const key = formatUtcDate(row.date);
    byDate.set(key, (byDate.get(key) ?? 0) + row.aiSessions);
  }

  const series: Array<{ date: string; value: number | null }> = [];
  if (start && end) {
    const cursor = new Date(start);
    const last = new Date(end);
    while (cursor <= last) {
      const key = formatUtcDate(cursor);
      series.push({
        date: key,
        value: byDate.has(key) ? (byDate.get(key) ?? 0) : null,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  const bySource = new Map<string, number>();
  const destAgg = new Map<
    string,
    { pageUrlNorm: string; sourceKey: string; sessions: number }
  >();
  for (const row of sourceRows) {
    if (!isAiSourceKey(row.sourceKey) || row.sessions <= 0) {
      continue;
    }
    bySource.set(
      row.sourceKey,
      (bySource.get(row.sourceKey) ?? 0) + row.sessions
    );
    const key = `${row.pageUrlNorm}|${row.sourceKey}`;
    const cur = destAgg.get(key) ?? {
      pageUrlNorm: row.pageUrlNorm,
      sourceKey: row.sourceKey,
      sessions: 0,
    };
    cur.sessions += row.sessions;
    destAgg.set(key, cur);
  }

  const maps = await loadPublishedMaps(workspaceId);
  const destinations = [...destAgg.values()]
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 50)
    .map((row) => {
      const post =
        maps.postsByNorm.get(row.pageUrlNorm) ??
        null;
      const articleId = post
        ? (maps.articleIdByWpPostId.get(post.wpPostId) ?? null)
        : null;
      return {
        pageUrlNorm: row.pageUrlNorm,
        label: post?.title?.trim() || readableUrlLabel(row.pageUrlNorm),
        articleHref: articleId ? `/articles/${articleId}` : null,
        publicUrl: post?.url ?? row.pageUrlNorm,
        sourceKey: row.sourceKey,
        sourceLabel: aiSourceLabel(row.sourceKey),
        sessions: row.sessions,
      };
    });

  const daysWithData = series.filter((p) => p.value !== null).length;

  return {
    connection: state,
    period: periodMeta(periodDays, start, end, daysWithData),
    aiSessions,
    destinationPages: pagesWithAi.size,
    aiSources: [...bySource.entries()]
      .map(([key, sessions]) => ({
        key,
        label: aiSourceLabel(key),
        sessions,
      }))
      .sort((a, b) => b.sessions - a.sessions),
    series,
    destinations,
    note: "Les visites IA correspondent uniquement aux sessions dont la provenance est identifiable dans Google Analytics 4.",
  };
}

export async function getAnalyticsArticles(input: {
  periodDays: PeriodKey;
  q?: string;
  sort?: string;
  dir?: AnalyticsSortDir;
  page?: number;
  pageSize?: number;
  contentType?: AnalyticsContentTypeFilter;
  workspaceId?: string;
}) {
  const { state, gscProperty, ga4Property } = await connectionState(
    input.workspaceId
  );
  const dir = input.dir ?? "desc";
  const pageSize = input.pageSize ?? 20;
  const query = (input.q ?? "").trim().toLowerCase();
  const contentType = input.contentType ?? "all";

  if (!state.connected) {
    return {
      connection: state,
      period: periodMeta(input.periodDays, null, null, 0),
      contentType,
      table: paginate([] as AnalyticsArticleRow[], 1, pageSize),
    };
  }

  const gscLatest = gscProperty
    ? await latestPropertyStatDate(gscProperty)
    : null;
  const ga4Latest = ga4Property ? await latestGa4StatDate(ga4Property) : null;
  const anchor =
    gscLatest && ga4Latest
      ? gscLatest > ga4Latest
        ? gscLatest
        : ga4Latest
      : (gscLatest ?? ga4Latest);
  const period = resolveAvailablePeriod(anchor, input.periodDays);
  const start = period?.start ?? null;
  const end = period?.end ?? null;

  const maps = await loadPublishedMaps(input.workspaceId);
  const [pageRows, ga4Rows] = await Promise.all([
    gscProperty && start && end
      ? db.gscPageDailyStat.findMany({
          where: { propertyUrl: gscProperty, date: { gte: start, lte: end } },
        })
      : Promise.resolve([]),
    ga4Property && start && end
      ? db.ga4PageDailyStat.findMany({
          where: { propertyId: ga4Property, date: { gte: start, lte: end } },
        })
      : Promise.resolve([]),
  ]);

  const pageAggs = new Map(
    aggregatePageRows(pageRows).map((row) => [row.pageUrlNorm, row] as const)
  );
  const aiByNorm = new Map<string, { sessions: number; lastDate: string | null }>();
  for (const row of ga4Rows) {
    const cur = aiByNorm.get(row.pageUrlNorm) ?? {
      sessions: 0,
      lastDate: null,
    };
    cur.sessions += row.aiSessions;
    const day = formatUtcDate(row.date);
    if (!cur.lastDate || day > cur.lastDate) {
      cur.lastDate = day;
    }
    aiByNorm.set(row.pageUrlNorm, cur);
  }

  const normByWpPostId = new Map<number, string>();
  for (const [norm, post] of maps.postsByNorm) {
    if (!normByWpPostId.has(post.wpPostId)) {
      normByWpPostId.set(post.wpPostId, norm);
    }
  }

  let rows: AnalyticsArticleRow[] = maps.publishedPosts.map((post) => {
    const foundNorm = normByWpPostId.get(post.wpPostId) ?? null;
    const gsc = foundNorm ? pageAggs.get(foundNorm) : undefined;
    const ai = foundNorm ? aiByNorm.get(foundNorm) : undefined;
    const articleId = maps.articleIdByWpPostId.get(post.wpPostId) ?? null;
    const resolvedType = resolveInventoryContentType(post.contentType);
    const lastActivityAt =
      [gsc?.lastDate ?? null, ai?.lastDate ?? null]
        .filter(Boolean)
        .sort()
        .at(-1) ?? null;

    return {
      wpPostId: post.wpPostId,
      title: post.title,
      publicUrl: post.url,
      pageUrlNorm: foundNorm,
      articleHref: articleId ? `/articles/${articleId}` : null,
      contentType: resolvedType,
      contentTypeLabel: contentTypeLabel(resolvedType),
      clicks: gsc ? gsc.clicks : null,
      impressions: gsc ? gsc.impressions : null,
      ctr: gsc && gsc.impressions > 0 ? gsc.clicks / gsc.impressions : null,
      position:
        gsc && gsc.impressions > 0
          ? gsc.positionWeighted / gsc.impressions
          : null,
      aiSessions: ai ? ai.sessions : null,
      lastActivityAt,
      hasGscData: Boolean(gsc),
      hasAiData: Boolean(ai && ai.sessions > 0),
    };
  });

  rows = rows.filter((row) =>
    matchesContentTypeFilter(row.contentType, contentType)
  );

  if (query) {
    rows = rows.filter((row) => row.title.toLowerCase().includes(query));
  }

  const sort = input.sort ?? "clicks";
  rows = sortByNumber(
    rows,
    (row) => {
      if (sort === "impressions") return row.impressions;
      if (sort === "position") return row.position;
      if (sort === "ai") return row.aiSessions;
      return row.clicks;
    },
    dir
  );

  const daysWithData = pageRows.length > 0 || ga4Rows.length > 0 ? input.periodDays : 0;

  return {
    connection: state,
    period: periodMeta(input.periodDays, start, end, daysWithData),
    contentType,
    table: paginate(rows, input.page ?? 1, pageSize),
  };
}

/** Exposé pour les tests d’agrégation page / requête. */
export function aggregateQueriesForTests(
  rows: Array<{
    query: string;
    clicks: number;
    impressions: number;
    position: number;
  }>
): AnalyticsQueryRow[] {
  const map = new Map<
    string,
    { query: string; clicks: number; impressions: number; positionWeighted: number }
  >();
  for (const row of rows) {
    const cur = map.get(row.query) ?? {
      query: row.query,
      clicks: 0,
      impressions: 0,
      positionWeighted: 0,
    };
    cur.clicks += row.clicks;
    cur.impressions += row.impressions;
    cur.positionWeighted += row.position * row.impressions;
    map.set(row.query, cur);
  }
  return [...map.values()].map((q) => ({
    query: q.query,
    clicks: q.clicks,
    impressions: q.impressions,
    ctr: q.impressions > 0 ? q.clicks / q.impressions : null,
    position: q.impressions > 0 ? q.positionWeighted / q.impressions : null,
  }));
}

export function aggregatePagesForTests(
  rows: Array<{
    pageUrlNorm: string;
    clicks: number;
    impressions: number;
    position: number;
    date?: string;
    wpPostId?: number | null;
  }>
): Array<{
  pageUrlNorm: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
}> {
  return aggregatePageRows(
    rows.map((row) => ({
      ...row,
      date: new Date(`${row.date ?? "2026-01-01"}T00:00:00.000Z`),
      wpPostId: row.wpPostId ?? null,
    }))
  ).map((p) => ({
    pageUrlNorm: p.pageUrlNorm,
    clicks: p.clicks,
    impressions: p.impressions,
    ctr: p.impressions > 0 ? p.clicks / p.impressions : null,
    position: p.impressions > 0 ? p.positionWeighted / p.impressions : null,
  }));
}
