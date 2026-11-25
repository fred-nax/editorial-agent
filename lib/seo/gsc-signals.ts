/**
 * Signaux Search Console pour enrichir les opportunités SEO (V7.14.0).
 * Lecture seule des stats déjà synchronisées — aucun appel Google ni OpenAI.
 */

import { db } from "@/lib/db";
import { getGoogleConnection } from "@/lib/google/connection";

export type GscOpportunitySignal = {
  kind: "low_ctr" | "near_top" | "emerging_query" | "optimize_page";
  query?: string;
  pageUrlNorm?: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
  source: "google_search_console";
};

const LOOKBACK_DAYS = 28;
const MIN_IMPRESSIONS_LOW_CTR = 50;
const LOW_CTR_THRESHOLD = 0.02;
const NEAR_TOP_MIN = 4;
const NEAR_TOP_MAX = 15;
const MIN_IMPRESSIONS_NEAR_TOP = 30;

function dateDaysAgo(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

/** Indique si l’espace a une propriété GSC avec au moins une journée de données. */
export async function workspaceHasGscData(
  workspaceId: string
): Promise<boolean> {
  const google = await getGoogleConnection(workspaceId);
  const property = google?.selection?.gscPropertyUrl?.trim();
  if (!property) {
    return false;
  }
  const sample = await db.gscPropertyDailyStat.findFirst({
    where: { propertyUrl: property, hasData: true },
    select: { id: true },
  });
  return Boolean(sample);
}

/**
 * Charge des signaux GSC exploitables pour le workspace actif.
 * Ne invente aucune métrique ; agrège clics/impressions puis CTR/position.
 */
export async function loadGscOpportunitySignals(
  workspaceId: string
): Promise<GscOpportunitySignal[]> {
  const google = await getGoogleConnection(workspaceId);
  const property = google?.selection?.gscPropertyUrl?.trim();
  if (!property) {
    return [];
  }

  const since = dateDaysAgo(LOOKBACK_DAYS);
  const queryRows = await db.gscQueryDailyStat.findMany({
    where: {
      propertyUrl: property,
      date: { gte: since },
      ...(workspaceId ? { OR: [{ workspaceId }, { workspaceId: null }] } : {}),
    },
    select: {
      query: true,
      pageUrlNorm: true,
      clicks: true,
      impressions: true,
      position: true,
    },
    take: 5000,
  });

  if (queryRows.length === 0) {
    return [];
  }

  type Agg = {
    query: string;
    pageUrlNorm: string;
    clicks: number;
    impressions: number;
    positionWeighted: number;
  };
  const byQuery = new Map<string, Agg>();
  for (const row of queryRows) {
    const key = `${row.query}\0${row.pageUrlNorm}`;
    const cur = byQuery.get(key) ?? {
      query: row.query,
      pageUrlNorm: row.pageUrlNorm,
      clicks: 0,
      impressions: 0,
      positionWeighted: 0,
    };
    cur.clicks += row.clicks;
    cur.impressions += row.impressions;
    cur.positionWeighted += row.position * row.impressions;
    byQuery.set(key, cur);
  }

  const signals: GscOpportunitySignal[] = [];
  for (const agg of byQuery.values()) {
    const ctr =
      agg.impressions > 0 ? agg.clicks / agg.impressions : null;
    const position =
      agg.impressions > 0 ? agg.positionWeighted / agg.impressions : null;

    if (
      agg.impressions >= MIN_IMPRESSIONS_LOW_CTR &&
      ctr !== null &&
      ctr < LOW_CTR_THRESHOLD
    ) {
      signals.push({
        kind: "low_ctr",
        query: agg.query,
        pageUrlNorm: agg.pageUrlNorm,
        clicks: agg.clicks,
        impressions: agg.impressions,
        ctr,
        position,
        source: "google_search_console",
      });
    } else if (
      position !== null &&
      position >= NEAR_TOP_MIN &&
      position <= NEAR_TOP_MAX &&
      agg.impressions >= MIN_IMPRESSIONS_NEAR_TOP
    ) {
      signals.push({
        kind: "near_top",
        query: agg.query,
        pageUrlNorm: agg.pageUrlNorm,
        clicks: agg.clicks,
        impressions: agg.impressions,
        ctr,
        position,
        source: "google_search_console",
      });
    }
  }

  return signals
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 25);
}

/** Bloc texte injecté dans le prompt opportunités (données mesurées uniquement). */
export function formatGscSignalsForPrompt(
  signals: GscOpportunitySignal[]
): string | null {
  if (signals.length === 0) {
    return null;
  }
  const lines = signals.slice(0, 15).map((s) => {
    const ctr =
      s.ctr === null ? "n/a" : `${(s.ctr * 100).toFixed(1)}%`;
    const pos = s.position === null ? "n/a" : s.position.toFixed(1);
    const kind =
      s.kind === "low_ctr"
        ? "CTR faible"
        : s.kind === "near_top"
          ? "proche top"
          : s.kind;
    return `- [${kind}] « ${s.query} » · impress. ${s.impressions} · clics ${s.clicks} · CTR ${ctr} · pos. ${pos} · page ${s.pageUrlNorm}`;
  });
  return [
    "Signaux Search Console mesurés (propriété de CET espace uniquement) — source google_search_console :",
    ...lines,
    "Utilise ces signaux pour proposer des optimisations de contenus existants ou des angles liés.",
    "Ne pas inventer de volumes, CTR ou positions hors de cette liste.",
    "Dans rationale, indique clairement si l’idée vient de Search Console, de l’analyse éditoriale, ou des deux.",
  ].join("\n");
}
