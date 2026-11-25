/**
 * Tarifs LLM officiels OpenAI (USD / 1M tokens) — standard short-context.
 *
 * Sources (consultées 2026-11-25) :
 * - https://developers.openai.com/api/docs/pricing
 * - https://developers.openai.com/api/docs/models/gpt-5.6-sol
 * - https://developers.openai.com/api/docs/models/gpt-5.6-terra
 *
 * gpt-5.6-sol : Input $4 / Cached $0.40 / Output $20 (promo jusqu’au 2026-11-30).
 * gpt-5.6 alias → gpt-5.6-sol (doc modèle).
 *
 * cached_tokens est inclus dans input_tokens.
 * reasoning_tokens est inclus dans output_tokens → ne pas les recompter.
 *
 * Ce coût est uniquement le coût LLM session. Hors web_search / images /
 * autres tools (pas de tokens image persistés sur ArticleGeneration).
 */

export type LlmUsageForPricing = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

export type ModelTokenRates = {
  /** USD / 1M tokens input non cachés */
  uncachedInputPerMillion: number;
  /** USD / 1M tokens input cachés */
  cachedInputPerMillion: number;
  /** USD / 1M tokens output (reasoning inclus) */
  outputPerMillion: number;
  /**
   * Seuil de tokens d’entrée au-delà duquel le tarif long-context
   * s’applique à toute la requête (doc GPT-5.6*).
   */
  longContextInputThreshold?: number;
  /** Multiplicateur input (uncached + cached) en long-context. */
  longContextInputMultiplier?: number;
  /** Multiplicateur output en long-context. */
  longContextOutputMultiplier?: number;
  /** Note tarifaire (promo, etc.). */
  note?: string;
};

/** Alias → id tarifaire confirmé par la doc OpenAI. */
const MODEL_ALIASES: Record<string, string> = {
  "gpt-5.6": "gpt-5.6-sol",
};

const MODEL_RATES: Record<string, ModelTokenRates> = {
  "gpt-5.6-terra": {
    uncachedInputPerMillion: 2.0,
    cachedInputPerMillion: 0.2,
    outputPerMillion: 12.0,
    longContextInputThreshold: 272_000,
    longContextInputMultiplier: 2,
    longContextOutputMultiplier: 1.5,
  },
  "gpt-5.6-sol": {
    uncachedInputPerMillion: 4.0,
    cachedInputPerMillion: 0.4,
    outputPerMillion: 20.0,
    longContextInputThreshold: 272_000,
    longContextInputMultiplier: 2,
    longContextOutputMultiplier: 1.5,
    note: "Tarif standard / promo Sol jusqu’au 2026-11-30 (sources OpenAI 2026-11-25).",
  },
};

export function resolvePricingModelId(
  model: string | null | undefined
): string | null {
  if (!model) {
    return null;
  }
  const trimmed = model.trim();
  if (!trimmed) {
    return null;
  }
  return MODEL_ALIASES[trimmed] ?? trimmed;
}

export function getModelRates(
  model: string | null | undefined
): ModelTokenRates | null {
  const id = resolvePricingModelId(model);
  if (!id) {
    return null;
  }
  return MODEL_RATES[id] ?? null;
}

/**
 * Coût LLM estimé (USD). null si modèle sans tarif officiel connu
 * ou si les compteurs sont invalides / incomplets.
 */
export function estimateLlmCostUsd(
  model: string | null | undefined,
  usage: LlmUsageForPricing
): number | null {
  const rates = getModelRates(model);
  if (!rates) {
    return null;
  }

  const { inputTokens, cachedInputTokens, outputTokens } = usage;

  if (
    !Number.isFinite(inputTokens) ||
    !Number.isFinite(cachedInputTokens) ||
    !Number.isFinite(outputTokens) ||
    inputTokens < 0 ||
    cachedInputTokens < 0 ||
    outputTokens < 0 ||
    cachedInputTokens > inputTokens
  ) {
    return null;
  }

  const uncachedInput = inputTokens - cachedInputTokens;
  const long =
    typeof rates.longContextInputThreshold === "number" &&
    inputTokens > rates.longContextInputThreshold;
  const inputMult = long ? (rates.longContextInputMultiplier ?? 1) : 1;
  const outputMult = long ? (rates.longContextOutputMultiplier ?? 1) : 1;

  const cost =
    (uncachedInput / 1_000_000) *
      rates.uncachedInputPerMillion *
      inputMult +
    (cachedInputTokens / 1_000_000) *
      rates.cachedInputPerMillion *
      inputMult +
    (outputTokens / 1_000_000) * rates.outputPerMillion * outputMult;

  return Math.round(cost * 1_000_000) / 1_000_000;
}

export type CostEstimateKind = "known" | "zero" | "unknown" | "partial";

/**
 * Qualifie un coût LLM pour l’UI :
 * - known / zero : montant calculé
 * - unknown : modèle sans tarif ou tokens manquants
 * - partial : montant LLM connu mais hors images/tools (toujours vrai côté UI)
 */
export function classifyLlmCostEstimate(input: {
  estimatedCost: number | null | undefined;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
}): CostEstimateKind {
  const { estimatedCost } = input;
  if (estimatedCost === 0) {
    return "zero";
  }
  if (typeof estimatedCost === "number" && Number.isFinite(estimatedCost)) {
    return "known";
  }
  const hasTokens =
    typeof input.inputTokens === "number" &&
    typeof input.outputTokens === "number";
  const hasModel = Boolean(input.model?.trim());
  if (hasTokens && hasModel && !getModelRates(input.model)) {
    return "unknown";
  }
  if (!hasTokens || !hasModel) {
    return "unknown";
  }
  return "unknown";
}

export function formatModelLabel(model: string | null | undefined): string | null {
  if (!model) {
    return null;
  }
  const id = resolvePricingModelId(model) ?? model.trim();
  if (id === "gpt-5.6-terra") {
    return "GPT-5.6 Terra";
  }
  if (id === "gpt-5.6-sol") {
    return model.trim() === "gpt-5.6" ? "GPT-5.6 Sol (alias gpt-5.6)" : "GPT-5.6 Sol";
  }
  return model;
}

/** Modèles tarifés connus (tests / audit). */
export function listPricedModelIds(): string[] {
  return Object.keys(MODEL_RATES);
}
