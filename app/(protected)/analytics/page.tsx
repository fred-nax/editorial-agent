import { AnalyticsAiTraffic } from "@/components/analytics/AnalyticsAiTraffic";
import { AnalyticsArticles } from "@/components/analytics/AnalyticsArticles";
import { AnalyticsOverview } from "@/components/analytics/AnalyticsOverview";
import { AnalyticsPeriodSelector } from "@/components/analytics/AnalyticsPeriodSelector";
import { AnalyticsSeo } from "@/components/analytics/AnalyticsSeo";
import { AnalyticsTabs } from "@/components/analytics/AnalyticsTabs";
import { parseAnalyticsContentType } from "@/lib/analytics/content-type";
import {
  parseAnalyticsPeriod,
  parseAnalyticsTab,
  parsePositiveInt,
  parseSortDir,
} from "@/lib/analytics/params";
import { getGoogleConnection } from "@/lib/google/connection";
import {
  getAnalyticsAiTraffic,
  getAnalyticsArticles,
  getAnalyticsOverview,
  getAnalyticsSeo,
} from "@/lib/google/analytics-metrics";
import {
  resolveActiveWorkspace,
  webflowEmptyState,
} from "@/lib/workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Promise<{
  tab?: string;
  period?: string;
  q?: string;
  sort?: string;
  dir?: string;
  page?: string;
  type?: string;
}>;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const workspace = await resolveActiveWorkspace();
  const google = await getGoogleConnection(workspace.id);
  const hasDedicatedGoogle =
    Boolean(google?.selection?.gscPropertyUrl) ||
    Boolean(google?.selection?.ga4PropertyId);

  // Webflow : empty state tant qu’aucune propriété Google dédiée (pas de données WP).
  if (workspace.cmsProvider === "webflow" && !hasDedicatedGoogle) {
    const empty = webflowEmptyState("analytics");
    return (
      <div className="mx-auto min-w-0 max-w-6xl space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Analytics</h1>
          <p className="mt-1 text-sm text-slate-600">
            Search Console et Google Analytics 4 pour cet espace Webflow —
            aucune donnée WordPress.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-700">
          {empty.reason}
        </div>
      </div>
    );
  }

  const params = await searchParams;
  const tab = parseAnalyticsTab(params.tab);
  const period = parseAnalyticsPeriod(params.period);
  const type = parseAnalyticsContentType(params.type);
  const q = (params.q ?? "").trim();
  const sort = (params.sort ?? "clicks").trim() || "clicks";
  const dir = parseSortDir(params.dir);
  const page = parsePositiveInt(params.page, 1);

  const overviewData =
    tab === "overview"
      ? await getAnalyticsOverview(period, type, workspace.id)
      : null;
  const seoData =
    tab === "seo"
      ? await getAnalyticsSeo({
          periodDays: period,
          q,
          sort,
          dir,
          page,
          contentType: type,
          workspaceId: workspace.id,
        })
      : null;
  const aiData =
    tab === "ai"
      ? await getAnalyticsAiTraffic(period, workspace.id)
      : null;
  const articlesData =
    tab === "articles"
      ? await getAnalyticsArticles({
          periodDays: period,
          q,
          sort,
          dir,
          page,
          contentType: type,
          workspaceId: workspace.id,
        })
      : null;

  const active =
    overviewData ?? seoData ?? aiData ?? articlesData ?? null;
  const periodMeta = active?.period ?? {
    periodStart: null as string | null,
    periodEnd: null as string | null,
    incomplete: false,
  };
  const connection = active?.connection ?? {
    lastSyncAt: null as string | null,
    lastSyncError: null as string | null,
  };

  return (
    <div className="mx-auto min-w-0 max-w-6xl space-y-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Analytics</h1>
          <p className="mt-1 text-sm text-slate-600">
            {workspace.cmsProvider === "webflow"
              ? "Search Console et trafic IA identifiable (GA4) pour cet espace Webflow."
              : "Performances SEO Search Console et trafic IA identifiable (GA4)."}
          </p>
        </div>
        <p className="text-xs text-slate-500">
          {connection.lastSyncAt
            ? `Dernière sync · ${new Date(connection.lastSyncAt).toLocaleString("fr-FR")}`
            : "Aucune synchronisation Google enregistrée"}
          {connection.lastSyncError ? (
            <span className="ml-1 text-amber-700">
              · {connection.lastSyncError}
            </span>
          ) : null}
        </p>
      </div>

      <AnalyticsPeriodSelector
        tab={tab}
        period={period}
        type={type}
        periodStart={periodMeta.periodStart}
        periodEnd={periodMeta.periodEnd}
        incomplete={periodMeta.incomplete}
      />

      <AnalyticsTabs active={tab} period={period} type={type} />

      <div
        role="tabpanel"
        id={`analytics-panel-${tab}`}
        aria-labelledby={`analytics-tab-${tab}`}
        className="min-w-0 pt-1"
      >
        {tab === "overview" && overviewData ? (
          <AnalyticsOverview
            data={overviewData}
            period={period}
            type={type}
          />
        ) : null}
        {tab === "seo" && seoData ? (
          <AnalyticsSeo
            data={seoData}
            period={period}
            q={q}
            sort={sort}
            dir={dir}
            type={type}
          />
        ) : null}
        {tab === "ai" && aiData ? <AnalyticsAiTraffic data={aiData} /> : null}
        {tab === "articles" && articlesData ? (
          <AnalyticsArticles
            data={articlesData}
            period={period}
            q={q}
            sort={sort}
            dir={dir}
            type={type}
          />
        ) : null}
      </div>
    </div>
  );
}
