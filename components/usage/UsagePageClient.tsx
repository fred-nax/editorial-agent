"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatEstimatedCost, formatTokenCount } from "@/lib/format";
import {
  OPENAI_USAGE_OPERATION_TYPES,
  type OpenAiUsageOperationType,
} from "@/lib/openai-usage-types";
import { operationTypeLabel } from "@/lib/openai-usage-labels";

type Summary = {
  knownEstimatedCostUsd: number;
  knownEstimatedCostLabel: string;
  operationCount: number;
  unknownOrPartialCount: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  imageGenerationCount: number;
  averageCostPerArticleLabel: string;
  byOperation: Array<{
    operationType: string;
    count: number;
    knownCostUsd: number;
    unknownOrPartial: number;
  }>;
  byModel: Array<{ model: string; count: number; knownCostUsd: number }>;
  seriesDaily: Array<{
    date: string;
    knownCostUsd: number;
    operations: number;
  }>;
  legacyLlmCount: number;
  legacyLlmCostUsd: number;
  registryEventCount: number;
  registryKnownCostUsd: number;
  coverageNote: string;
};

type HistoryRow = {
  id: string;
  consumedAt: string;
  operationType: string;
  model: string | null;
  operationKey: string | null;
  generationId: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  toolCallCount: number | null;
  estimatedCostLabel: string;
  completeness: string;
  pricingVersion: string;
  isLegacy: boolean;
};

type Props = {
  workspaceName: string;
  initialPeriod: string;
  initialSummary: Summary;
  initialHistory: {
    rows: HistoryRow[];
    total: number;
    page: number;
    pageSize: number;
  };
};

function completenessLabel(value: string): string {
  switch (value) {
    case "complete":
      return "Complet";
    case "partial":
      return "Partiel";
    case "unknown":
      return "Inconnu";
    case "zero":
      return "Zéro";
    default:
      return value;
  }
}

