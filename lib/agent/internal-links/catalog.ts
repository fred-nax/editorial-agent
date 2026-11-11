import { db } from "../../db";
import { logInfo } from "../../logger";
import { decodeHtmlEntities, stripHtml } from "../../seo/normalize";
import type { CatalogEntry } from "./types";

const STALE_MS = 24 * 60 * 60 * 1000;

function asCategoryIds(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "number" ? item : Number(item)))
    .filter((item) => Number.isFinite(item));
}

function inferTheme(title: string, excerpt: string, slug: string): string {
  const blob = `${title} ${excerpt} ${slug}`.toLowerCase();
  const rules: Array<{ theme: string; needles: string[] }> = [
    {
      theme: "sécurité / cybersécurité",
      needles: [
        "sécur",
        "secur",
        "faille",
        "cve",
        "dmarc",
        "spf",
        "dkim",
        "phishing",
        "auth",
      ],
    },
    {
      theme: "agents IA / MCP",
      needles: ["agent", "mcp", "llm", "openai", "mistral", "rag"],
    },
    {
      theme: "API / intégrations",
      needles: ["api", "webhook", "intégration", "integration", "rest"],
    },
    {
      theme: "email / deliverability",
      needles: ["email", "brevo", "smtp", "newsletter", "dmarc", "spf"],
    },
    {
      theme: "WordPress / headless",
      needles: ["wordpress", "headless", "woocommerce", "gutenberg"],
    },
    {
      theme: "automatisation",
      needles: ["automat", "n8n", "make", "workflow", "facturation"],
    },
    {
      theme: "SaaS / développement web",
      needles: ["saas", "next.js", "nextjs", "application"],
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

export async function isInventoryStale(): Promise<boolean> {
  const last = await db.wordPressSyncRun.findFirst({
    where: { status: "completed" },
    orderBy: { finishedAt: "desc" },
    select: { finishedAt: true },
  });
  if (!last?.finishedAt) {
    return true;
  }
  return Date.now() - last.finishedAt.getTime() > STALE_MS;
}

/**
 * Catalogue des destinations de maillage : posts publiés de l'inventaire local.
 * Ne jamais inventer d'URL. L'actualisation passe par la sync inventaire SEO existante.
 */
export async function loadPublishedCatalog(): Promise<{
  entries: CatalogEntry[];
  stale: boolean;
}> {
  const stale = await isInventoryStale();

  const rows = await db.wordPressPost.findMany({
    where: { status: "publish" },
    orderBy: [{ publishedAt: "desc" }, { modifiedAt: "desc" }],
  });

  const entries: CatalogEntry[] = [];
  const seenUrls = new Set<string>();

  for (const row of rows) {
    const url = row.url?.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      continue;
    }
    const normalizedUrl = normalizeInternalUrl(url);
    if (!normalizedUrl || seenUrls.has(normalizedUrl)) {
      continue;
    }
    seenUrls.add(normalizedUrl);

    const title = decodeHtmlEntities(stripHtml(row.title || row.slug));
    const excerpt = decodeHtmlEntities(stripHtml(row.excerpt ?? ""));
    entries.push({
      wpPostId: row.wpPostId,
      title,
      url: normalizedUrl,
      slug: row.slug,
      excerpt,
      categories: asCategoryIds(row.categories),
      tags: [],
      theme: inferTheme(title, excerpt, row.slug),
      publishedAt: row.publishedAt,
      status: row.status,
    });
  }

  logInfo("internal-links", "catalog loaded", {
    size: entries.length,
    stale: stale ? 1 : 0,
  });

  return { entries, stale };
}

export function normalizeInternalUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw.trim());
    parsed.hash = "";
    parsed.search = "";
    let path = parsed.pathname.replace(/\/+/g, "/");
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    parsed.pathname = path || "/";
    const href = `${parsed.origin}${parsed.pathname === "/" ? "/" : parsed.pathname}`;
    return href;
  } catch {
    return null;
  }
}

export function isNaxialisHost(hostname: string, siteHost: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  const site = siteHost.toLowerCase().replace(/^www\./, "");
  return host === site || host.endsWith(`.${site}`);
}
