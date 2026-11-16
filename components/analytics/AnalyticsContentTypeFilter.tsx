import Link from "next/link";
import {
  ANALYTICS_CONTENT_TYPES,
  type AnalyticsContentTypeFilter as ContentTypeFilter,
} from "@/lib/analytics/content-type";
import {
  buildAnalyticsHref,
  type AnalyticsSortDir,
  type AnalyticsTabId,
} from "@/lib/analytics/params";
import type { PeriodKey } from "@/lib/google/aggregates";
import { cn } from "@/lib/utils";

export function AnalyticsContentTypeFilter({
  tab,
  period,
  type,
  q,
  sort,
  dir,
}: {
  tab: AnalyticsTabId;
  period: PeriodKey;
  type: ContentTypeFilter;
  q?: string;
  sort?: string;
  dir?: AnalyticsSortDir;
}) {
  return (
    <div
      className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5"
      role="group"
      aria-label="Filtrer par type de contenu"
    >
      {ANALYTICS_CONTENT_TYPES.map((item) => {
        const active = item.id === type;
        return (
          <Link
            key={item.id}
            href={buildAnalyticsHref({
              tab,
              period,
              type: item.id,
              q,
              sort,
              dir,
            })}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-naxialis/35",
              active
                ? "bg-[#E8F2F7] text-naxialis"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            )}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
