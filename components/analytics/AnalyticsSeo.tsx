import Link from "next/link";
import { AnalyticsContentTypeFilter } from "@/components/analytics/AnalyticsContentTypeFilter";
import { AnalyticsEmptyState } from "@/components/analytics/AnalyticsEmptyState";
import { AnalyticsKpiCard } from "@/components/analytics/AnalyticsKpiCard";
import { AnalyticsPagination } from "@/components/analytics/AnalyticsPagination";
import { AnalyticsSearchForm } from "@/components/analytics/AnalyticsSearchForm";
import { fmtNum, fmtPct } from "@/components/analytics/format";
import { SeoPropertyTrendChart } from "@/components/dashboard/SeoPropertyTrendChart";
import type { AnalyticsContentTypeFilter as ContentTypeFilter } from "@/lib/analytics/content-type";
import {
  buildAnalyticsHref,
  type AnalyticsSortDir,
} from "@/lib/analytics/params";
import type { getAnalyticsSeo } from "@/lib/google/analytics-metrics";
import type { PeriodKey } from "@/lib/google/aggregates";

type SeoData = Awaited<ReturnType<typeof getAnalyticsSeo>>;

export function AnalyticsSeo({
  data,
  period,
  q,
  sort,
  dir,
  type,
}: {
  data: SeoData;
  period: PeriodKey;
  q: string;
  sort: string;
  dir: AnalyticsSortDir;
  type: ContentTypeFilter;
}) {
  if (!data.connection.connected) {
    return (
      <AnalyticsEmptyState
        title="Google n’est pas connecté"
        description="Connectez Search Console pour afficher les performances SEO."
        showSettingsLink
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AnalyticsKpiCard label="Clics" value={fmtNum(data.gsc?.clicks)} />
        <AnalyticsKpiCard
          label="Impressions"
          value={fmtNum(data.gsc?.impressions)}
        />
        <AnalyticsKpiCard label="CTR" value={fmtPct(data.gsc?.ctr)} />
        <AnalyticsKpiCard
          label="Position moy."
          value={fmtNum(data.gsc?.position, 1)}
        />
      </div>

      {data.gsc?.hasAnyRow ? (
        <section className="rounded-lg border border-[#E2E8F0] bg-white p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            Évolution (totaux propriété)
          </h2>
          <SeoPropertyTrendChart
            series={data.propertySeries}
            periodStart={data.period.periodStart}
            periodEnd={data.period.periodEnd}
          />
        </section>
      ) : null}

      <section className="space-y-3 rounded-lg border border-[#E2E8F0] bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Requêtes Google
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Liste partielle : principales requêtes par URL synchronisées, non
              exhaustive.
            </p>
          </div>
          <AnalyticsSearchForm
            tab="seo"
            period={period}
            q={q}
            sort={sort}
            dir={dir}
            type={type}
          />
        </div>
        <SortLinks
          tab="seo"
          period={period}
          q={q}
          sort={sort}
          dir={dir}
          type={type}
        />
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-2 font-medium">Requête</th>
                <th className="px-2 py-2 font-medium text-right">Clics</th>
                <th className="px-2 py-2 font-medium text-right">Impr.</th>
                <th className="px-2 py-2 font-medium text-right">CTR</th>
                <th className="px-2 py-2 font-medium text-right">Pos.</th>
              </tr>
            </thead>
            <tbody>
              {data.queries.rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-slate-600">
                    Aucune requête pour ce filtre.
                  </td>
                </tr>
              ) : (
                data.queries.rows.map((row) => (
                  <tr
                    key={row.query}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="max-w-[18rem] truncate px-2 py-2 text-slate-800">
                      {row.query}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {fmtNum(row.clicks)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {fmtNum(row.impressions)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {fmtPct(row.ctr)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {fmtNum(row.position, 1)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <AnalyticsPagination
          tab="seo"
          period={period}
          q={q}
          sort={sort}
          dir={dir}
          type={type}
          page={data.queries.page}
          pageCount={data.queries.pageCount}
          total={data.queries.total}
        />
      </section>

      <section className="space-y-3 rounded-lg border border-[#E2E8F0] bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Contenus performants
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Stats par URL (`GscPageDailyStat`) — distinctes des totaux
              propriété. URLs hors inventaire = « Non identifié ».
            </p>
          </div>
          <AnalyticsContentTypeFilter
            tab="seo"
            period={period}
            type={type}
            q={q}
            sort={sort}
            dir={dir}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-2 font-medium">Contenu</th>
                <th className="px-2 py-2 font-medium">Type</th>
                <th className="px-2 py-2 font-medium text-right">Clics</th>
                <th className="px-2 py-2 font-medium text-right">Impr.</th>
                <th className="px-2 py-2 font-medium text-right">CTR</th>
                <th className="px-2 py-2 font-medium text-right">Pos.</th>
                <th className="px-2 py-2 font-medium">Lien</th>
              </tr>
            </thead>
            <tbody>
              {data.pages.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-6 text-slate-600">
                    Aucun contenu pour ce filtre.
                  </td>
                </tr>
              ) : (
                data.pages.map((row) => (
                  <tr
                    key={row.pageUrlNorm}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="max-w-[16rem] truncate px-2 py-2 font-medium text-slate-900">
                      {row.label}
                    </td>
                    <td className="px-2 py-2 text-xs text-slate-500">
                      {row.contentTypeLabel}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {fmtNum(row.clicks)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {fmtNum(row.impressions)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {fmtPct(row.ctr)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {fmtNum(row.position, 1)}
                    </td>
                    <td className="px-2 py-2">
                      {row.articleHref ? (
                        <Link
                          href={`${row.articleHref}?tab=performances`}
                          className="text-xs font-medium text-naxialis hover:underline"
                        >
                          Performances
                        </Link>
                      ) : (
                        <a
                          href={row.publicUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-slate-600 hover:text-naxialis hover:underline"
                        >
                          Public
                        </a>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">
          Jusqu’à 50 contenus · triés selon le critère actif.
        </p>
      </section>
    </div>
  );
}

function SortLinks({
  tab,
  period,
  q,
  sort,
  dir,
  type,
}: {
  tab: "seo";
  period: PeriodKey;
  q: string;
  sort: string;
  dir: AnalyticsSortDir;
  type: ContentTypeFilter;
}) {
  const keys = [
    { id: "clicks", label: "Clics" },
    { id: "impressions", label: "Impressions" },
    { id: "ctr", label: "CTR" },
    { id: "position", label: "Position" },
  ] as const;
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <span className="text-slate-500">Trier :</span>
      {keys.map((key) => {
        const active = sort === key.id;
        const nextDir =
          active && dir === "desc" ? ("asc" as const) : ("desc" as const);
        return (
          <Link
            key={key.id}
            href={buildAnalyticsHref({
              tab,
              period,
              q,
              sort: key.id,
              dir: active ? nextDir : "desc",
              type,
            })}
            className={
              active
                ? "font-medium text-naxialis"
                : "text-slate-600 hover:text-naxialis"
            }
          >
            {key.label}
            {active ? (dir === "desc" ? " ↓" : " ↑") : ""}
          </Link>
        );
      })}
    </div>
  );
}
