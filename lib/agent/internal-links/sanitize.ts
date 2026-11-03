import { normalizeInternalUrl, isNaxialisHost } from "./catalog";
import type { SanitizeResult } from "./types";

/**
 * Ne conserve les liens internes (hôte du site) que s'ils sont dans le set autorisé.
 * Les ancres invalides sont unwrapées : le texte reste, le <a> disparaît.
 * Les liens externes sont laissés intacts.
 */
export function sanitizeInternalLinks(
  html: string,
  allowedUrls: Iterable<string>,
  siteHost: string
): SanitizeResult {
  const allowed = new Set<string>();
  for (const url of allowedUrls) {
    const normalized = normalizeInternalUrl(url);
    if (normalized) {
      allowed.add(normalized.replace(/\/$/, "").toLowerCase());
    }
  }

  const keptUrls: string[] = [];
  const removedUrls: string[] = [];
  const seenInternal = new Set<string>();
  const duplicateUrls: string[] = [];

  const content = html.replace(
    /<a\b([^>]*?)href\s*=\s*(["'])(.*?)\2([^>]*)>([\s\S]*?)<\/a>/gi,
    (full, pre: string, _q: string, href: string, post: string, inner: string) => {
      const rawHref = href.trim();
      let absolute: string | null = null;
      try {
        if (/^https?:\/\//i.test(rawHref)) {
          absolute = normalizeInternalUrl(rawHref);
        } else if (rawHref.startsWith("/")) {
          absolute = normalizeInternalUrl(`https://${siteHost}${rawHref}`);
        } else {
          // mailto, anchors, relative non-root → laisser
          return full;
        }
      } catch {
        return full;
      }

      if (!absolute) {
        return full;
      }

      let host: string;
      try {
        host = new URL(absolute).hostname;
      } catch {
        return full;
      }

      if (!isNaxialisHost(host, siteHost)) {
        return full;
      }

      const key = absolute.replace(/\/$/, "").toLowerCase();
      if (!allowed.has(key)) {
        removedUrls.push(absolute);
        return inner;
      }

      if (seenInternal.has(key)) {
        duplicateUrls.push(absolute);
        return inner;
      }
      seenInternal.add(key);
      keptUrls.push(absolute);
      return `<a${pre}href="${absolute}"${post}>${inner}</a>`;
    }
  );

  return { content, keptUrls, removedUrls, duplicateUrls };
}

export function extractInternalHrefs(
  html: string,
  siteHost: string
): string[] {
  const urls: string[] = [];
  const re =
    /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const href = match[2]?.trim() ?? "";
    let absolute: string | null = null;
    if (/^https?:\/\//i.test(href)) {
      absolute = normalizeInternalUrl(href);
    } else if (href.startsWith("/")) {
      absolute = normalizeInternalUrl(`https://${siteHost}${href}`);
    }
    if (!absolute) {
      continue;
    }
    try {
      if (isNaxialisHost(new URL(absolute).hostname, siteHost)) {
        urls.push(absolute);
      }
    } catch {
      // ignore
    }
  }
  return urls;
}
