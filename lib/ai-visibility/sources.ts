import { domainFromUrl, type VisibilityCitation } from "./constants";

export function normalizeCitations(value: unknown): VisibilityCitation[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: VisibilityCitation[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url.trim() : "";
    if (!url || !/^https?:\/\//i.test(url) || seen.has(url)) {
      continue;
    }
    seen.add(url);
    out.push({
      title: typeof record.title === "string" ? record.title : null,
      url,
      domain:
        typeof record.domain === "string"
          ? record.domain
          : domainFromUrl(url),
    });
  }
  return out.slice(0, 30);
}
