import type { AnalyticsContentTypeFilter } from "@/lib/analytics/content-type";
import {
  buildAnalyticsHref,
  type AnalyticsTabId,
} from "@/lib/analytics/params";
import type { PeriodKey } from "@/lib/google/aggregates";

export function AnalyticsSearchForm({
  tab,
  period,
  q,
  sort,
  dir,
  type,
}: {
  tab: AnalyticsTabId;
  period: PeriodKey;
  q: string;
  sort?: string;
  dir?: "asc" | "desc";
  type?: AnalyticsContentTypeFilter;
}) {
  return (
    <form method="get" action="/analytics" className="flex flex-wrap gap-2">
      <input type="hidden" name="tab" value={tab} />
      <input type="hidden" name="period" value={String(period)} />
      {type && type !== "all" ? (
        <input type="hidden" name="type" value={type} />
      ) : null}
      {sort ? <input type="hidden" name="sort" value={sort} /> : null}
      {dir && dir !== "desc" ? (
        <input type="hidden" name="dir" value={dir} />
      ) : null}
      <label className="sr-only" htmlFor={`analytics-q-${tab}`}>
        Rechercher
      </label>
      <input
        id={`analytics-q-${tab}`}
        name="q"
        defaultValue={q}
        placeholder={
          tab === "articles" ? "Rechercher un contenu…" : "Rechercher…"
        }
        className="min-w-[12rem] flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-naxialis focus:ring-2 focus:ring-naxialis/20"
      />
      <button
        type="submit"
        className="rounded-md bg-naxialis px-3 py-2 text-sm font-medium text-white outline-none hover:bg-naxialis-dark focus-visible:ring-2 focus-visible:ring-naxialis/35"
      >
        Filtrer
      </button>
      {q ? (
        <a
          href={buildAnalyticsHref({ tab, period, sort, dir, type })}
          className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-naxialis/35"
        >
          Effacer
        </a>
      ) : null}
    </form>
  );
}
