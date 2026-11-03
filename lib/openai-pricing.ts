/**
 * Tarifs LLM officiels OpenAI (USD / 1M tokens).
 * Source gpt-5.6-terra :
 * https://developers.openai.com/api/docs/models/gpt-5.6-terra
 *
 * cached_tokens est inclus dans input_tokens.
 * reasoning_tokens est inclus dans output_tokens → ne pas les recompter.
 *
 * Ce coût est uniquement le coût LLM. Hors web_search / autres tools.
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
};

const MODEL_RATES: Record<string, ModelTokenRates> = {
  "gpt-5.6-terra": {
    uncachedInputPerMillion: 2.0,
    cachedInputPerMillion: 0.2,
    outputPerMillion: 12.0,
  },
};

export function getModelRates(model: string | null | undefined): ModelTokenRates | null {
  if (!model) {
    return null;
  }
  return MODEL_RATES[model.trim()] ?? null;
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

  const cost =
    (uncachedInput / 1_000_000) * rates.uncachedInputPerMillion +
    (cachedInputTokens / 1_000_000) * rates.cachedInputPerMillion +
    (outputTokens / 1_000_000) * rates.outputPerMillion;

  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function formatModelLabel(model: string | null | undefined): string | null {
  if (!model) {
    return null;
  }
  if (model === "gpt-5.6-terra") {
    return "GPT-5.6 Terra";
  }
  return model;
}
