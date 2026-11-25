/**
 * Accès inventaire éditorial par workspace (V7.12.0+).
 * V7.12.1 : branché sur doublons / maillage Webflow (jamais de croisement CMS).
 */

import { db } from "@/lib/db";
import {
  getWorkspaceByIdOrSlug,
  workspaceWhere,
  type WorkspaceCmsProvider,
} from "@/lib/workspace";

export type EditorialInventoryPurpose =
  | "all"
  | "duplicates"
  | "internal_links"
  | "seo_opportunities";

export type EditorialInventoryItem = {
  workspaceId: string;
  cmsProvider: WorkspaceCmsProvider;
  cmsExternalId: string;
  title: string;
  slug: string;
  url: string | null;
  status: string;
  excerpt: string | null;
  contentText: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  publishedAt: Date | null;
  modifiedAt: Date | null;
  /** Webflow only — présent dans GET …/items/live. */
  isLive: boolean | null;
};

const DEFAULT_TAKE = 20;
/** Plafond pour modules éditoriaux (doublons / maillage). */
const MAX_TAKE = 2500;

function purposeFilterWebflow(purpose: EditorialInventoryPurpose): {
  status?: string;
  missingAt?: null;
  isLive?: boolean;
} {
  switch (purpose) {
    case "internal_links":
    case "seo_opportunities":
      // Publié + live confirmé — l’appelant filtre encore l’URL.
      return { status: "published", missingAt: null, isLive: true };
    case "duplicates":
      return { missingAt: null };
    case "all":
    default:
      return { missingAt: null };
  }
}

/**
 * Liste l’inventaire de l’espace (WordPress ou Webflow selon cmsProvider).
 * Ne croise jamais les deux CMS.
 */
export async function listEditorialInventory(input: {
  workspaceId: string;
  purpose?: EditorialInventoryPurpose;
  take?: number;
  skip?: number;
  search?: string;
  status?: string;
}): Promise<{
  cmsProvider: WorkspaceCmsProvider;
  items: EditorialInventoryItem[];
  total: number;
}> {
  const workspace = await getWorkspaceByIdOrSlug(input.workspaceId);
  if (!workspace) {
    return { cmsProvider: "wordpress", items: [], total: 0 };
  }

  const purpose = input.purpose ?? "all";
  const take = Math.min(MAX_TAKE, Math.max(1, input.take ?? DEFAULT_TAKE));
  const skip = Math.max(0, input.skip ?? 0);
  const search = input.search?.trim();

  if (workspace.cmsProvider === "webflow") {
    const purposeWhere = purposeFilterWebflow(purpose);
    const where = {
      ...workspaceWhere(workspace.id),
      ...purposeWhere,
      ...(input.status ? { status: input.status } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: "insensitive" as const } },
              { slug: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      db.webflowCmsItem.count({ where }),
      db.webflowCmsItem.findMany({
        where,
        orderBy: [{ lastUpdatedAt: "desc" }, { title: "asc" }],
        take,
        skip,
        select: {
          workspaceId: true,
          webflowItemId: true,
          title: true,
          slug: true,
          url: true,
          status: true,
          excerpt: true,
          contentText: true,
          metaTitle: true,
          metaDescription: true,
          lastPublishedAt: true,
          lastUpdatedAt: true,
          isLive: true,
        },
      }),
    ]);

    return {
      cmsProvider: "webflow",
      total,
      items: rows.map((row) => ({
        workspaceId: row.workspaceId,
        cmsProvider: "webflow" as const,
        cmsExternalId: row.webflowItemId,
        title: row.title,
        slug: row.slug,
        url: row.url,
        status: row.status,
        excerpt: row.excerpt,
        contentText: row.contentText,
        metaTitle: row.metaTitle,
        metaDescription: row.metaDescription,
        publishedAt: row.lastPublishedAt,
        modifiedAt: row.lastUpdatedAt,
        isLive: row.isLive,
      })),
    };
  }

  // WordPress — statuses WP bruts ; purpose internal_links/seo → publish.
  const wpStatus =
    purpose === "internal_links" || purpose === "seo_opportunities"
      ? "publish"
      : input.status;

  const where = {
    ...workspaceWhere(workspace.id),
    ...(wpStatus ? { status: wpStatus } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" as const } },
            { slug: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.wordPressPost.count({ where }),
    db.wordPressPost.findMany({
      where,
      orderBy: [{ modifiedAt: "desc" }, { title: "asc" }],
      take,
      skip,
      select: {
        workspaceId: true,
        wpPostId: true,
        title: true,
        slug: true,
        url: true,
        status: true,
        excerpt: true,
        contentText: true,
        publishedAt: true,
        modifiedAt: true,
      },
    }),
  ]);

  return {
    cmsProvider: "wordpress",
    total,
    items: rows.map((row) => ({
      workspaceId: row.workspaceId,
      cmsProvider: "wordpress" as const,
      cmsExternalId: String(row.wpPostId),
      title: row.title,
      slug: row.slug,
      url: row.url,
      status: row.status,
      excerpt: row.excerpt,
      contentText: row.contentText,
      metaTitle: null,
      metaDescription: null,
      publishedAt: row.publishedAt,
      modifiedAt: row.modifiedAt,
      isLive: null,
    })),
  };
}

/** URL http(s) connue — jamais inventée. */
export function isConfirmedPublicUrl(value: string | null | undefined): boolean {
  if (!value?.trim()) {
    return false;
  }
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
