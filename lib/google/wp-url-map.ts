import { db } from "@/lib/db";
import { normalizePublicUrl } from "@/lib/google/url-normalize";

/** Map URL normalisée → wpPostId pour les articles publiés inventoriés. */
export async function buildPublishedUrlMap(): Promise<Map<string, number>> {
  const { isWordPressInventoryUsable } = await import(
    "@/lib/settings/inventory-guard"
  );
  if (!(await isWordPressInventoryUsable())) {
    return new Map();
  }

  const posts = await db.wordPressPost.findMany({
    where: { status: "publish" },
    select: { wpPostId: true, url: true },
  });
  const map = new Map<string, number>();
  for (const post of posts) {
    const norm = normalizePublicUrl(post.url);
    if (norm) {
      map.set(norm, post.wpPostId);
    }
  }
  return map;
}

export async function resolvePublishedUrlForGeneration(input: {
  wpPostId: number | null;
  wpUrl: string | null;
}): Promise<{ pageUrl: string; pageUrlNorm: string; wpPostId: number } | null> {
  if (typeof input.wpPostId === "number" && input.wpPostId > 0) {
    const post = await db.wordPressPost.findUnique({
      where: { wpPostId: input.wpPostId },
      select: { url: true, status: true, wpPostId: true },
    });
    if (post?.status === "publish") {
      const norm = normalizePublicUrl(post.url);
      if (norm) {
        return { pageUrl: post.url, pageUrlNorm: norm, wpPostId: post.wpPostId };
      }
    }
  }
  // Ne pas utiliser une URL de brouillon (?p=) comme page publique.
  if (input.wpUrl && !/[?&]p=\d+/i.test(input.wpUrl)) {
    const norm = normalizePublicUrl(input.wpUrl);
    if (norm) {
      return {
        pageUrl: input.wpUrl,
        pageUrlNorm: norm,
        wpPostId: input.wpPostId ?? 0,
      };
    }
  }
  return null;
}
