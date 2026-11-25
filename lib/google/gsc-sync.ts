import { db } from "@/lib/db";
import { getValidAccessToken } from "@/lib/google/connection";
import { normalizePublicUrl } from "@/lib/google/url-normalize";
import { buildPublishedUrlMapForWorkspace } from "@/lib/google/published-url-map";
import { logInfo } from "@/lib/logger";
import { WORKSPACE_IDS } from "@/lib/workspace/constants";

type GscRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

type AggregationType = "auto" | "byPage" | "byProperty";

function formatDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dateOnly(d: Date): Date {
  return new Date(`${formatDateUTC(d)}T00:00:00.000Z`);
}

function addDaysUTC(d: Date, days: number): Date {
  const next = dateOnly(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

async function querySearchAnalytics(input: {
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimensions: string[];
  aggregationType: AggregationType;
  startRow?: number;
  rowLimit?: number;
}): Promise<GscRow[]> {
  const token = await getValidAccessToken();
  const encoded = encodeURIComponent(input.siteUrl);
  const response = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate: input.startDate,
        endDate: input.endDate,
        dimensions: input.dimensions,
        type: "web",
        dataState: "final",
        aggregationType: input.aggregationType,
        rowLimit: input.rowLimit ?? 25000,
        startRow: input.startRow ?? 0,
      }),
    }
  );
  const payload = (await response.json()) as {
    rows?: GscRow[];
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Erreur Search Console API.");
  }
  return payload.rows ?? [];
}

/** Totaux quotidiens propriété (dimensions date, aggregation byProperty). */
export async function syncSearchConsolePropertyRange(input: {
  propertyUrl: string;
  start: Date;
  end: Date;
  workspaceId?: string;
}): Promise<number> {
  const workspaceId = input.workspaceId?.trim() || null;
  const startDate = formatDateUTC(input.start);
  const endDate = formatDateUTC(input.end);
  let upserted = 0;
  let startRow = 0;

  for (;;) {
    const rows = await querySearchAnalytics({
      siteUrl: input.propertyUrl,
      startDate,
      endDate,
      dimensions: ["date"],
      aggregationType: "byProperty",
      startRow,
      rowLimit: 25000,
    });
    if (rows.length === 0) {
      break;
    }
    for (const row of rows) {
      const day = row.keys?.[0];
      if (!day) {
        continue;
      }
      const clicks = Number(row.clicks ?? 0);
      const impressions = Number(row.impressions ?? 0);
      await db.gscPropertyDailyStat.upsert({
        where: {
          propertyUrl_date: {
            propertyUrl: input.propertyUrl,
            date: dateOnly(new Date(`${day}T00:00:00.000Z`)),
          },
        },
        create: {
          workspaceId,
          propertyUrl: input.propertyUrl,
          date: dateOnly(new Date(`${day}T00:00:00.000Z`)),
          clicks,
          impressions,
          ctr: Number(row.ctr ?? (impressions > 0 ? clicks / impressions : 0)),
          position: Number(row.position ?? 0),
          hasData: true,
        },
        update: {
          ...(workspaceId ? { workspaceId } : {}),
          clicks,
          impressions,
          ctr: Number(row.ctr ?? (impressions > 0 ? clicks / impressions : 0)),
          position: Number(row.position ?? 0),
          hasData: true,
          syncedAt: new Date(),
        },
      });
      upserted += 1;
    }
    if (rows.length < 25000) {
      break;
    }
    startRow += rows.length;
  }

  logInfo("google-gsc", "property sync range complete", {
    propertyUrl: input.propertyUrl,
    startDate,
    endDate,
    upserted,
  });
  return upserted;
}

export async function needsGscPropertyBackfill(
  propertyUrl: string
): Promise<boolean> {
  const existing = await db.gscPropertyDailyStat.findFirst({
    where: { propertyUrl },
    select: { id: true },
  });
  return !existing;
}

