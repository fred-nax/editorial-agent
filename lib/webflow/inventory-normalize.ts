/**
 * Normalisation inventaire Webflow via mapping CMS (lecture seule).
 * Aucun champ inventé : absents → null.
 */

import { stripHtml } from "@/lib/seo/normalize";
import type { WebflowCmsItemRemote } from "@/lib/webflow/items";
import type { WebflowFieldMapping } from "@/lib/webflow/types";

export type WebflowInventoryStatus =
  | "published"
  | "draft"
  | "archived"
  | "changed"
  | "missing";

export type NormalizedWebflowInventoryItem = {
  webflowItemId: string;
  title: string;
  slug: string;
  url: string | null;
  status: WebflowInventoryStatus;
  isDraft: boolean;
  isArchived: boolean;
  isLive: boolean;
  excerpt: string | null;
  contentHtml: string | null;
  contentText: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  featuredImageUrl: string | null;
  featuredImageAlt: string | null;
  categoryRef: string | null;
  authorRef: string | null;
  createdOnAt: Date | null;
  lastUpdatedAt: Date | null;
  lastPublishedAt: Date | null;
};

function fieldSlug(
  mapping: WebflowFieldMapping,
  key: keyof WebflowFieldMapping
): string | null {
  const slug = mapping[key]?.fieldSlug?.trim();
  return slug || null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function asRef(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    if (typeof row.id === "string" && row.id.trim()) {
      return row.id.trim();
    }
    if (typeof row.name === "string" && row.name.trim()) {
      return row.name.trim();
    }
  }
  if (Array.isArray(value) && value.length > 0) {
    return asRef(value[0]);
  }
  return null;
}

function asImage(value: unknown): { url: string | null; alt: string | null } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) {
      return { url: value.trim(), alt: null };
    }
    return { url: null, alt: null };
  }
  const row = value as Record<string, unknown>;
  const url =
    typeof row.url === "string" && /^https?:\/\//i.test(row.url.trim())
      ? row.url.trim()
      : null;
  const alt =
    typeof row.alt === "string"
      ? row.alt.trim() || null
      : typeof row.fileName === "string"
        ? row.fileName.trim() || null
        : null;
  return { url, alt };
}

function parseDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Statut éditorial dérivé des flags Webflow + présence live.
 * - archived : isArchived
 * - draft : jamais publié
 * - changed : publié + modifications non publiées (isDraft ou lastUpdated > lastPublished)
 * - published : présent en live (ou lastPublished sans draft)
 */
export function deriveWebflowInventoryStatus(input: {
  isDraft: boolean;
  isArchived: boolean;
  isLive: boolean;
  lastPublished: string | null;
  lastUpdated: string | null;
}): WebflowInventoryStatus {
  if (input.isArchived) {
    return "archived";
  }
  const publishedAt = parseDate(input.lastPublished);
  if (!publishedAt) {
    return "draft";
  }
  const updatedAt = parseDate(input.lastUpdated);
  const hasUnpublishedEdits =
    input.isDraft ||
    (updatedAt !== null && updatedAt.getTime() > publishedAt.getTime());
  if (hasUnpublishedEdits) {
    return "changed";
  }
  if (input.isLive || publishedAt) {
    return "published";
  }
  return "draft";
}

export function normalizeWebflowInventoryItem(
  remote: WebflowCmsItemRemote,
  mapping: WebflowFieldMapping,
  options: { isLive: boolean }
): NormalizedWebflowInventoryItem {
  const fd = remote.fieldData;
  const titleSlug = fieldSlug(mapping, "title");
  const slugSlug = fieldSlug(mapping, "slug");
  const contentSlug = fieldSlug(mapping, "content");
  const excerptSlug = fieldSlug(mapping, "excerpt");
  const metaTitleSlug = fieldSlug(mapping, "meta_title");
  const metaDescSlug = fieldSlug(mapping, "meta_description");
  const imageSlug = fieldSlug(mapping, "featured_image");
  const altSlug = fieldSlug(mapping, "alt_text");
  const categorySlug = fieldSlug(mapping, "category");
  const authorSlug = fieldSlug(mapping, "author");

  const titleRaw = titleSlug ? asString(fd[titleSlug]) : null;
  const slugRaw = slugSlug ? asString(fd[slugSlug]) : null;
  const contentHtml = contentSlug ? asString(fd[contentSlug]) : null;
  const excerptRaw = excerptSlug ? asString(fd[excerptSlug]) : null;
  const metaTitle = metaTitleSlug ? asString(fd[metaTitleSlug]) : null;
  const metaDescription = metaDescSlug ? asString(fd[metaDescSlug]) : null;
  const image = imageSlug ? asImage(fd[imageSlug]) : { url: null, alt: null };
  const altFromField = altSlug ? asString(fd[altSlug]) : null;

  const title =
    (titleRaw ? stripHtml(titleRaw).slice(0, 500) : "") ||
    `Item ${remote.id.slice(-6)}`;
  const slug = (slugRaw ?? remote.id).slice(0, 250);
  const excerpt = excerptRaw
    ? stripHtml(excerptRaw).slice(0, 2000) || null
    : null;
  const contentText = contentHtml
    ? stripHtml(contentHtml).slice(0, 20000) || null
    : null;

  const status = deriveWebflowInventoryStatus({
    isDraft: remote.isDraft,
    isArchived: remote.isArchived,
    isLive: options.isLive,
    lastPublished: remote.lastPublished,
    lastUpdated: remote.lastUpdated,
  });

  return {
    webflowItemId: remote.id,
    title,
    slug,
    url: null,
    status,
    isDraft: remote.isDraft,
    isArchived: remote.isArchived,
    isLive: options.isLive,
    excerpt,
    contentHtml: contentHtml ? contentHtml.slice(0, 200_000) : null,
    contentText,
    metaTitle: metaTitle ? stripHtml(metaTitle).slice(0, 300) : null,
    metaDescription: metaDescription
      ? stripHtml(metaDescription).slice(0, 600)
      : null,
    featuredImageUrl: image.url,
    featuredImageAlt: altFromField ?? image.alt,
    categoryRef: categorySlug ? asRef(fd[categorySlug]) : null,
    authorRef: authorSlug ? asRef(fd[authorSlug]) : null,
    createdOnAt: parseDate(remote.createdOn),
    lastUpdatedAt: parseDate(remote.lastUpdated),
    lastPublishedAt: parseDate(remote.lastPublished),
  };
}
