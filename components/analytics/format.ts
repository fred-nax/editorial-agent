export function fmtNum(
  value: number | null | undefined,
  digits = 0
): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return value.toLocaleString("fr-FR", { maximumFractionDigits: digits });
}

export function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return `${(value * 100).toFixed(1)} %`;
}

export function fmtMetricOrEmpty(
  hasData: boolean,
  value: number | null | undefined,
  digits = 0
): string {
  if (!hasData) {
    return "n/d";
  }
  return fmtNum(value, digits);
}
