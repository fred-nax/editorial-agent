"use client";

import { useEffect, useState } from "react";
import { Sparkline } from "@/components/google/Sparkline";
import { Button } from "@/components/ui/button";
import type { PeriodKey } from "@/lib/google/aggregates";

type PerformancePayload = {
  connected: boolean;
  hasGscProperty: boolean;
  hasGa4Property: boolean;
  gsc: {
    clicks: number;
    impressions: number;
    ctr: number | null;
    position: number | null;
    hasAnyRow: boolean;
    daysWithData: number;
    series: Array<{ date: string; value: number }>;
    topQueries: Array<{
      query: string;
      clicks: number;
      impressions: number;
      ctr: number | null;
      position: number | null;
    }>;
  };
  ga4: {
    sessions: number;
    aiSessions: number;
    hasAnyRow: boolean;
    series: Array<{ date: string; value: number }>;
    aiBreakdown: Array<{ key: string; label: string; sessions: number }>;
  };
};

function pct(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return `${(value * 100).toFixed(1)} %`;
}

function num(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return value.toLocaleString("fr-FR", {
    maximumFractionDigits: digits,
  });
}

export function ArticlePerformancesPanel({
  pageUrlNorm,
  published,
  cmsDestination = "wordpress",
}: {
  pageUrlNorm: string | null;
  published: boolean;
  cmsDestination?: string | null;
}) {
  const [period, setPeriod] = useState<PeriodKey>(28);
  const [data, setData] = useState<PerformancePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isWebflow = cmsDestination === "webflow";

  useEffect(() => {
    if (!published || !pageUrlNorm) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const response = await fetch(
          `/api/google/metrics/page?pageUrlNorm=${encodeURIComponent(pageUrlNorm)}&period=${period}`,
          { credentials: "same-origin" }
        );
        const payload = (await response.json()) as PerformancePayload & {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Chargement impossible.");
        }
        if (!cancelled) {
          setData(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erreur.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageUrlNorm, period, published]);

  if (!published || !pageUrlNorm) {
    return (
      <div className="rounded-lg border border-dashed border-[#E2E8F0] bg-[#F8FAFC] px-5 py-8 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
        {isWebflow
          ? "Les performances seront disponibles après publication, indexation et collecte de données par Google. Aucune URL fictive n’est interrogée pour un brouillon Webflow."
          : "Les performances publiques ne sont pas encore disponibles pour ce brouillon. Publiez l’article WordPress et synchronisez l’inventaire pour afficher Search Console et GA4."}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">Période</span>
        {([7, 28, 90] as PeriodKey[]).map((days) => (
          <Button
            key={days}
            type="button"
            size="sm"
            variant={period === days ? "default" : "outline"}
            className={
              period === days
                ? "h-7 bg-naxialis text-white hover:bg-naxialis-dark"
                : "h-7"
            }
            onClick={() => setPeriod(days)}
          >
            {days} j
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-600">Chargement des performances…</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {data && !data.connected ? (
        <p className="text-sm text-amber-800">
          Connectez Google dans Paramètres pour afficher les performances.
        </p>
      ) : null}

      {data ? (
        <>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Search Console
            </h3>
            {!data.hasGscProperty ? (
              <p className="text-sm text-slate-600">
                Aucune propriété Search Console sélectionnée.
              </p>
            ) : !data.gsc.hasAnyRow ? (
              <p className="text-sm text-slate-600">
                Aucune donnée Search Console pour cette URL sur la période
                (absence de données ≠ zéro impression confirmé).
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  <Metric label="Clics" value={num(data.gsc.clicks, 0)} />
                  <Metric
                    label="Impressions"
                    value={num(data.gsc.impressions, 0)}
                  />
                  <Metric label="CTR" value={pct(data.gsc.ctr)} />
                  <Metric
                    label="Position moy."
                    value={num(data.gsc.position, 1)}
                  />
                </div>
                <Sparkline
                  values={data.gsc.series.map((p) => p.value)}
                  className="h-14 w-full max-w-md"
                />
                {data.gsc.topQueries.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="text-xs text-slate-500">
                        <tr>
                          <th className="py-1 pr-3 font-medium">Requête</th>
                          <th className="py-1 pr-3 font-medium">Clics</th>
                          <th className="py-1 pr-3 font-medium">Impr.</th>
                          <th className="py-1 font-medium">Pos.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.gsc.topQueries.map((q) => (
                          <tr key={q.query} className="border-t border-slate-100">
                            <td className="py-1.5 pr-3 text-slate-800">
                              {q.query}
                            </td>
                            <td className="py-1.5 pr-3">{num(q.clicks, 0)}</td>
                            <td className="py-1.5 pr-3">
                              {num(q.impressions, 0)}
                            </td>
                            <td className="py-1.5">{num(q.position, 1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Google Analytics 4
            </h3>
            {!data.hasGa4Property ? (
              <p className="text-sm text-slate-600">
                Aucune propriété GA4 sélectionnée.
              </p>
            ) : !data.ga4.hasAnyRow ? (
              <p className="text-sm text-slate-600">
                Aucune session GA4 enregistrée pour cette URL sur la période.
              </p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Metric label="Sessions" value={num(data.ga4.sessions, 0)} />
                  <Metric
                    label="Sessions assistants IA"
                    value={num(data.ga4.aiSessions, 0)}
                  />
                </div>
                <Sparkline
                  values={data.ga4.series.map((p) => p.value)}
                  className="h-14 w-full max-w-md"
                  stroke="#0F766E"
                />
                {data.ga4.aiBreakdown.length > 0 ? (
                  <ul className="space-y-1 text-sm text-slate-700">
                    {data.ga4.aiBreakdown.map((item) => (
                      <li key={item.key} className="flex justify-between gap-3">
                        <span>{item.label}</span>
                        <span>{num(item.sessions, 0)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500">
                    Aucun référent d’assistant IA identifiable sur la période.
                    Les visites sans référent ne sont pas classées comme IA.
                  </p>
                )}
              </>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}
