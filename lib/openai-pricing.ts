/**
 * Tarifs OpenAI officiels (USD) — catalogue versionné.
 *
 * Sources consultées 2026-11-25 :
 * - https://developers.openai.com/api/docs/pricing
 * - https://platform.openai.com/docs/pricing
 * - https://cdn.openai.com/API/docs/txt/llms-models-pricing.txt
 * - https://platform.openai.com/docs/guides/tools-web-search
 * - https://platform.openai.com/docs/api-reference/images
 * - https://platform.openai.com/docs/api-reference/responses
 *
 * Une entrée enregistrée fige `pricingVersion` : un futur catalogue
 * ne recalcule pas silencieusement les anciennes consommations.
 *
 * cached_tokens ⊆ input_tokens ; reasoning_tokens ⊆ output_tokens.
 * ne pas les recompter.
 * Ne jamais inventer un tarif pour un modèle inconnu.
 */

export const OPENAI_PRICING_VERSION = "v7150-2026-11-25";

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
  longContextInputThreshold?: number;
  longContextInputMultiplier?: number;
  longContextOutputMultiplier?: number;
  note?: string;
};

export type ImageModelTokenRates = {
  textInputPerMillion: number;
  textCachedInputPerMillion: number;
  imageInputPerMillion: number;
  imageCachedInputPerMillion: number;
  imageOutputPerMillion: number;
  note?: string;
};

export type WebSearchToolRates = {
  /** USD pour 1000 appels facturables à l’outil. */
  usdPerThousandCalls: number;
  /**
   * true = tokens de contenu de recherche inclus dans le forfait appel
   * (gpt-4o / gpt-4.1). false = facturés au tarif modèle (déjà dans usage).
   */
  searchContentIncludedInCallFee: boolean;
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
  "gpt-4.1": {
    uncachedInputPerMillion: 2.0,
    cachedInputPerMillion: 0.5,
    outputPerMillion: 8.0,
  },
  "gpt-4.1-mini": {
    uncachedInputPerMillion: 0.4,
    cachedInputPerMillion: 0.1,
    outputPerMillion: 1.6,
  },
};

/** Modèles image tarifés au token (Images API / Responses). */
const IMAGE_MODEL_RATES: Record<string, ImageModelTokenRates> = {
  "gpt-image-2.5-flare": {
    textInputPerMillion: 5.0,
    textCachedInputPerMillion: 1.25,
    imageInputPerMillion: 8.0,
    imageCachedInputPerMillion: 2.0,
    imageOutputPerMillion: 30.0,
    note: "Tarifs token Standard — developers.openai.com/api/docs/pricing 2026-11-25.",
  },
  "gpt-image-2.5-sunburst": {
    textInputPerMillion: 5.0,
    textCachedInputPerMillion: 1.25,
    imageInputPerMillion: 8.0,
    imageCachedInputPerMillion: 2.0,
    imageOutputPerMillion: 30.0,
  },
  "gpt-image-2": {
    textInputPerMillion: 5.0,
    textCachedInputPerMillion: 1.25,
    imageInputPerMillion: 8.0,
    imageCachedInputPerMillion: 2.0,
    imageOutputPerMillion: 30.0,
  },
};

/**
 * Familles web_search (doc tools pricing 2026-11-25) :
 * - reasoning / gpt-5* : $10 / 1k calls + content tokens au tarif modèle
 * - gpt-4o / gpt-4.1 (+ mini) preview : $25 / 1k, content inclus
 */
const WEB_SEARCH_REASONING: WebSearchToolRates = {
  usdPerThousandCalls: 10,
  searchContentIncludedInCallFee: false,
  note: "Web search — modèles reasoning / gpt-5* : $10/1k + content tokens au tarif modèle.",
};

