/**
 * Catalogue de maillage Webflow — URL confirmées + live uniquement.
 * Ne jamais inventer d’URL. Ne jamais lire WordPressPost.
 */

import { listEditorialInventory, isConfirmedPublicUrl } from "@/lib/editorial-inventory/access";
import { getWebflowInventoryDiagnostic } from "@/lib/webflow/inventory";
import { decodeHtmlEntities, stripHtml } from "@/lib/seo/normalize";
import type { CatalogEntry } from "./types";

const STALE_MS = 24 * 60 * 60 * 1000;

function inferTheme(title: string, excerpt: string, slug: string): string {
  const blob = `${title} ${excerpt} ${slug}`.toLowerCase();
  const rules: Array<{ theme: string; needles: string[] }> = [
    {
      theme: "agents IA / MCP",
      needles: ["agent", "mcp", "llm", "openai", "mistral", "rag", "automation"],
    },
    {
      theme: "API / intégrations",
      needles: ["api", "webhook", "intégration", "integration", "rest"],
    },
    {
      theme: "SaaS / développement web",
      needles: ["saas", "next.js", "nextjs", "application", "workflow"],
    },
    {
      theme: "SEO / GEO",
      needles: ["seo", "geo", "référencement", "referencement", "schema"],
    },
  ];
  for (const rule of rules) {
    if (rule.needles.some((needle) => blob.includes(needle))) {
      return rule.theme;
    }
  }
  return "général";
}

/**
 * Destinations maillage Webflow :
 * - même workspace
 * - status published
 * - isLive confirmé
 * - URL publique http(s) connue
 */
export async function loadWebflowPublishedCatalog(workspaceId: string): Promise<{
  entries: CatalogEntry[];
  stale: boolean;
  liveUnavailable: boolean;
  lastSyncAt: string | null;
}> {
  const [diagnostic, inventory] = await Promise.all([
    getWebflowInventoryDiagnostic(workspaceId),
    listEditorialInventory({
      workspaceId,
      purpose: "internal_links",
      take: 2500,
    }),
  ]);

  const liveUnavailable =
    !diagnostic.lastSync ||
    (diagnostic.lastSync.liveFetchedCount != null &&
      diagnostic.lastSync.liveFetchedCount === 0 &&
      (diagnostic.lastSync.diagnosticNote ?? "").toLowerCase().includes("live"));

  const finishedAt = diagnostic.lastSync?.finishedAt;
  const stale =
    !finishedAt ||
    diagnostic.lastSync?.status === "failed" ||
    Date.now() - finishedAt.getTime() > STALE_MS;

  // Si live indisponible et aucune URL fiable → catalogue vide (règle V7.12.1).
  const entries: CatalogEntry[] = [];
  for (const item of inventory.items) {
    if (item.status !== "published") {
      continue;
    }
    if (item.isLive !== true) {
      continue;
    }
    if (!isConfirmedPublicUrl(item.url)) {
      continue;
    }
    const title = decodeHtmlEntities(item.title);
    const excerpt = item.excerpt
      ? decodeHtmlEntities(stripHtml(item.excerpt)).slice(0, 400)
      : "";
    entries.push({
      wpPostId: 0,
      cmsExternalId: item.cmsExternalId,
      title,
      url: item.url!,
      slug: item.slug,
      excerpt,
      categories: [],
      tags: [],
      theme: inferTheme(title, excerpt, item.slug),
      publishedAt: item.publishedAt,
      status: item.status,
    });
  }

  if (liveUnavailable && entries.length === 0) {
    return {
      entries: [],
      stale,
      liveUnavailable: true,
      lastSyncAt: finishedAt?.toISOString() ?? null,
    };
  }

  return {
    entries,
    stale,
    liveUnavailable,
    lastSyncAt: finishedAt?.toISOString() ?? null,
  };
}
