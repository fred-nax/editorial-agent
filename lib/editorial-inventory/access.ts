/**
 * Accès inventaire éditorial par workspace (V7.12.0).
 * Prépare doublons / maillage / SEO — non branché sur ces modules dans cette version.
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
};

function purposeFilter(
  purpose: EditorialInventoryPurpose
): { status?: string | { in: string[] }; missingAt?: null } {
  switch (purpose) {
    case "internal_links":
    case "seo_opportunities":
      // Contenus réellement publiés (pas de brouillon / missing).
      return { status: "published", missingAt: null };
    case "duplicates":
      // Tous les articles non manquants (y compris draft/changed/archived).
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
  const take = Math.min(100, Math.max(1, input.take ?? 20));
  const skip = Math.max(0, input.skip ?? 0);
  const search = input.search?.trim();

  if (workspace.cmsProvider === "webflow") {
    const purposeWhere = purposeFilter(purpose);
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
    })),
  };
}