export function UsagePageClient({
  workspaceName,
  initialPeriod,
  initialSummary,
  initialHistory,
}: Props) {
  const [period, setPeriod] = useState(initialPeriod);
  const [operationType, setOperationType] = useState<"all" | OpenAiUsageOperationType>(
    "all"
  );
  const [completeness, setCompleteness] = useState("all");
  const [summary, setSummary] = useState(initialSummary);
  const [history, setHistory] = useState(initialHistory);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("period", period);
    if (operationType !== "all") {
      params.set("operationType", operationType);
    }
    if (completeness !== "all") {
      params.set("completeness", completeness);
    }
    params.set("page", String(history.page));
    params.set("pageSize", String(history.pageSize));
    return params.toString();
  }, [period, operationType, completeness, history.page, history.pageSize]);

  async function reload(next?: {
    period?: string;
    operationType?: "all" | OpenAiUsageOperationType;
    completeness?: string;
    page?: number;
  }) {
    const params = new URLSearchParams();
    const p = next?.period ?? period;
    const op = next?.operationType ?? operationType;
    const comp = next?.completeness ?? completeness;
    const page = next?.page ?? 1;
    params.set("period", p);
    if (op !== "all") {
      params.set("operationType", op);
    }
    if (comp !== "all") {
      params.set("completeness", comp);
    }
    params.set("page", String(page));
    params.set("pageSize", String(history.pageSize));

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/usage?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error("Chargement impossible.");
      }
      const data = await res.json();
      setPeriod(p);
      setOperationType(op);
      setCompleteness(comp);
      setSummary(data.summary);
      setHistory(data.history);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  const maxDaily = Math.max(
    0.0001,
    ...summary.seriesDaily.map((d) => d.knownCostUsd)
  );

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">Consommation</h1>
        <p className="max-w-3xl text-sm text-slate-600">
          Suivi des consommations OpenAI de l’espace{" "}
          <span className="font-medium text-slate-800">{workspaceName}</span>.
          Montants estimés localement — jamais présentés comme facture OpenAI.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="text-sm text-slate-600">
          Période
          <select
            className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={period}
            onChange={(e) => void reload({ period: e.target.value, page: 1 })}
          >
            <option value="7d">7 jours</option>
            <option value="30d">30 jours</option>
            <option value="90d">90 jours</option>
          </select>
        </label>
        <label className="text-sm text-slate-600">
          Type
          <select
            className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={operationType}
            onChange={(e) =>
              void reload({
                operationType: e.target.value as "all" | OpenAiUsageOperationType,
                page: 1,
              })
            }
          >
            <option value="all">Tous</option>
            {OPENAI_USAGE_OPERATION_TYPES.map((type) => (
              <option key={type} value={type}>
                {operationTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-slate-600">
          Complétude
          <select
            className="mt-1 block rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={completeness}
            onChange={(e) =>
              void reload({ completeness: e.target.value, page: 1 })
            }
          >
            <option value="all">Tous</option>
            <option value="complete">Complet</option>
            <option value="partial">Partiel</option>
            <option value="unknown">Inconnu</option>
            <option value="zero">Zéro</option>
          </select>
        </label>
        <a
          className="ml-auto rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          href={`/api/usage/export?${query}`}
        >
          Export CSV
        </a>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-4 ${loading ? "opacity-60" : ""}`}>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Coût estimé connu</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
            {summary.knownEstimatedCostLabel}
          </p>
          <p className="mt-1 text-xs text-slate-500">{summary.coverageNote}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">
            Registre OpenAiUsageEvent
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
            {summary.registryEventCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {formatEstimatedCost(summary.registryKnownCostUsd)} estimé registre ·{" "}
            {summary.unknownOrPartialCount} inconnues / partielles (total lignes)
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Tokens</p>
          <p className="mt-2 text-lg font-semibold tabular-nums text-slate-900">
            in {formatTokenCount(summary.inputTokens)} · out{" "}
            {formatTokenCount(summary.outputTokens)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            cache {formatTokenCount(summary.cachedInputTokens)}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">
            Moyenne / article · images
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
            {summary.averageCostPerArticleLabel}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {summary.imageGenerationCount} génération(s) d’image
          </p>
        </article>
      </div>

      {summary.registryEventCount === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Aucun événement dans le registre <code>OpenAiUsageEvent</code> pour
          cette période. Les montants éventuels ci-dessous peuvent provenir
          uniquement des coûts LLM historiques (
          <code>ArticleGeneration.estimatedCost</code>), pas de nouvelles
          consommations persistées.
        </p>
      ) : null}

      {summary.legacyLlmCount > 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {summary.legacyLlmCount} coût(s) LLM historique(s) inclus via lecture
          unifiée ({formatEstimatedCost(summary.legacyLlmCostUsd)}) — ce ne sont
          pas des événements registre. Couverture partielle (hors web_search /
          images). Total lignes affichées : {summary.operationCount}.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Par type</h2>
          <ul className="mt-3 space-y-2">
            {summary.byOperation.length === 0 ? (
              <li className="text-sm text-slate-500">Aucune opération.</li>
            ) : (
              summary.byOperation.map((row) => (
                <li
                  key={row.operationType}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-slate-700">
                    {operationTypeLabel(row.operationType)}{" "}
                    <span className="text-slate-400">({row.count})</span>
                  </span>
                  <span className="tabular-nums text-slate-900">
                    {formatEstimatedCost(row.knownCostUsd)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Par modèle</h2>
          <ul className="mt-3 space-y-2">
            {summary.byModel.length === 0 ? (
              <li className="text-sm text-slate-500">Aucun modèle.</li>
            ) : (
              summary.byModel.map((row) => (
                <li
                  key={row.model}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="truncate text-slate-700">
                    {row.model}{" "}
                    <span className="text-slate-400">({row.count})</span>
                  </span>
                  <span className="tabular-nums text-slate-900">
                    {formatEstimatedCost(row.knownCostUsd)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">
          Évolution (coût estimé connu / jour)
        </h2>
        <div className="mt-4 flex h-36 items-end gap-1">
          {summary.seriesDaily.length === 0 ? (
            <p className="text-sm text-slate-500">Pas de série sur la période.</p>
          ) : (
            summary.seriesDaily.map((day) => (
              <div
                key={day.date}
                className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
                title={`${day.date}: ${formatEstimatedCost(day.knownCostUsd)} · ${day.operations} op.`}
              >
                <div
                  className="w-full rounded-t bg-[#0F5270]/60"
                  style={{
                    height: `${Math.max(4, (day.knownCostUsd / maxDaily) * 100)}%`,
                  }}
                />
              </div>
            ))
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Historique</h2>
          <p className="text-xs text-slate-500">
            {history.total} ligne(s) · page {history.page}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Modèle</th>
                <th className="px-3 py-2 font-medium">Tokens</th>
                <th className="px-3 py-2 font-medium">Coût estimé</th>
                <th className="px-3 py-2 font-medium">Complétude</th>
                <th className="px-3 py-2 font-medium">Réf.</th>
              </tr>
            </thead>
            <tbody>
              {history.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center text-slate-500"
                  >
                    Aucune consommation sur cette période.
                  </td>
                </tr>
              ) : (
                history.rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                      {new Date(row.consumedAt).toLocaleString("fr-FR")}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {operationTypeLabel(row.operationType)}
                      {row.isLegacy ? (
                        <span className="ml-1 text-xs text-amber-700">
                          legacy
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {row.model ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-700">
                      {formatTokenCount(row.inputTokens)} /{" "}
                      {formatTokenCount(row.outputTokens)}
                      {row.toolCallCount
                        ? ` · ${row.toolCallCount} outil`
                        : ""}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-900">
                      {row.estimatedCostLabel}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {completenessLabel(row.completeness)}
                    </td>
                    <td className="px-3 py-2">
                      {row.generationId ? (
                        <Link
                          href={`/articles/${row.generationId}?tab=usage`}
                          className="text-[#0F5270] hover:underline"
                        >
                          Article
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40"
            disabled={history.page <= 1 || loading}
            onClick={() => void reload({ page: history.page - 1 })}
          >
            Précédent
          </button>
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40"
            disabled={
              loading ||
              history.page * history.pageSize >= history.total
            }
            onClick={() => void reload({ page: history.page + 1 })}
          >
            Suivant
          </button>
        </div>
      </section>
    </div>
  );
}
