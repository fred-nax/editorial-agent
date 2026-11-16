import Link from "next/link";
import type { AnalyticsContentTypeFilter } from "@/lib/analytics/content-type";
import {
  buildAnalyticsHref,
  type AnalyticsSortDir,
  type AnalyticsTabId,
} from "@/lib/analytics/params";
import type { PeriodKey } from "@/lib/google/aggregates";

export function AnalyticsPagination({
  tab,
  period,
  q,
  sort,
  dir,
  type,
  page,
  pageCount,
  total,
}: {
  tab: AnalyticsTabId;
  period: PeriodKey;
  q?: string;
  sort?: string;
  dir?: AnalyticsSortDir;
  type?: AnalyticsContentTypeFilter;
  page: number;
  pageCount: number;
  total: number;
}) {
  if (pageCount <= 1) {
    return (
      <p className="text-xs text-slate-500">
        {total.toLocaleString("fr-FR")} résultat{total > 1 ? "s" : ""}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <p className="text-xs text-slate-500">
        Page {page} / {pageCount} · {total.toLocaleString("fr-FR")} résultat
        {total > 1 ? "s" : ""}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link
            href={buildAnalyticsHref({
              tab,
              period,
              q,
              sort,
              dir,
              type,
              page: page - 1,
            })}
            className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-naxialis/35"
          >
            Précédent
          </Link>
        ) : null}
        {page < pageCount ? (
          <Link
            href={buildAnalyticsHref({
              tab,
              period,
              q,
              sort,
              dir,
              type,
              page: page + 1,
            })}
            className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-naxialis/35"
          >
            Suivant
          </Link>
        ) : null}
      </div>
    </div>
  );
}
