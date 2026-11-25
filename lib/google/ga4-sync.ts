/**
 * Synchronisation GA4 Data API — mutualisée WordPress / Webflow (V7.14.1).
 * Filtre hostname pour isoler les flux multi-sites.
 */

import { db } from "@/lib/db";
import {
  classifyTrafficSource,
  isAiSourceKey,
} from "@/lib/google/ai-referrers";
import { getValidAccessToken } from "@/lib/google/connection";
import {
  assertGa4PropertyMatchesSite,
  listGa4WebStreams,
} from "@/lib/google/ga4-streams";
import { resolveWorkspacePublicSiteUrl } from "@/lib/google/site-url";
import {
  absoluteFromPagePath,
  hostFromUrl,
  normalizePublicUrl,
} from "@/lib/google/url-normalize";
import { buildPublishedUrlMapForWorkspace } from "@/lib/google/published-url-map";
import { logInfo } from "@/lib/logger";
import { WORKSPACE_IDS } from "@/lib/workspace";

type Ga4Row = {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
};

function formatDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function parseGa4Date(raw: string): Date {
  const y = Number(raw.slice(0, 4));
  const m = Number(raw.slice(4, 6));
  const day = Number(raw.slice(6, 8));
  return new Date(Date.UTC(y, m - 1, day));
}

function hostVariants(siteUrl: string | null): string[] {
  const host = hostFromUrl(siteUrl ?? "");
  if (!host) {
    return [];
  }
  const bare = host.replace(/^www\./, "");
  return [...new Set([host, bare, `www.${bare}`])];
}

async function runGa4Report(input: {
  propertyId: string;
  start: Date;
  end: Date;
  dimensions: string[];
  metrics: string[];
  hostFilter?: string[];
}): Promise<Ga4Row[]> {
  const token = await getValidAccessToken();
  const body: Record<string, unknown> = {
    dateRanges: [
      {
        startDate: formatDateUTC(input.start).replace(
          /(\d{4})(\d{2})(\d{2})/,
          "$1-$2-$3"
        ),
        endDate: formatDateUTC(input.end).replace(
          /(\d{4})(\d{2})(\d{2})/,
          "$1-$2-$3"
        ),
      },
    ],
    dimensions: input.dimensions.map((name) => ({ name })),
    metrics: input.metrics.map((name) => ({ name })),
    limit: 100000,
  };

  if (input.hostFilter && input.hostFilter.length > 0) {
    body.dimensionFilter = {
      filter: {
        fieldName: "hostName",
        inListFilter: {
          values: input.hostFilter,
          caseSensitive: false,
        },
      },
    };
  }

  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${input.propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  const payload = (await response.json()) as {
    rows?: Ga4Row[];
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? "Erreur Google Analytics Data API."
    );
  }
  return payload.rows ?? [];
}

function resolvePageNorm(
  pagePath: string,
  siteBase: string
): string | null {
  const absolute = absoluteFromPagePath(pagePath, siteBase);
  if (absolute) {
    return normalizePublicUrl(absolute);
  }
  if (pagePath.startsWith("http")) {
    return normalizePublicUrl(pagePath);
  }
  const base = siteBase.replace(/\/$/, "");
  return normalizePublicUrl(
    `${base}${pagePath.startsWith("/") ? pagePath : `/${pagePath}`}`
  );
}

