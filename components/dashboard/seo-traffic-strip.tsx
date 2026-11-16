import Link from "next/link";
import { ChartNoAxesCombined } from "lucide-react";
import { dashboardCardClassName, dashboardIconBadgeClassName } from "@/components/dashboard/card-shell";
import { SeoPropertyTrendChart } from "@/components/dashboard/SeoPropertyTrendChart";
import { getDashboardSeoSummary } from "@/lib/google/metrics";

function fmt(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined) {
    return "—";
  }
  return n.toLocaleString("fr-FR", { maximumFractionDigits: digits });
}

function fmtPeriodDate(iso: string | null): string | null {
  if (!iso) {
    return null;
  }
  const d = new Date(`${iso}T00:00:00.000Z`);
  return d.toLocaleDateString("fr-FR", { timeZone: "UTC" });
}

const pageRowClassName =
  "group flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-slate-50 focus-within:bg-slate-50";

const pageLinkClassName =
  "block min-w-0 truncate font-medium text-naxialis outline-none hover:text-naxialis-dark hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-naxialis/35 focus-visible:ring-offset-2";

const pageExternalClassName =
  "block min-w-0 truncate text-slate-700 outline-none hover:text-naxialis hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-naxialis/35 focus-visible:ring-offset-2";

export async function DashboardSeoTrafficStrip() {
  const summary = await getDashboardSeoSummary(28);
  const periodLabel =
    summary.periodStart && summary.periodEnd
      ? `${fmtPeriodDate(summary.periodStart)} → ${fmtPeriodDate(summary.periodEnd)}`
      : `${summary.periodDays} derniers jours`;

  return (
    <section
      aria-labelledby="dashboard-seo-traffic-title"
      className={`${dashboardCardClassName} p-5`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={dashboardIconBadgeClassName}>
              <ChartNoAxesCombined className="size-4" aria-hidden />
            </span>
            <h2
              id="dashboard-seo-traffic-title"
              className="text-base font-semibold text-[#0F172A]"
            >
              SEO & Trafic IA
            </h2>
          </div>
          <p className="text-sm text-slate-500">
            Totaux propriété Search Console · {periodLabel}
            {summary.lastSyncAt
              ? ` · maj ${new Date(summary.lastSyncAt).toLocaleString("fr-FR")}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/analytics"
            className="text-sm font-medium text-naxialis outline-none hover:text-naxialis-dark focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-naxialis/35 focus-visible:ring-offset-2"
          >
            Voir les statistiques détaillées
          </Link>
          <Link
            href="/settings"
            className="text-sm font-medium text-slate-500 outline-none hover:text-naxialis focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-naxialis/35 focus-visible:ring-offset-2"
          >
            Paramètres Google
          </Link>
        </div>
      </div>

      {!summary.connected ? (
        <p className="mt-3 text-sm text-slate-600">
          Connectez Search Console et GA4 dans les paramètres pour afficher ces
          indicateurs.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Clics SEO" value={fmt(summary.gsc?.clicks, 0)} />
            <Stat
              label="Impressions"
              value={fmt(summary.gsc?.impressions, 0)}
            />
            <Stat
              label="CTR"
              value={
                summary.gsc?.ctr === null || summary.gsc?.ctr === undefined
                  ? "—"
                  : `${(summary.gsc.ctr * 100).toFixed(1)} %`
              }
            />
            <Stat
              label="Position moy."
              value={fmt(summary.gsc?.position, 1)}
            />
            <Stat label="Sessions IA" value={fmt(summary.aiSessions, 0)} />
          </div>

          {summary.gsc?.hasAnyRow ? (
            <SeoPropertyTrendChart
              series={summary.propertySeries}
              periodStart={summary.periodStart}
              periodEnd={summary.periodEnd}
            />
          ) : null}

          {summary.topPages.length > 0 ? (
            <div className="mt-5">
              <p className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Pages les plus performantes
              </p>
              <ul className="divide-y divide-slate-100">
                {summary.topPages.map((page) => (
                  <li key={page.pageUrlNorm} className={pageRowClassName}>
                    <div className="min-w-0 flex-1">
                      {page.articleHref ? (
                        <Link
                          href={page.articleHref}
                          className={pageLinkClassName}
                          title={page.label}
                        >
                          {page.label}
                        </Link>
                      ) : page.matchedWordPress ? (
                        <span
                          className="block min-w-0 truncate font-medium text-slate-900"
                          title={page.label}
                        >
                          {page.label}
                        </span>
                      ) : (
                        <a
                          href={page.publicUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={pageExternalClassName}
                          title={page.publicUrl}
                        >
                          {page.label}
                        </a>
                      )}
                    </div>
                    <span className="shrink-0 tabular-nums text-right text-xs font-medium text-slate-500 group-hover:text-slate-700">
                      {fmt(page.clicks, 0)}{" "}
                      <span className="font-normal">clics</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : summary.gsc && !summary.gsc.hasAnyRow ? (
            <p className="mt-3 text-sm text-slate-600">
              Aucune donnée Search Console synchronisée pour le moment. Lancez
              une synchronisation pour importer les totaux propriété.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}
