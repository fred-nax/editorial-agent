import { db } from "@/lib/db";
import {
  classifyTrafficSource,
  isAiSourceKey,
} from "@/lib/google/ai-referrers";
import { getValidAccessToken } from "@/lib/google/connection";
import {
  absoluteFromPagePath,
  normalizePublicUrl,
} from "@/lib/google/url-normalize";
import { buildPublishedUrlMap } from "@/lib/google/wp-url-map";
import { resolveWordPressConfig } from "@/lib/settings/app-settings";
import { logInfo } from "@/lib/logger";

type Ga4Row = {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
};

function formatDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function parseGa4Date(raw: string): Date {
  // YYYYMMDD
  const y = Number(raw.slice(0, 4));
  const m = Number(raw.slice(4, 6));
  const day = Number(raw.slice(6, 8));
  return new Date(Date.UTC(y, m - 1, day));
}

async function runGa4Report(input: {
  propertyId: string;
  start: Date;
  end: Date;
  dimensions: string[];
  metrics: string[];
}): Promise<Ga4Row[]> {
  const token = await getValidAccessToken();
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${input.propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
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
      }),
    }
  );
  const payload = (await response.json()) as {
    rows?: Ga4Row[];
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Erreur Google Analytics Data API.");
  }
  return payload.rows ?? [];
}

export async function syncGa4Range(input: {
  propertyId: string;
  start: Date;
  end: Date;
}): Promise<number> {
  const urlMap = await buildPublishedUrlMap();
  const wp = await resolveWordPressConfig();
  const siteBase = wp?.url ?? process.env.WP_URL?.trim() ?? "";
  let upserted = 0;

  // Totaux par page × date
  const pageRows = await runGa4Report({
    propertyId: input.propertyId,
    start: input.start,
    end: input.end,
    dimensions: ["landingPage", "date"],
    metrics: ["sessions", "totalUsers", "engagedSessions"],
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
    const pagePath = row.dimensionValues?.[0]?.value ?? "";
    const dateRaw = row.dimensionValues?.[1]?.value ?? "";
    if (!pagePath || !dateRaw || pagePath === "(not set)") {
      continue;
    }
    const absolute = absoluteFromPagePath(pagePath, siteBase);
    const norm = absolute ? normalizePublicUrl(absolute) : normalizePublicUrl(
      pagePath.startsWith("http") ? pagePath : `${siteBase.replace(/\/$/, "")}${pagePath.startsWith("/") ? "" : "/"}${pagePath}`
    );
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

  // Sources par page × date
  const sourceRows = await runGa4Report({
    propertyId: input.propertyId,
    start: input.start,
    end: input.end,
    dimensions: ["landingPage", "date", "sessionSource", "sessionMedium"],
    metrics: ["sessions"],
  });

  const aiByPageDate = new Map<string, number>();

  for (const row of sourceRows) {
    const pagePath = row.dimensionValues?.[0]?.value ?? "";
    const dateRaw = row.dimensionValues?.[1]?.value ?? "";
    const sessionSource = row.dimensionValues?.[2]?.value ?? "";
    const sessionMedium = row.dimensionValues?.[3]?.value ?? "";
    const sessions = Number(row.metricValues?.[0]?.value ?? 0);
    if (!pagePath || !dateRaw || pagePath === "(not set)" || sessions <= 0) {
      continue;
    }
    const absolute = absoluteFromPagePath(pagePath, siteBase);
    const norm = absolute
      ? normalizePublicUrl(absolute)
      : normalizePublicUrl(
          `${siteBase.replace(/\/$/, "")}${pagePath.startsWith("/") ? pagePath : `/${pagePath}`}`
        );
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
        propertyId: input.propertyId,
        pageUrlNorm: norm,
        date: parseGa4Date(dateRaw),
        sourceKey,
        sessions,
      },
      update: {
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
    await db.ga4PageDailyStat.upsert({
      where: {
        propertyId_pageUrlNorm_date: {
          propertyId: input.propertyId,
          pageUrlNorm: row.pageUrlNorm,
          date: row.date,
        },
      },
      create: {
        propertyId: input.propertyId,
        pagePath: row.pagePath,
        pageUrlNorm: row.pageUrlNorm,
        date: row.date,
        sessions: row.sessions,
        totalUsers: row.totalUsers,
        engagedSessions: row.engagedSessions,
        aiSessions: aiByPageDate.get(`${row.pageUrlNorm}|${dateRaw}`) ?? 0,
        wpPostId: urlMap.get(row.pageUrlNorm) ?? null,
      },
      update: {
        pagePath: row.pagePath,
        sessions: row.sessions,
        totalUsers: row.totalUsers,
        engagedSessions: row.engagedSessions,
        aiSessions: aiByPageDate.get(`${row.pageUrlNorm}|${dateRaw}`) ?? 0,
        wpPostId: urlMap.get(row.pageUrlNorm) ?? null,
        syncedAt: new Date(),
      },
    });
    upserted += 1;
  }

  logInfo("google-ga4", "sync range complete", {
    propertyId: input.propertyId,
    upserted,
  });
  return upserted;
}
