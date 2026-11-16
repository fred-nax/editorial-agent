import Link from "next/link";
import type { AnalyticsContentTypeFilter } from "@/lib/analytics/content-type";
import {
  ANALYTICS_PERIODS,
  buildAnalyticsHref,
  type AnalyticsTabId,
} from "@/lib/analytics/params";
import type { PeriodKey } from "@/lib/google/aggregates";
import { cn } from "@/lib/utils";

export function AnalyticsPeriodSelector({
  tab,
  period,
  type,
  periodStart,
  periodEnd,
  incomplete,
}: {
  tab: AnalyticsTabId;
  period: PeriodKey;
  type?: AnalyticsContentTypeFilter;
  periodStart: string | null;
  periodEnd: string | null;
  incomplete?: boolean;
}) {
  const rangeLabel =
    periodStart && periodEnd
      ? `${formatFr(periodStart)} → ${formatFr(periodEnd)}`
      : null;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
        {ANALYTICS_PERIODS.map((days) => {
          const active = days === period;
          return (
            <Link
              key={days}
              href={buildAnalyticsHref({ tab, period: days, type })}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-naxialis/35",
                active
                  ? "bg-[#E8F2F7] text-naxialis"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
              aria-current={active ? "page" : undefined}
            >
              {days} j
            </Link>
          );
        })}
      </div>
      <div className="text-xs text-slate-500">
        {rangeLabel ? (
          <span>
            Période analysée :{" "}
            <span className="font-medium text-slate-700">{rangeLabel}</span>
            {incomplete ? (
              <span className="ml-1 text-amber-700">
                · données partielles sur la fenêtre
              </span>
            ) : null}
          </span>
        ) : (
          <span>Aucune date consolidée disponible</span>
        )}
      </div>
    </div>
  );
}

function formatFr(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("fr-FR", {
    timeZone: "UTC",
  });
}
