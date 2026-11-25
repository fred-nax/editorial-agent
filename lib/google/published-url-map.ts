/**
 * Rapprochement URLs publiques inventaire ↔ Search Console (V7.14.0).
 * WordPress : posts publish. Webflow : items live avec URL confirmée uniquement.
 */

import { db } from "@/lib/db";
import { normalizePublicUrl } from "@/lib/google/url-normalize";
import { isConfirmedPublicUrl } from "@/lib/editorial-inventory/access";
import {
  getWorkspaceByIdOrSlug,
  WORKSPACE_IDS,
} from "@/lib/workspace";

export type PublishedUrlMatch = {
  pageUrl: string;
  pageUrlNorm: string;
  wpPostId: number | null;
  cmsExternalId: string | null;
};

/** Map URL normalisée → match inventaire pour un workspace. */
export async function buildPublishedUrlMapForWorkspace(
  workspaceId: string
): Promise<Map<string, PublishedUrlMatch>> {
  const workspace = await getWorkspaceByIdOrSlug(workspaceId);
  if (!workspace) {
    return new Map();
  }

  const map = new Map<string, PublishedUrlMatch>();

  if (workspace.cmsProvider === "webflow") {
    const items = await db.webflowCmsItem.findMany({
      where: {
        workspaceId,
        missingAt: null,
        isLive: true,
        status: "published",
      },
      select: { webflowItemId: true, url: true },
    });
    for (const item of items) {
      if (!item.url || !isConfirmedPublicUrl(item.url)) {
        continue;
      }
      // Refus des URLs Designer / preview / admin.
      if (
        /webflow\.io\/design|preview\.webflow|\.design\.webflow|webflow\.com\/dashboard/i.test(
          item.url
        )
      ) {
        continue;
      }
      const norm = normalizePublicUrl(item.url);
      if (!norm) {
        continue;
      }
      map.set(norm, {
        pageUrl: item.url,
        pageUrlNorm: norm,
        wpPostId: null,
        cmsExternalId: item.webflowItemId,
      });
    }
    return map;
  }

  // WordPress
  const { isWordPressInventoryUsable } = await import(
    "@/lib/settings/inventory-guard"
  );
  if (
    workspaceId === WORKSPACE_IDS.wordpress &&
    !(await isWordPressInventoryUsable())
  ) {
    return new Map();
  }

  const posts = await db.wordPressPost.findMany({
    where: { workspaceId, status: "publish" },
    select: { wpPostId: true, url: true },
  });
  for (const post of posts) {
    const norm = normalizePublicUrl(post.url);
    if (!norm) {
      continue;
    }
    map.set(norm, {
      pageUrl: post.url,
      pageUrlNorm: norm,
      wpPostId: post.wpPostId,
      cmsExternalId: String(post.wpPostId),
    });
  }
  return map;
}

/** @deprecated Préférer buildPublishedUrlMapForWorkspace. */
export async function buildPublishedUrlMap(): Promise<Map<string, number>> {
  const map = await buildPublishedUrlMapForWorkspace(WORKSPACE_IDS.wordpress);
  const legacy = new Map<string, number>();
  for (const [norm, match] of map) {
    if (match.wpPostId != null) {
      legacy.set(norm, match.wpPostId);
    }
  }
  return legacy;
}

export async function resolvePublishedUrlForGeneration(input: {
  workspaceId: string;
  cmsDestination?: string | null;
  wpPostId?: number | null;
  wpUrl?: string | null;
  cmsExternalId?: string | null;
}): Promise<PublishedUrlMatch | null> {
  const workspaceId = input.workspaceId.trim();
  const isWebflow = input.cmsDestination === "webflow";

  if (isWebflow) {
    const externalId = input.cmsExternalId?.trim();
    if (!externalId) {
      return null;
    }
    const item = await db.webflowCmsItem.findFirst({
      where: {
        workspaceId,
        webflowItemId: externalId,
        missingAt: null,
      },
      select: {
        url: true,
        status: true,
        isLive: true,
        webflowItemId: true,
      },
    });
    if (
      !item ||
      item.status !== "published" ||
      !item.isLive ||
      !item.url ||
      !isConfirmedPublicUrl(item.url)
    ) {
      return null;
    }
    const norm = normalizePublicUrl(item.url);
    if (!norm) {
      return null;
    }
    return {
      pageUrl: item.url,
      pageUrlNorm: norm,
      wpPostId: null,
      cmsExternalId: item.webflowItemId,
    };
  }

  if (typeof input.wpPostId === "number" && input.wpPostId > 0) {
    const post = await db.wordPressPost.findFirst({
      where: { workspaceId, wpPostId: input.wpPostId },
      select: { url: true, status: true, wpPostId: true },
    });
    if (post?.status === "publish") {
      const norm = normalizePublicUrl(post.url);
      if (norm) {
        return {
          pageUrl: post.url,
          pageUrlNorm: norm,
          wpPostId: post.wpPostId,
          cmsExternalId: String(post.wpPostId),
        };
      }
    }
  }

  if (input.wpUrl && !/[?&]p=\d+/i.test(input.wpUrl)) {
    const norm = normalizePublicUrl(input.wpUrl);
    if (norm) {
      return {
        pageUrl: input.wpUrl,
        pageUrlNorm: norm,
        wpPostId: input.wpPostId ?? null,
        cmsExternalId:
          input.wpPostId != null ? String(input.wpPostId) : null,
      };
    }
  }

  return null;
}