const WEB_SEARCH_GPT41_FAMILY: WebSearchToolRates = {
  usdPerThousandCalls: 25,
  searchContentIncludedInCallFee: true,
  note: "Web search preview — gpt-4o / gpt-4.1 : $25/1k, content tokens inclus.",
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

export function getImageModelRates(
  model: string | null | undefined
): ImageModelTokenRates | null {
  const id = resolvePricingModelId(model);
  if (!id) {
    return null;
  }
  return IMAGE_MODEL_RATES[id] ?? null;
}

export function getWebSearchToolRates(
  model: string | null | undefined
): WebSearchToolRates | null {
  const id = resolvePricingModelId(model);
  if (!id) {
    return null;
  }
  if (
    id.startsWith("gpt-5") ||
    id.startsWith("o3") ||
    id.startsWith("o4") ||
    id.includes("deep-research")
  ) {
    return WEB_SEARCH_REASONING;
  }
  if (id.startsWith("gpt-4.1") || id.startsWith("gpt-4o")) {
    return WEB_SEARCH_GPT41_FAMILY;
  }
  return null;
}

function roundUsdMicros(cost: number): number {
  return Math.round(cost * 1_000_000) / 1_000_000;
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

  return roundUsdMicros(cost);
}

export type ImageUsageForPricing = {
  textInputTokens: number;
  textCachedInputTokens?: number;
  imageInputTokens: number;
  imageCachedInputTokens?: number;
  imageOutputTokens: number;
};

/**
 * Coût image au token (gpt-image-2*). null si modèle inconnu / compteurs invalides.
 * Ne cumule pas un forfait fixe par image lorsque la tarification token s’applique.
 */
export function estimateImageTokenCostUsd(
  model: string | null | undefined,
  usage: ImageUsageForPricing
): number | null {
  const rates = getImageModelRates(model);
  if (!rates) {
    return null;
  }

  const textIn = usage.textInputTokens;
  const textCached = usage.textCachedInputTokens ?? 0;
  const imageIn = usage.imageInputTokens;
  const imageCached = usage.imageCachedInputTokens ?? 0;
  const imageOut = usage.imageOutputTokens;

  const values = [textIn, textCached, imageIn, imageCached, imageOut];
  if (
    values.some((v) => !Number.isFinite(v) || v < 0) ||
    textCached > textIn ||
    imageCached > imageIn
  ) {
    return null;
  }

  const cost =
    ((textIn - textCached) / 1_000_000) * rates.textInputPerMillion +
    (textCached / 1_000_000) * rates.textCachedInputPerMillion +
    ((imageIn - imageCached) / 1_000_000) * rates.imageInputPerMillion +
    (imageCached / 1_000_000) * rates.imageCachedInputPerMillion +
    (imageOut / 1_000_000) * rates.imageOutputPerMillion;

  return roundUsdMicros(cost);
}

/**
 * Coût outil web_search (USD) — uniquement les appels facturables.
 * Les tokens de contenu déjà dans l’usage modèle ne sont pas recomptés ici.
 */
export function estimateWebSearchToolCostUsd(
  model: string | null | undefined,
  billableCallCount: number
): number | null {
  const rates = getWebSearchToolRates(model);
  if (!rates) {
    return null;
  }
  if (
    !Number.isFinite(billableCallCount) ||
    billableCallCount < 0 ||
    !Number.isInteger(billableCallCount)
  ) {
    return null;
  }
  if (billableCallCount === 0) {
    return 0;
  }
  return roundUsdMicros(
    (billableCallCount / 1000) * rates.usdPerThousandCalls
  );
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
  if (id === "gpt-4.1-mini") {
    return "GPT-4.1 mini";
  }
  if (id === "gpt-4.1") {
    return "GPT-4.1";
  }
  if (id === "gpt-image-2.5-flare") {
    return "GPT Image 2.5 Flare";
  }
  return model;
}

/** Modèles LLM tarifés connus (tests / audit). */
export function listPricedModelIds(): string[] {
  return Object.keys(MODEL_RATES);
}

export function listPricedImageModelIds(): string[] {
  return Object.keys(IMAGE_MODEL_RATES);
}

export function pricingCatalogMeta(): {
  version: string;
  sources: string[];
  effectiveDate: string;
} {
  return {
    version: OPENAI_PRICING_VERSION,
    effectiveDate: "2026-11-25",
    sources: [
      "https://developers.openai.com/api/docs/pricing",
      "https://platform.openai.com/docs/pricing",
      "https://cdn.openai.com/API/docs/txt/llms-models-pricing.txt",
      "https://platform.openai.com/docs/guides/tools-web-search",
      "https://platform.openai.com/docs/api-reference/images",
      "https://platform.openai.com/docs/api-reference/usage",
    ],
  };
}
