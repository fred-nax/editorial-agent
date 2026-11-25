/**
 * Recalcul dry-run des coûts LLM historiques (sans appel OpenAI).
 * N’écrit jamais en base — le backfill attend une validation utilisateur.
 */

import { db } from "@/lib/db";
import {
  estimateLlmCostUsd,
  getModelRates,
  resolvePricingModelId,
} from "@/lib/openai-pricing";

export type HistoricalCostCandidate = {
  id: string;
  workspaceId: string;
  cmsDestination: string | null;
  model: string;
  resolvedModelId: string | null;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  oldEstimatedCost: number | null;
  newEstimatedCost: number | null;
  action: "recalculate" | "skip_valid" | "skip_insufficient" | "skip_unknown_rate";
};

export type HistoricalCostDryRunResult = {
  scanned: number;
  recalculable: number;
  skipValid: number;
  skipInsufficient: number;
  skipUnknownRate: number;
  byWorkspace: Record<
    string,
    { recalculable: number; oldSum: number; newSum: number }
  >;
  byModel: Record<string, number>;
  sample: HistoricalCostCandidate[];
};

const EPSILON = 1e-9;

function isValidStoredCost(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Dry-run lecture seule. Ne modifie aucune ligne.
 * Les coûts déjà valides (nombre fini ≥ 0) sont préservés (skip_valid).
 */
export async function dryRunHistoricalLlmCostRecalc(input?: {
  workspaceId?: string;
  limit?: number;
}): Promise<HistoricalCostDryRunResult> {
  const limit = Math.min(Math.max(input?.limit ?? 5000, 1), 20_000);
  const rows = await db.articleGeneration.findMany({
    where: {
      status: "completed",
      ...(input?.workspaceId ? { workspaceId: input.workspaceId } : {}),
    },
    select: {
      id: true,
      workspaceId: true,
      cmsDestination: true,
      model: true,
      inputTokens: true,
      cachedInputTokens: true,
      outputTokens: true,
      estimatedCost: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const result: HistoricalCostDryRunResult = {
    scanned: rows.length,
    recalculable: 0,
    skipValid: 0,
    skipInsufficient: 0,
    skipUnknownRate: 0,
    byWorkspace: {},
    byModel: {},
    sample: [],
  };

  for (const row of rows) {
    const model = row.model?.trim() || null;
    const inputTokens = row.inputTokens;
    const outputTokens = row.outputTokens;
    const cachedInputTokens = row.cachedInputTokens ?? 0;

    if (isValidStoredCost(row.estimatedCost) && row.estimatedCost !== null) {
      // Déjà un coût stocké valide → ne jamais écraser.
      result.skipValid += 1;
      continue;
    }

    if (
      !model ||
      inputTokens === null ||
      outputTokens === null ||
      !Number.isFinite(inputTokens) ||
      !Number.isFinite(outputTokens)
    ) {
      result.skipInsufficient += 1;
      continue;
    }

    if (!getModelRates(model)) {
      result.skipUnknownRate += 1;
      const candidate: HistoricalCostCandidate = {
        id: row.id,
        workspaceId: row.workspaceId,
        cmsDestination: row.cmsDestination,
        model,
        resolvedModelId: resolvePricingModelId(model),
        inputTokens,
        cachedInputTokens,
        outputTokens,
        oldEstimatedCost: row.estimatedCost,
        newEstimatedCost: null,
        action: "skip_unknown_rate",
      };
      if (result.sample.length < 25) {
        result.sample.push(candidate);
      }
      continue;
    }

    const next = estimateLlmCostUsd(model, {
      inputTokens,
      cachedInputTokens,
      outputTokens,
    });

    if (next === null) {
      result.skipInsufficient += 1;
      continue;
    }

    result.recalculable += 1;
    result.byModel[model] = (result.byModel[model] ?? 0) + 1;
    const bucket = result.byWorkspace[row.workspaceId] ?? {
      recalculable: 0,
      oldSum: 0,
      newSum: 0,
    };
    bucket.recalculable += 1;
    bucket.newSum += next;
    result.byWorkspace[row.workspaceId] = bucket;

    const candidate: HistoricalCostCandidate = {
      id: row.id,
      workspaceId: row.workspaceId,
      cmsDestination: row.cmsDestination,
      model,
      resolvedModelId: resolvePricingModelId(model),
      inputTokens,
      cachedInputTokens,
      outputTokens,
      oldEstimatedCost: row.estimatedCost,
      newEstimatedCost: next,
      action: "recalculate",
    };
    if (result.sample.length < 25) {
      result.sample.push(candidate);
    }
  }

  return result;
}

/**
 * Garde-fou : un backfill n’écrase jamais un coût valide existant.
 * (Fonction pure pour tests — pas d’écriture ici.)
 */
export function shouldBackfillEstimatedCost(input: {
  current: number | null | undefined;
  next: number | null | undefined;
}): boolean {
  if (input.next === null || input.next === undefined || !Number.isFinite(input.next)) {
    return false;
  }
  if (isValidStoredCost(input.current)) {
    return false;
  }
  // current null / NaN → OK to fill
  if (input.current === null || input.current === undefined) {
    return true;
  }
  return Math.abs(Number(input.current) - input.next) > EPSILON;
}
