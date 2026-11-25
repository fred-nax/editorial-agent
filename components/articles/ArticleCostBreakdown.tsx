import { formatEstimatedCost } from "@/lib/format";
import { operationTypeLabel } from "@/lib/openai-usage-labels";
import type { ArticleCostBreakdown as Breakdown } from "@/lib/openai-usage-aggregate";

function line(
  label: string,
  value: number | null,
  unknownHint?: boolean
): { label: string; display: string } {
  if (value === null) {
    return {
      label,
      display: unknownHint ? "Inconnu" : "—",
    };
  }
  return { label, display: formatEstimatedCost(value) };
}

export function ArticleCostBreakdownPanel({
  breakdown,
}: {
  breakdown: Breakdown;
}) {
  const rows = [
    line(
      "Rédaction (événements)",
      breakdown.llmEvents,
      breakdown.llmEvents === null && breakdown.llmHistorical === null
    ),
    line(
      "Rédaction (historique LLM)",
      breakdown.llmHistorical,
      false
    ),
    line("Recherche web", breakdown.webSearch, false),
    line("Images générées", breakdown.imageGeneration, false),
    line("Texte ALT", breakdown.imageAlt, false),
    line("Autres (liées à l’article)", breakdown.otherLinked, false),
  ];

  const coverageNote =
    breakdown.coverage === "legacy_partial"
      ? "Coût LLM historique — couverture partielle (web_search / images non connus pour cette génération)."
      : breakdown.coverage === "complete"
        ? "Couverture complète des composants observables."
        : breakdown.coverage === "unknown"
          ? "Aucun coût connu pour cette génération."
          : "Couverture partielle — certains composants sont inconnus ou hors périmètre.";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs font-medium text-slate-500">
          Total estimé connu (article)
        </p>
        <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
          {breakdown.knownTotalLabel}
        </p>
        <p className="mt-1 text-xs text-slate-500">{coverageNote}</p>
        <p className="mt-1 text-xs text-slate-500">
          Estimation locale — jamais un montant facturé OpenAI. Les dépenses de
          veille / opportunités SEO ne sont pas réparties ici.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {rows.map((row) => (
          <article
            key={row.label}
            className="rounded-lg border border-slate-200 bg-white px-4 py-3"
          >
            <h3 className="text-xs font-medium text-slate-500">{row.label}</h3>
            <p className="mt-2 text-lg font-semibold tabular-nums text-slate-900">
              {row.display}
            </p>
          </article>
        ))}
      </div>

      {breakdown.unknownComponents.length > 0 ? (
        <p className="text-sm text-amber-800">
          Composants inconnus : {breakdown.unknownComponents.join(", ")}.
        </p>
      ) : null}

      {breakdown.rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Modèle</th>
                <th className="px-3 py-2">Coût estimé</th>
                <th className="px-3 py-2">Complétude</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    {operationTypeLabel(row.operationType)}
                    {row.isLegacy ? (
                      <span className="ml-1 text-xs text-amber-700">legacy</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{row.model ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.estimatedCostLabel}
                  </td>
                  <td className="px-3 py-2">{row.completeness}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
