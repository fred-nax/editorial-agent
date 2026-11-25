export type UsageCsvRow = {
  consumedAt: string;
  workspaceId: string;
  operationType: string;
  model: string | null;
  operationKey: string | null;
  generationId: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  toolCallCount: number | null;
  estimatedCostUsd: number | null;
  completeness: string;
  pricingVersion: string;
};

/** Protège les cellules CSV contre l’injection de formules (=, +, -, @). */
export function csvSafeCell(value: string | number | null | undefined): string {
  const raw =
    value === null || value === undefined ? "" : String(value);
  const escaped = raw.replace(/"/g, '""');
  const needsFormulaGuard = /^[=+\-@]/.test(escaped);
  const guarded = needsFormulaGuard ? `'${escaped}` : escaped;
  return `"${guarded}"`;
}

export function buildUsageCsv(rows: UsageCsvRow[]): string {
  const header = [
    "Date",
    "Workspace",
    "Type d'opération",
    "Modèle",
    "Référence métier",
    "Input tokens",
    "Cached input tokens",
    "Output tokens",
    "Nombre d'appels outil",
    "Coût estimé USD",
    "État de complétude",
    "Version tarifaire",
  ].join(",");

  const lines = rows.map((row) =>
    [
      csvSafeCell(row.consumedAt),
      csvSafeCell(row.workspaceId),
      csvSafeCell(row.operationType),
      csvSafeCell(row.model),
      csvSafeCell(row.operationKey ?? row.generationId),
      csvSafeCell(row.inputTokens),
      csvSafeCell(row.cachedInputTokens),
      csvSafeCell(row.outputTokens),
      csvSafeCell(row.toolCallCount),
      csvSafeCell(
        row.estimatedCostUsd === null
          ? ""
          : row.estimatedCostUsd.toFixed(8)
      ),
      csvSafeCell(row.completeness),
      csvSafeCell(row.pricingVersion),
    ].join(",")
  );

  return [header, ...lines].join("\n");
}
