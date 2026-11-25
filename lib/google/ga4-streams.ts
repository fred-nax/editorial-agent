/**
 * Découverte des flux web GA4 et validation hostname (V7.14.1).
 * Admin API — lecture seule ; aucune création / modification de flux.
 */

import { getValidAccessToken } from "@/lib/google/connection";
import { hostFromUrl } from "@/lib/google/url-normalize";

export type Ga4WebStreamInfo = {
  streamId: string;
  displayName: string | null;
  defaultUri: string | null;
  measurementId: string | null;
  host: string | null;
};

export async function listGa4WebStreams(
  propertyId: string
): Promise<Ga4WebStreamInfo[]> {
  const token = await getValidAccessToken();
  const id = propertyId.replace(/^properties\//, "").trim();
  const response = await fetch(
    `https://analyticsadmin.googleapis.com/v1beta/properties/${id}/dataStreams`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const payload = (await response.json()) as {
    dataStreams?: Array<{
      name?: string;
      displayName?: string;
      type?: string;
      webStreamData?: {
        defaultUri?: string;
        measurementId?: string;
      };
    }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? "Impossible de lister les flux GA4."
    );
  }

  const out: Ga4WebStreamInfo[] = [];
  for (const stream of payload.dataStreams ?? []) {
    if (stream.type && stream.type !== "WEB_DATA_STREAM") {
      continue;
    }
    const defaultUri = stream.webStreamData?.defaultUri?.trim() || null;
    const streamId = (stream.name ?? "").split("/").pop() || "";
    out.push({
      streamId,
      displayName: stream.displayName ?? null,
      defaultUri,
      measurementId: stream.webStreamData?.measurementId ?? null,
      host: defaultUri ? hostFromUrl(defaultUri) : null,
    });
  }
  return out;
}

/**
 * Vérifie qu’une propriété GA4 peut être isolée pour le site public de l’espace.
 * - Refuse si aucun flux web ne correspond au hostname.
 * - Refuse si plusieurs flux de domaines distincts sans correspondance claire.
 */
export function assertGa4PropertyMatchesSite(input: {
  siteUrl: string | null | undefined;
  streams: Ga4WebStreamInfo[];
}): { allowedHosts: string[] } {
  const siteHost = hostFromUrl(input.siteUrl?.trim() || "");
  if (!siteHost) {
    throw new Error(
      "Configurez d’abord l’URL publique du site de cet espace avant d’activer Google Analytics."
    );
  }

  const hosts = [
    ...new Set(
      input.streams
        .map((s) => s.host)
        .filter((h): h is string => Boolean(h))
    ),
  ];

  if (hosts.length === 0) {
    // Pas d’URI par défaut lisible : on autorise avec filtre hostname = site
    // (isolation au sync via dimension hostName).
    return { allowedHosts: [siteHost, `www.${siteHost}`.replace(/^www\.www\./, "www.")] };
  }

  const matches = hosts.filter(
    (h) =>
      h === siteHost ||
      h.endsWith(`.${siteHost}`) ||
      siteHost.endsWith(`.${h}`) ||
      h.replace(/^www\./, "") === siteHost.replace(/^www\./, "")
  );

  if (matches.length === 0) {
    throw new Error(
      "Cette propriété GA4 ne contient aucun flux web correspondant au domaine public de l’espace. Sélectionnez une propriété dédiée à ce site."
    );
  }

  // Plusieurs domaines distincts dans la propriété : n’autoriser que si on peut
  // filtrer strictement au hostname du site (matches non vides).
  const distinctRoots = new Set(
    hosts.map((h) => h.replace(/^www\./, ""))
  );
  if (distinctRoots.size > 1 && matches.length === 0) {
    throw new Error(
      "Cette propriété GA4 regroupe plusieurs sites ; l’isolation par hostname n’est pas garantie pour cet espace."
    );
  }

  const allowed = new Set<string>(matches);
  for (const h of matches) {
    const bare = h.replace(/^www\./, "");
    allowed.add(bare);
    allowed.add(`www.${bare}`);
  }
  return { allowedHosts: [...allowed] };
}