export async function syncGa4Range(input: {
  propertyId: string;
  start: Date;
  end: Date;
  workspaceId?: string;
}): Promise<number> {
  const workspaceId =
    input.workspaceId?.trim() || WORKSPACE_IDS.wordpress;
  const siteBase =
    (await resolveWorkspacePublicSiteUrl(workspaceId)) ?? "";
  if (!siteBase) {
    throw new Error(
      "URL publique du site manquante pour synchroniser Google Analytics."
    );
  }

  // Isolation multi-flux : hosts autorisés dérivés du site + flux Admin API.
  let allowedHosts = hostVariants(siteBase);
  try {
    const streams = await listGa4WebStreams(input.propertyId);
    const validated = assertGa4PropertyMatchesSite({
      siteUrl: siteBase,
      streams,
    });
    allowedHosts = [
      ...new Set([...allowedHosts, ...validated.allowedHosts]),
    ];
  } catch {
    // Si Admin API indisponible en sync, on filtre quand même sur le site public.
  }

  const urlMap = await buildPublishedUrlMapForWorkspace(workspaceId);
  let upserted = 0;

  const pageRows = await runGa4Report({
    propertyId: input.propertyId,
    start: input.start,
    end: input.end,
    dimensions: ["hostName", "landingPage", "date"],
    metrics: ["sessions", "totalUsers", "engagedSessions"],
    hostFilter: allowedHosts,
  });

  const pageAgg = new Map<
    string,
    {
      pagePath: string;
      pageUrlNorm: string;
      date: Date;
      sessions: number;
      totalUsers: number;
      engagedSessions: number;
    }
  >();

  for (const row of pageRows) {
    const hostName = (row.dimensionValues?.[0]?.value ?? "").toLowerCase();
    const pagePath = row.dimensionValues?.[1]?.value ?? "";
    const dateRaw = row.dimensionValues?.[2]?.value ?? "";
    if (!pagePath || !dateRaw || pagePath === "(not set)") {
      continue;
    }
    if (
      hostName &&
      allowedHosts.length > 0 &&
      !allowedHosts.some((h) => h.toLowerCase() === hostName)
    ) {
      continue;
    }
    const norm = resolvePageNorm(pagePath, siteBase);
    if (!norm) {
      continue;
    }
    const key = `${norm}|${dateRaw}`;
    pageAgg.set(key, {
      pagePath,
      pageUrlNorm: norm,
      date: parseGa4Date(dateRaw),
      sessions: Number(row.metricValues?.[0]?.value ?? 0),
      totalUsers: Number(row.metricValues?.[1]?.value ?? 0),
      engagedSessions: Number(row.metricValues?.[2]?.value ?? 0),
    });
  }

  const sourceRows = await runGa4Report({
    propertyId: input.propertyId,
    start: input.start,
    end: input.end,
    dimensions: [
      "hostName",
      "landingPage",
      "date",
      "sessionSource",
      "sessionMedium",
    ],
    metrics: ["sessions"],
    hostFilter: allowedHosts,
  });

  const aiByPageDate = new Map<string, number>();

  for (const row of sourceRows) {
    const hostName = (row.dimensionValues?.[0]?.value ?? "").toLowerCase();
    const pagePath = row.dimensionValues?.[1]?.value ?? "";
    const dateRaw = row.dimensionValues?.[2]?.value ?? "";
    const sessionSource = row.dimensionValues?.[3]?.value ?? "";
    const sessionMedium = row.dimensionValues?.[4]?.value ?? "";
    const sessions = Number(row.metricValues?.[0]?.value ?? 0);
    if (!pagePath || !dateRaw || pagePath === "(not set)" || sessions <= 0) {
      continue;
    }
    if (
      hostName &&
      allowedHosts.length > 0 &&
      !allowedHosts.some((h) => h.toLowerCase() === hostName)
    ) {
      continue;
    }
    const norm = resolvePageNorm(pagePath, siteBase);
    if (!norm) {
      continue;
    }
    const sourceKey = classifyTrafficSource({
      sessionSource,
      sessionMedium,
    });
    await db.ga4PageSourceDailyStat.upsert({
      where: {
        propertyId_pageUrlNorm_date_sourceKey: {
          propertyId: input.propertyId,
          pageUrlNorm: norm,
          date: parseGa4Date(dateRaw),
          sourceKey,
        },
      },
      create: {
        workspaceId,
        propertyId: input.propertyId,
        pageUrlNorm: norm,
        date: parseGa4Date(dateRaw),
        sourceKey,
        sessions,
      },
      update: {
        workspaceId,
        sessions,
        syncedAt: new Date(),
      },
    });
    if (isAiSourceKey(sourceKey)) {
      const k = `${norm}|${dateRaw}`;
      aiByPageDate.set(k, (aiByPageDate.get(k) ?? 0) + sessions);
    }
  }

  for (const [key, row] of pageAgg) {
    const dateRaw = key.split("|")[1];
    const match = urlMap.get(row.pageUrlNorm);
    await db.ga4PageDailyStat.upsert({
      where: {
        propertyId_pageUrlNorm_date: {
          propertyId: input.propertyId,
          pageUrlNorm: row.pageUrlNorm,
          date: row.date,
        },
      },
      create: {
        workspaceId,
        propertyId: input.propertyId,
        pagePath: row.pagePath,
        pageUrlNorm: row.pageUrlNorm,
        date: row.date,
        sessions: row.sessions,
        totalUsers: row.totalUsers,
        engagedSessions: row.engagedSessions,
        aiSessions: aiByPageDate.get(`${row.pageUrlNorm}|${dateRaw}`) ?? 0,
        wpPostId: match?.wpPostId ?? null,
        cmsExternalId: match?.cmsExternalId ?? null,
      },
      update: {
        workspaceId,
        pagePath: row.pagePath,
        sessions: row.sessions,
        totalUsers: row.totalUsers,
        engagedSessions: row.engagedSessions,
        aiSessions: aiByPageDate.get(`${row.pageUrlNorm}|${dateRaw}`) ?? 0,
        wpPostId: match?.wpPostId ?? null,
        cmsExternalId: match?.cmsExternalId ?? null,
        syncedAt: new Date(),
      },
    });
    upserted += 1;
  }

  logInfo("google-ga4", "sync range complete", {
    propertyId: input.propertyId,
    workspaceId,
    upserted,
  });
  return upserted;
}
