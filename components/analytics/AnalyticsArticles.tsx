import Link from "next/link";
import { AnalyticsContentTypeFilter } from "@/components/analytics/AnalyticsContentTypeFilter";
import { AnalyticsEmptyState } from "@/components/analytics/AnalyticsEmptyState";
import { AnalyticsPagination } from "@/components/analytics/AnalyticsPagination";
import { AnalyticsSearchForm } from "@/components/analytics/AnalyticsSearchForm";
import { fmtMetricOrEmpty, fmtPct } from "@/components/analytics/format";
import type { AnalyticsContentTypeFilter as ContentTypeFilter } from "@/lib/analytics/content-type";
import {
  buildAnalyticsHref,
  type AnalyticsSortDir,
} from "@/lib/analytics/params";
import type { getAnalyticsArticles } from "@/lib/google/analytics-metrics";
import type { PeriodKey } from "@/lib/google/aggregates";

type ArticlesData = Awaited<ReturnType<typeof getAnalyticsArticles>>;

export function AnalyticsArticles({
  data,
  period,
  q,
  sort,
  dir,
  type,
}: {
  data: ArticlesData;
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
        description="Connectez Google pour croiser l’inventaire WordPress avec les performances."
        showSettingsLink
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-[#E2E8F0] bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Contenus WordPress publiés
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Inventaire publié · « n/d » = aucune donnée mesurée (≠ zéro).
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <AnalyticsContentTypeFilter
              tab="articles"
              period={period}
              type={type}
              q={q}
              sort={sort}
              dir={dir}
            />
            <AnalyticsSearchForm
              tab="articles"
              period={period}
              q={q}
              sort={sort}
              dir={dir}
              type={type}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 px-1 text-xs">
        <span className="text-slate-500">Trier :</span>
        {(
          [
            { id: "clicks", label: "Clics" },
            { id: "impressions", label: "Impressions" },
            { id: "position", label: "Position" },
            { id: "ai", label: "Sessions IA" },
          ] as const
        ).map((key) => {
          const active = sort === key.id;
          const nextDir =
            active && dir === "desc" ? ("asc" as const) : ("desc" as const);
          return (
            <Link
              key={key.id}
              href={buildAnalyticsHref({
                tab: "articles",
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

      <div className="overflow-x-auto rounded-lg border border-[#E2E8F0] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5 font-medium">Contenu</th>
              <th className="px-3 py-2.5 font-medium">Type</th>
              <th className="px-3 py-2.5 font-medium text-right">Clics</th>
              <th className="px-3 py-2.5 font-medium text-right">Impr.</th>
              <th className="px-3 py-2.5 font-medium text-right">CTR</th>
              <th className="px-3 py-2.5 font-medium text-right">Pos.</th>
              <th className="px-3 py-2.5 font-medium text-right">IA</th>
              <th className="px-3 py-2.5 font-medium">Activité</th>
              <th className="px-3 py-2.5 font-medium">Liens</th>
            </tr>
          </thead>
          <tbody>
            {data.table.rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-slate-600">
                  Aucun contenu publié ne correspond au filtre.
                </td>
              </tr>
            ) : (
              data.table.rows.map((row) => (
                <tr
                  key={row.wpPostId}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80"
                >
                  <td className="max-w-[16rem] truncate px-3 py-2.5 font-medium text-slate-900">
                    {row.title}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">
                    {row.contentTypeLabel}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {fmtMetricOrEmpty(row.hasGscData, row.clicks)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {fmtMetricOrEmpty(row.hasGscData, row.impressions)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {row.hasGscData ? fmtPct(row.ctr) : "n/d"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {fmtMetricOrEmpty(row.hasGscData, row.position, 1)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {fmtMetricOrEmpty(row.hasAiData, row.aiSessions)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">
                    {row.lastActivityAt
                      ? new Date(
                          `${row.lastActivityAt}T00:00:00.000Z`
                        ).toLocaleDateString("fr-FR", { timeZone: "UTC" })
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    <div className="flex flex-col gap-1">
                      {row.articleHref ? (
                        <Link
                          href={`${row.articleHref}?tab=performances`}
                          className="font-medium text-naxialis hover:underline"
                        >
                          Fiche
                        </Link>
                      ) : null}
                      <a
                        href={row.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-600 hover:text-naxialis hover:underline"
                      >
                        Public
                      </a>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <AnalyticsPagination
        tab="articles"
        period={period}
        q={q}
        sort={sort}
        dir={dir}
        type={type}
        page={data.table.page}
        pageCount={data.table.pageCount}
        total={data.table.total}
      />
      <p className="text-xs text-slate-500">
        « n/d » = aucune donnée synchronisée. Les utilisateurs uniques GA4 ne
        sont pas additionnés sur plusieurs jours.
      </p>
    </div>
  );
}