export async function syncSearchConsoleRange(input: {
  propertyUrl: string;
  start: Date;
  end: Date;
  workspaceId?: string;
}): Promise<number> {
  const workspaceId =
    input.workspaceId?.trim() || WORKSPACE_IDS.wordpress;
  const startDate = formatDateUTC(input.start);
  const endDate = formatDateUTC(input.end);
  const urlMap = await buildPublishedUrlMapForWorkspace(workspaceId);
  let upserted = 0;

  // Pages × date (agrégation byPage — suivi éditorial / URL)
  let startRow = 0;
  for (;;) {
    const rows = await querySearchAnalytics({
      siteUrl: input.propertyUrl,
      startDate,
      endDate,
      dimensions: ["page", "date"],
      aggregationType: "byPage",
      startRow,
      rowLimit: 25000,
    });
    if (rows.length === 0) {
      break;
    }
    for (const row of rows) {
      const pageUrl = row.keys?.[0] ?? "";
      const day = row.keys?.[1];
      const norm = normalizePublicUrl(pageUrl);
      if (!norm || !day) {
        continue;
      }
      const clicks = Number(row.clicks ?? 0);
      const impressions = Number(row.impressions ?? 0);
      await db.gscPageDailyStat.upsert({
        where: {
          propertyUrl_pageUrlNorm_date: {
            propertyUrl: input.propertyUrl,
            pageUrlNorm: norm,
            date: dateOnly(new Date(`${day}T00:00:00.000Z`)),
          },
        },
        create: {
          workspaceId,
          propertyUrl: input.propertyUrl,
          pageUrl,
          pageUrlNorm: norm,
          date: dateOnly(new Date(`${day}T00:00:00.000Z`)),
          clicks,
          impressions,
          ctr: Number(row.ctr ?? (impressions > 0 ? clicks / impressions : 0)),
          position: Number(row.position ?? 0),
          hasData: true,
          wpPostId: urlMap.get(norm)?.wpPostId ?? null,
          cmsExternalId: urlMap.get(norm)?.cmsExternalId ?? null,
        },
        update: {
          workspaceId,
          pageUrl,
          clicks,
          impressions,
          ctr: Number(row.ctr ?? (impressions > 0 ? clicks / impressions : 0)),
          position: Number(row.position ?? 0),
          hasData: true,
          wpPostId: urlMap.get(norm)?.wpPostId ?? null,
          cmsExternalId: urlMap.get(norm)?.cmsExternalId ?? null,
          syncedAt: new Date(),
        },
      });
      upserted += 1;
    }
    if (rows.length < 25000) {
      break;
    }
    startRow += rows.length;
  }

  // Requêtes × page × date (top rows API — pas exhaustif)
  startRow = 0;
  for (;;) {
    const rows = await querySearchAnalytics({
      siteUrl: input.propertyUrl,
      startDate,
      endDate,
      dimensions: ["page", "query", "date"],
      aggregationType: "byPage",
      startRow,
      rowLimit: 25000,
    });
    if (rows.length === 0) {
      break;
    }
    for (const row of rows) {
      const pageUrl = row.keys?.[0] ?? "";
      const query = row.keys?.[1] ?? "";
      const day = row.keys?.[2];
      const norm = normalizePublicUrl(pageUrl);
      if (!norm || !query || !day) {
        continue;
      }
      const clicks = Number(row.clicks ?? 0);
      const impressions = Number(row.impressions ?? 0);
      await db.gscQueryDailyStat.upsert({
        where: {
          propertyUrl_pageUrlNorm_query_date: {
            propertyUrl: input.propertyUrl,
            pageUrlNorm: norm,
            query,
            date: dateOnly(new Date(`${day}T00:00:00.000Z`)),
          },
        },
        create: {
          workspaceId,
          propertyUrl: input.propertyUrl,
          pageUrlNorm: norm,
          query,
          date: dateOnly(new Date(`${day}T00:00:00.000Z`)),
          clicks,
          impressions,
          ctr: Number(row.ctr ?? (impressions > 0 ? clicks / impressions : 0)),
          position: Number(row.position ?? 0),
        },
        update: {
          workspaceId,
          clicks,
          impressions,
          ctr: Number(row.ctr ?? (impressions > 0 ? clicks / impressions : 0)),
          position: Number(row.position ?? 0),
          syncedAt: new Date(),
        },
      });
    }
    if (rows.length < 25000) {
      break;
    }
    startRow += rows.length;
  }

  // Totaux propriété : même fenêtre, ou backfill 90 j si table vide (sans toucher aux pages).
  let propertyStart = input.start;
  if (await needsGscPropertyBackfill(input.propertyUrl)) {
    propertyStart = addDaysUTC(input.end, -89);
    logInfo("google-gsc", "property backfill 90d", {
      propertyUrl: input.propertyUrl,
      startDate: formatDateUTC(propertyStart),
      endDate,
    });
  }
  upserted += await syncSearchConsolePropertyRange({
    propertyUrl: input.propertyUrl,
    start: propertyStart,
    end: input.end,
    workspaceId,
  });

  logInfo("google-gsc", "sync range complete", {
    propertyUrl: input.propertyUrl,
    startDate,
    endDate,
    upserted,
  });
  return upserted;
}
