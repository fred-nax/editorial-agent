import Link from "next/link";
import { AnalyticsEmptyState } from "@/components/analytics/AnalyticsEmptyState";
import { AnalyticsKpiCard } from "@/components/analytics/AnalyticsKpiCard";
import { AnalyticsSessionsChart } from "@/components/analytics/AnalyticsSessionsChart";
import { fmtNum } from "@/components/analytics/format";
import type { getAnalyticsAiTraffic } from "@/lib/google/analytics-metrics";

type AiData = Awaited<ReturnType<typeof getAnalyticsAiTraffic>>;

export function AnalyticsAiTraffic({ data }: { data: AiData }) {
  if (!data.connection.connected) {
    return (
      <AnalyticsEmptyState
        title="Google n’est pas connecté"
        description="Connectez GA4 pour consulter le trafic des assistants IA."
        showSettingsLink
      />
    );
  }

  if (!data.connection.hasGa4Property) {
    return (
      <AnalyticsEmptyState
        title="Propriété GA4 manquante"
        description="Sélectionnez une propriété Google Analytics 4 dans les paramètres."
        showSettingsLink
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AnalyticsKpiCard
          label="Sessions IA"
          value={fmtNum(data.aiSessions)}
          hint="Identifiables uniquement"
        />
        <AnalyticsKpiCard
          label="Pages de destination"
          value={fmtNum(data.destinationPages)}
        />
        <AnalyticsKpiCard
          label="Sources détectées"
          value={fmtNum(data.aiSources.length)}
        />
      </div>

      <p className="text-xs text-slate-500">{data.note}</p>

      <section className="rounded-lg border border-[#E2E8F0] bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-900">
          Évolution des sessions IA
        </h2>
        <div className="mt-3">
          <AnalyticsSessionsChart series={data.series} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-[#E2E8F0] bg-white p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-900">Sources IA</h2>
          {data.aiSources.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">
              Aucune source IA identifiable sur la période.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {data.aiSources.map((source) => (
                <li
                  key={source.key}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="text-slate-800">{source.label}</span>
                  <span className="tabular-nums text-slate-500">
                    {fmtNum(source.sessions)} sessions
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-[#E2E8F0] bg-white p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            Destinations
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Pages associées aux sessions IA source / medium GA4.
          </p>
          {data.destinations.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">Aucune destination.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {data.destinations.slice(0, 15).map((row) => (
                <li
                  key={`${row.pageUrlNorm}-${row.sourceKey}`}
                  className="flex items-start justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    {row.articleHref ? (
                      <Link
                        href={row.articleHref}
                        className="block truncate text-sm font-medium text-naxialis hover:underline"
                      >
                        {row.label}
                      </Link>
                    ) : (
                      <a
                        href={row.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-sm text-slate-800 hover:underline"
                      >
                        {row.label}
                      </a>
                    )}
                    <p className="text-xs text-slate-500">{row.sourceLabel}</p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-slate-600">
                    {fmtNum(row.sessions)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
