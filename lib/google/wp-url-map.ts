/**
 * Compat V7.13 — wrappers WordPress.
 * Préférer `published-url-map.ts` (multi-CMS / workspace).
 */

import { WORKSPACE_IDS } from "@/lib/workspace/constants";
import {
  buildPublishedUrlMap as buildPublishedUrlMapScoped,
  resolvePublishedUrlForGeneration as resolvePublishedUrlScoped,
} from "@/lib/google/published-url-map";

export async function buildPublishedUrlMap(): Promise<Map<string, number>> {
  return buildPublishedUrlMapScoped();
}

export async function resolvePublishedUrlForGeneration(input: {
  wpPostId: number | null;
  wpUrl: string | null;
  workspaceId?: string;
}): Promise<{ pageUrl: string; pageUrlNorm: string; wpPostId: number } | null> {
  const match = await resolvePublishedUrlScoped({
    workspaceId: input.workspaceId?.trim() || WORKSPACE_IDS.wordpress,
    cmsDestination: "wordpress",
    wpPostId: input.wpPostId,
    wpUrl: input.wpUrl,
  });
  if (!match) {
    return null;
  }
  return {
    pageUrl: match.pageUrl,
    pageUrlNorm: match.pageUrlNorm,
    wpPostId: match.wpPostId ?? 0,
  };
}
