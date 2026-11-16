import {
  contentTypeLabel,
  resolveInventoryContentType,
  type ResolvedContentType,
} from "@/lib/analytics/content-type";
import { normalizePublicUrl } from "@/lib/google/url-normalize";

export type DashboardTopPageInput = {
  pageUrlNorm: string;
  clicks: number;
  impressions: number;
  wpPostId?: number | null;
};

export type DashboardTopPageView = {
  pageUrlNorm: string;
  clicks: number;
  impressions: number;
  /** Titre WordPress ou chemin d’URL lisible. */
  label: string;
  /** Fiche article interne (`/articles/:id`) si une génération existe. */
  articleHref: string | null;
  /** URL publique (lien externe si pas de fiche interne). */
  publicUrl: string;
  matchedWordPress: boolean;
  contentType: ResolvedContentType;
  contentTypeLabel: string;
};

export type PropertyDailyPoint = {
  date: string;
  clicks: number | null;
  impressions: number | null;
};

/** Affiche un chemin lisible (sans schéma) pour une URL normalisée. */
export function readableUrlLabel(pageUrlNorm: string): string {
  try {
    const url = new URL(pageUrlNorm);
    if (url.pathname && url.pathname !== "/") {
      return `${url.hostname}${url.pathname}`.replace(/\/$/, "");
    }
    return url.hostname;
  } catch {
    return pageUrlNorm;
  }
}

export type PublishedPostRef = {
  wpPostId: number;
  title: string;
  url: string;
  contentType?: string | null;
};

export function resolveTopPagePresentation(input: {
  page: DashboardTopPageInput;
  wpPost: PublishedPostRef | null;
  articleId: string | null;
}): DashboardTopPageView {
  const publicUrl = input.wpPost?.url ?? input.page.pageUrlNorm;
  if (input.wpPost) {
    const contentType = resolveInventoryContentType(input.wpPost.contentType);
    return {
      pageUrlNorm: input.page.pageUrlNorm,
      clicks: input.page.clicks,
      impressions: input.page.impressions,
      label: input.wpPost.title.trim() || readableUrlLabel(input.page.pageUrlNorm),
      articleHref: input.articleId ? `/articles/${input.articleId}` : null,
      publicUrl,
      matchedWordPress: true,
      contentType,
      contentTypeLabel: contentTypeLabel(contentType),
    };
  }
  return {
    pageUrlNorm: input.page.pageUrlNorm,
    clicks: input.page.clicks,
    impressions: input.page.impressions,
    label: readableUrlLabel(input.page.pageUrlNorm),
    articleHref: null,
    publicUrl: input.page.pageUrlNorm,
    matchedWordPress: false,
    contentType: "unknown",
    contentTypeLabel: contentTypeLabel("unknown"),
  };
}

/** Indexe les posts publiés par URL normalisée (une passe, pas de N+1). */
export function indexPublishedPostsByNorm(
  posts: PublishedPostRef[]
): Map<string, PublishedPostRef> {
  const map = new Map<string, PublishedPostRef>();
  for (const post of posts) {
    const norm = normalizePublicUrl(post.url);
    if (norm && !map.has(norm)) {
      map.set(norm, post);
    }
  }
  return map;
}

/** Première génération (déjà triée desc) par wpPostId. */
export function indexLatestArticleIdByWpPostId(
  articles: Array<{ id: string; wpPostId: number | null }>
): Map<number, string> {
  const map = new Map<number, string>();
  for (const article of articles) {
    if (typeof article.wpPostId !== "number" || article.wpPostId <= 0) {
      continue;
    }
    if (!map.has(article.wpPostId)) {
      map.set(article.wpPostId, article.id);
    }
  }
  return map;
}

export function enrichTopPages(input: {
  pages: DashboardTopPageInput[];
  postsByNorm: Map<string, PublishedPostRef>;
  postsById: Map<number, PublishedPostRef>;
  articleIdByWpPostId: Map<number, string>;
}): DashboardTopPageView[] {
  return input.pages.map((page) => {
    const fromId =
      typeof page.wpPostId === "number" && page.wpPostId > 0
        ? (input.postsById.get(page.wpPostId) ?? null)
        : null;
    const wpPost = fromId ?? input.postsByNorm.get(page.pageUrlNorm) ?? null;
    const articleId = wpPost
      ? (input.articleIdByWpPostId.get(wpPost.wpPostId) ?? null)
      : null;
    return resolveTopPagePresentation({ page, wpPost, articleId });
  });
}

/**
 * Série quotidienne propriété sur [start, end].
 * Les jours sans ligne GSC restent `null` (pas de zéro fictif).
 */
export function buildPropertyDailySeries(
  rows: Array<{
    date: Date | string;
    clicks: number;
    impressions: number;
    hasData?: boolean;
  }>,
  start: Date,
  end: Date
): PropertyDailyPoint[] {
  const byDate = new Map<string, { clicks: number; impressions: number }>();
  for (const row of rows) {
    if (row.hasData === false) {
      continue;
    }
    const key =
      typeof row.date === "string"
        ? row.date.slice(0, 10)
        : row.date.toISOString().slice(0, 10);
    byDate.set(key, { clicks: row.clicks, impressions: row.impressions });
  }

  const out: PropertyDailyPoint[] = [];
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  );
  const last = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  );
  while (cursor <= last) {
    const key = cursor.toISOString().slice(0, 10);
    const hit = byDate.get(key);
    out.push(
      hit
        ? { date: key, clicks: hit.clicks, impressions: hit.impressions }
        : { date: key, clicks: null, impressions: null }
    );
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
