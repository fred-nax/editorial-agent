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

/**
 * Vérifie qu’une propriété GSC (Domain ou URL-prefix) correspond au site public
 * de l’espace (WordPress ou Webflow).
 */
export function propertyLooksCompatibleWithSite(
  gscPropertyUrl: string | null | undefined,
  siteUrl: string | null | undefined
): boolean {
  if (!gscPropertyUrl || !siteUrl) {
    return true;
  }
  const siteHost = hostFromUrl(siteUrl);
  if (!siteHost) {
    return true;
  }
  if (gscPropertyUrl.startsWith("sc-domain:")) {
    const domain = gscPropertyUrl.slice("sc-domain:".length).toLowerCase();
    return siteHost === domain || siteHost.endsWith(`.${domain}`);
  }
  const gscHost = hostFromUrl(gscPropertyUrl);
  if (!gscHost) {
    return true;
  }
  return (
    siteHost === gscHost ||
    siteHost.endsWith(`.${gscHost}`) ||
    gscHost.endsWith(`.${siteHost}`)
  );
}

/** @deprecated Alias — utiliser propertyLooksCompatibleWithSite. */
export function propertyLooksCompatibleWithWp(
  gscPropertyUrl: string | null | undefined,
  wpUrl: string | null | undefined
): boolean {
  return propertyLooksCompatibleWithSite(gscPropertyUrl, wpUrl);
}

/**
 * Validation stricte pour activation : site public requis + correspondance.
 * Domain et URL-prefix supportés ; refuse les propriétés d’un autre domaine.
 */
export function assertGscPropertyMatchesSite(input: {
  gscPropertyUrl: string;
  siteUrl: string | null | undefined;
}): void {
  const property = input.gscPropertyUrl.trim();
  if (!property) {
    throw new Error("Propriété Search Console manquante.");
  }
  const site = input.siteUrl?.trim() || null;
  if (!site) {
    throw new Error(
      "Configurez d’abord l’URL publique du site de cet espace avant d’activer Search Console."
    );
  }
  if (!propertyLooksCompatibleWithSite(property, site)) {
    throw new Error(
      "Cette propriété Search Console ne correspond pas au domaine public de l’espace. Sélectionnez une propriété Domain ou URL-prefix compatible."
    );
  }
}
