"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useRef } from "react";
import type { AnalyticsContentTypeFilter } from "@/lib/analytics/content-type";
import {
  ANALYTICS_TABS,
  buildAnalyticsHref,
  moveAnalyticsTab,
  type AnalyticsTabId,
} from "@/lib/analytics/params";
import type { PeriodKey } from "@/lib/google/aggregates";
import { cn } from "@/lib/utils";

export function AnalyticsTabs({
  active,
  period,
  type,
}: {
  active: AnalyticsTabId;
  period: PeriodKey;
  type?: AnalyticsContentTypeFilter;
}) {
  const router = useRouter();
  const refs = useRef<Partial<Record<AnalyticsTabId, HTMLAnchorElement | null>>>(
    {}
  );

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = moveAnalyticsTab(active, event.key);
    if (next === active) {
      return;
    }
    event.preventDefault();
    router.push(buildAnalyticsHref({ tab: next, period, type }));
    queueMicrotask(() => refs.current[next]?.focus());
  }

  return (
    <div
      role="tablist"
      aria-label="Rubriques Analytics"
      className="flex gap-1 overflow-x-auto border-b border-slate-200"
      onKeyDown={onKeyDown}
    >
      {ANALYTICS_TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <Link
            key={tab.id}
            ref={(node) => {
              refs.current[tab.id] = node;
            }}
            href={buildAnalyticsHref({ tab: tab.id, period, type })}
            role="tab"
            id={`analytics-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`analytics-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            className={cn(
              "inline-flex shrink-0 border-b-2 px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-naxialis/35",
              selected
                ? "border-naxialis text-naxialis"
                : "border-transparent text-slate-600 hover:text-slate-900"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
