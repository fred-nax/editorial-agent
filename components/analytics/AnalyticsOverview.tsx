import Link from "next/link";
import { AnalyticsContentTypeFilter } from "@/components/analytics/AnalyticsContentTypeFilter";
import { AnalyticsEmptyState } from "@/components/analytics/AnalyticsEmptyState";
import { AnalyticsKpiCard } from "@/components/analytics/AnalyticsKpiCard";
import { fmtNum, fmtPct } from "@/components/analytics/format";
import { SeoPropertyTrendChart } from "@/components/dashboard/SeoPropertyTrendChart";
import type { AnalyticsContentTypeFilter as ContentTypeFilter } from "@/lib/analytics/content-type";
import { buildAnalyticsHref } from "@/lib/analytics/params";
import type { getAnalyticsOverview } from "@/lib/google/analytics-metrics";
import type { PeriodKey } from "@/lib/google/aggregates";

type OverviewData = Awaited<ReturnType<typeof getAnalyticsOverview>>;

export function AnalyticsOverview({
  data,
  period,
  type,
}: {
  data: OverviewData;
  period: PeriodKey;
  type: ContentTypeFilter;
}) {
  if (!data.connection.connected) {
    return (
      <AnalyticsEmptyState
        title="Google n’est pas connecté"
        description="Connectez Search Console et GA4 pour consulter les performances SEO et le trafic IA."
        showSettingsLink
      />
    );
  }

  if (!data.connection.hasGscProperty && !data.connection.hasGa4Property) {
    return (
      <AnalyticsEmptyState
        title="Aucune propriété configurée"
        description="Sélectionnez une propriété Search Console et/ou GA4 dans les paramètres."
        showSettingsLink
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <AnalyticsKpiCard label="Clics Google" value={fmtNum(data.gsc?.clicks)} />
        <AnalyticsKpiCard
          label="Impressions"
          value={fmtNum(data.gsc?.impressions)}
        />
        <AnalyticsKpiCard label="CTR" value={fmtPct(data.gsc?.ctr)} />
        <AnalyticsKpiCard
          label="Position moy."
          value={fmtNum(data.gsc?.position, 1)}
        />
        <AnalyticsKpiCard
          label="Sessions IA"
          value={fmtNum(data.aiSessions)}
          hint="Sources identifiables GA4"
        />
      </div>

      {data.gsc?.hasAnyRow ? (
        <section className="rounded-lg border border-[#E2E8F0] bg-white p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            Évolution Search Console
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Totaux propriété · clics et impressions
          </p>
          <SeoPropertyTrendChart
            series={data.propertySeries}
            periodStart={data.period.periodStart}
            periodEnd={data.period.periodEnd}
          />
        </section>
      ) : (
        <AnalyticsEmptyState
          title="Pas encore de données Search Console"
          description="Lancez une synchronisation Google pour importer les totaux propriété."
          showSettingsLink
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-[#E2E8F0] bg-white p-4 sm:p-5">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Contenus performants
              </h2>
              <p className="text-xs text-slate-500">
                Filtre local — les KPI propriété ci-dessus restent globaux.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <AnalyticsContentTypeFilter
                tab="overview"
                period={period}
                type={type}
              />
              <Link
                href={buildAnalyticsHref({ tab: "seo", period, type })}
                className="text-xs font-medium text-naxialis hover:text-naxialis-dark"
              >
                Voir le détail SEO
              </Link>
            </div>
          </div>
          {data.topPages.length === 0 ? (
            <p className="text-sm text-slate-600">Aucun contenu classé.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.topPages.map((page) => (
                <li
                  key={page.pageUrlNorm}
                  className="flex items-start justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    {page.articleHref ? (
                      <Link
                        href={page.articleHref}
                        className="block truncate font-medium text-naxialis hover:underline"
                      >
                        {page.label}
                      </Link>
                    ) : (
                      <a
                        href={page.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-slate-800 hover:text-naxialis hover:underline"
                      >
                        {page.label}
                      </a>
                    )}
                    <p className="mt-0.5 text-xs text-slate-500">
                      {page.contentTypeLabel} · {fmtNum(page.impressions)} impr.
                      {page.position !== null
                        ? ` · pos. ${fmtNum(page.position, 1)}`
                        : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium tabular-nums text-slate-600">
                    {fmtNum(page.clicks)} clics
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-[#E2E8F0] bg-white p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Trafic IA</h2>
            <Link
              href={buildAnalyticsHref({ tab: "ai", period, type })}
              className="text-xs font-medium text-naxialis hover:text-naxialis-dark"
            >
              Voir le détail
            </Link>
          </div>
          <p className="text-2xl font-semibold tabular-nums text-slate-900">
            {fmtNum(data.aiSessions)}
          </p>
          <p className="text-xs text-slate-500">sessions identifiables</p>
          {data.aiSources.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">
              Aucune source IA détectée sur la période.
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {data.aiSources.slice(0, 5).map((source) => (
                <li
                  key={source.key}
                  className="flex justify-between gap-2 text-sm text-slate-700"
                >
                  <span>{source.label}</span>
                  <span className="tabular-nums text-slate-500">
                    {fmtNum(source.sessions)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-slate-500">
            <Link
              href="/opportunities"
              className="font-medium text-naxialis hover:underline"
            >
              Opportunités SEO
            </Link>{" "}
            — exploration éditoriale séparée.
          </p>
        </section>
      </div>
    </div>
  );
}
