/**
 * Types références WordPress V7.13.2 (IDs numériques — jamais Webflow).
 */

export const WP_CATEGORIZATION_MODES = ["automatic", "manual"] as const;
export type WpCategorizationMode = (typeof WP_CATEGORIZATION_MODES)[number];

export const WP_AUTHOR_CAPABILITIES = [
  "self_only",
  "can_list_authors",
  "can_assign",
  "unknown",
] as const;
export type WpAuthorCapability = (typeof WP_AUTHOR_CAPABILITIES)[number];

export type WordPressReferenceKind = "category" | "author";

export type SyncedWpCategoryRef = {
  id: number;
  name: string;
  slug: string;
  parent: number | null;
  count: number;
  description: string;
};

export type SyncedWpAuthorRef = {
  id: number;
  name: string;
  slug: string;
};

export function isWpCategorizationMode(
  value: unknown
): value is WpCategorizationMode {
  return value === "automatic" || value === "manual";
}

export function normalizeWpCategorizationMode(
  value: string | null | undefined
): WpCategorizationMode {
  return value === "manual" ? "manual" : "automatic";
}

export function parseWpCategoryIdsJson(
  raw: string | null | undefined
): number[] {
  if (!raw?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    const ids: number[] = [];
    const seen = new Set<number>();
    for (const value of parsed) {
      const id = Number(value);
      if (!Number.isInteger(id) || id <= 0 || seen.has(id)) {
        continue;
      }
      seen.add(id);
      ids.push(id);
    }
    return ids;
  } catch {
    return [];
  }
}

export function serializeWpCategoryIds(ids: number[]): string | null {
  const unique = [
    ...new Set(ids.filter((id) => Number.isInteger(id) && id > 0)),
  ];
  return unique.length > 0 ? JSON.stringify(unique) : null;
}
