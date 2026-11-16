/**
 * Normalise une URL publique pour croiser GSC / GA4 / WordPressPost.
 * - lowercase host
 * - retire fragment, utm_*, trailing slash (sauf racine)
 * - conserve le chemin et la query métier non tracking
 */
export function normalizePublicUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    const drop = new Set([
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
      "mc_cid",
      "mc_eid",
    ]);
    for (const key of [...url.searchParams.keys()]) {
      if (drop.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    let path = url.pathname || "/";
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    url.pathname = path;
    const search = url.searchParams.toString();
    return `${url.protocol}//${url.host}${url.pathname}${search ? `?${search}` : ""}`;
  } catch {
    return null;
  }
}

/** Construit une URL absolue à partir d’un pagePath GA4 et de la base WP. */
export function absoluteFromPagePath(
  pagePath: string,
  siteBase: string
): string | null {
  const base = siteBase.trim().replace(/\/$/, "");
  const path = pagePath.startsWith("/") ? pagePath : `/${pagePath}`;
  try {
    return normalizePublicUrl(new URL(path, `${base}/`).toString());
  } catch {
    return null;
  }
}

export function hostFromUrl(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Avertissement soft si la propriété GSC ne semble pas matcher WP_URL. */
export function propertyLooksCompatibleWithWp(
  gscPropertyUrl: string | null | undefined,
  wpUrl: string | null | undefined
): boolean {
  if (!gscPropertyUrl || !wpUrl) {
    return true;
  }
  const wpHost = hostFromUrl(wpUrl);
  if (!wpHost) {
    return true;
  }
  if (gscPropertyUrl.startsWith("sc-domain:")) {
    const domain = gscPropertyUrl.slice("sc-domain:".length).toLowerCase();
    return wpHost === domain || wpHost.endsWith(`.${domain}`);
  }
  const gscHost = hostFromUrl(gscPropertyUrl);
  if (!gscHost) {
    return true;
  }
  return wpHost === gscHost || wpHost.endsWith(`.${gscHost}`) || gscHost.endsWith(`.${wpHost}`);
}
