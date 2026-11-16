import type { PeriodKey } from "@/lib/google/aggregates";
import type { AnalyticsContentTypeFilter } from "@/lib/analytics/content-type";

export const ANALYTICS_TABS = [
  { id: "overview", label: "Vue d'ensemble" },
  { id: "seo", label: "Performances SEO" },
  { id: "ai", label: "Trafic IA" },
  { id: "articles", label: "Contenus" },
] as const;

export type AnalyticsTabId = (typeof ANALYTICS_TABS)[number]["id"];

export const ANALYTICS_PERIODS: PeriodKey[] = [7, 28, 90];

export type AnalyticsSortDir = "asc" | "desc";

export function parseAnalyticsTab(raw: string | null | undefined): AnalyticsTabId {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "seo" || value === "ai" || value === "articles") {
    return value;
  }
  return "overview";
}

export function parseAnalyticsPeriod(
  raw: string | null | undefined
): PeriodKey {
  const n = Number(raw);
  if (n === 7 || n === 28 || n === 90) {
    return n;
  }
  return 28;
}

export function parsePositiveInt(
  raw: string | null | undefined,
  fallback: number
): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    return fallback;
  }
  return Math.floor(n);
}

export function parseSortDir(raw: string | null | undefined): AnalyticsSortDir {
  return raw === "asc" ? "asc" : "desc";
}

export function buildAnalyticsHref(input: {
  tab?: AnalyticsTabId;
  period?: PeriodKey;
  q?: string;
  sort?: string;
  dir?: AnalyticsSortDir;
  page?: number;
  type?: AnalyticsContentTypeFilter;
}): string {
  const params = new URLSearchParams();
  const tab = input.tab ?? "overview";
  const period = input.period ?? 28;
  if (tab !== "overview") {
    params.set("tab", tab);
  }
  if (period !== 28) {
    params.set("period", String(period));
  }
  if (input.type && input.type !== "all") {
    params.set("type", input.type);
  }
  if (input.q?.trim()) {
    params.set("q", input.q.trim());
  }
  if (input.sort) {
    params.set("sort", input.sort);
  }
  if (input.dir && input.dir !== "desc") {
    params.set("dir", input.dir);
  }
  if (input.page && input.page > 1) {
    params.set("page", String(input.page));
  }
  const qs = params.toString();
  return qs ? `/analytics?${qs}` : "/analytics";
}

export function moveAnalyticsTab(
  current: AnalyticsTabId,
  key: string
): AnalyticsTabId {
  const index = ANALYTICS_TABS.findIndex((tab) => tab.id === current);
  if (key === "ArrowRight") {
    return ANALYTICS_TABS[(index + 1) % ANALYTICS_TABS.length].id;
  }
  if (key === "ArrowLeft") {
    return ANALYTICS_TABS[
      (index - 1 + ANALYTICS_TABS.length) % ANALYTICS_TABS.length
    ].id;
  }
  if (key === "Home") {
    return ANALYTICS_TABS[0].id;
  }
  if (key === "End") {
    return ANALYTICS_TABS[ANALYTICS_TABS.length - 1].id;
  }
  return current;
}
