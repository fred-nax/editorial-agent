export const ANALYTICS_CONTENT_TYPES = [
  { id: "all", label: "Tous" },
  { id: "post", label: "Articles" },
  { id: "page", label: "Pages" },
] as const;

export type AnalyticsContentTypeFilter =
  (typeof ANALYTICS_CONTENT_TYPES)[number]["id"];

export type ResolvedContentType = "post" | "page" | "unknown";

export function parseAnalyticsContentType(
  raw: string | null | undefined
): AnalyticsContentTypeFilter {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "post" || value === "page") {
    return value;
  }
  return "all";
}

export function contentTypeLabel(type: ResolvedContentType): string {
  switch (type) {
    case "post":
      return "Article";
    case "page":
      return "Page";
    default:
      return "Non identifié";
  }
}

export function matchesContentTypeFilter(
  type: ResolvedContentType,
  filter: AnalyticsContentTypeFilter
): boolean {
  if (filter === "all") {
    return true;
  }
  return type === filter;
}

export function resolveInventoryContentType(
  raw: string | null | undefined
): ResolvedContentType {
  if (raw === "post" || raw === "page") {
    return raw;
  }
  return "unknown";
}
