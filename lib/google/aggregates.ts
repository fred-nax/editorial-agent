/**
 * Agrégations honnêtes : CTR et position moyenne pondérés,
 * jamais une moyenne de moyennes.
 *
 * Important GSC : la somme des stats par page ≠ totaux propriété.
 * Les KPI globaux doivent utiliser les lignes propriété (byProperty).
 */

export type GscDailyRow = {
  date: Date | string;
  clicks: number;
  impressions: number;
  position: number;
  hasData?: boolean;
};

export type PeriodKey = 7 | 28 | 90;

export function toUtcDateOnly(value: Date | string): Date {
  if (typeof value === "string") {
    return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  }
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  );
}

export function formatUtcDate(value: Date | string): string {
  return toUtcDateOnly(value).toISOString().slice(0, 10);
}

export function periodStart(days: PeriodKey, end = new Date()): Date {
  const d = toUtcDateOnly(end);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d;
}

/**
 * Fenêtre glissante ancrée sur le dernier jour réellement disponible
 * (données finales synchronisées), sans présumer que J−1 est consolidé.
 */
export function resolveAvailablePeriod(
  latestAvailable: Date | string | null | undefined,
  days: PeriodKey
): { start: Date; end: Date } | null {
  if (!latestAvailable) {
    return null;
  }
  const end = toUtcDateOnly(latestAvailable);
  return { start: periodStart(days, end), end };
}

export function aggregateGscRows(rows: GscDailyRow[]): {
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
  daysWithData: number;
} {
  let clicks = 0;
  let impressions = 0;
  let positionWeighted = 0;
  let daysWithData = 0;

  for (const row of rows) {
    if (row.hasData === false) {
      continue;
    }
    daysWithData += 1;
    clicks += row.clicks;
    impressions += row.impressions;
    positionWeighted += row.position * row.impressions;
  }

  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : null,
    position: impressions > 0 ? positionWeighted / impressions : null,
    daysWithData,
  };
}

/**
 * Compare somme page vs totaux propriété sur une même fenêtre.
 * Utilisé pour les tests / diagnostics — pas pour les KPI dashboard.
 */
export function comparePageSumToPropertyTotals(
  pageRows: GscDailyRow[],
  propertyRows: GscDailyRow[]
): {
  page: ReturnType<typeof aggregateGscRows>;
  property: ReturnType<typeof aggregateGscRows>;
  impressionsDiffer: boolean;
} {
  const page = aggregateGscRows(pageRows);
  const property = aggregateGscRows(propertyRows);
  return {
    page,
    property,
    impressionsDiffer: page.impressions !== property.impressions,
  };
}

export function seriesFromDaily(
  rows: Array<{ date: Date | string; value: number }>,
  start: Date,
  end: Date
): Array<{ date: string; value: number }> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key =
      typeof row.date === "string"
        ? row.date.slice(0, 10)
        : row.date.toISOString().slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + row.value);
  }
  const out: Array<{ date: string; value: number }> = [];
  const cursor = new Date(start);
  const last = new Date(end);
  while (cursor <= last) {
    const key = cursor.toISOString().slice(0, 10);
    out.push({ date: key, value: map.get(key) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
