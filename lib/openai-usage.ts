/**
 * Parsing best-effort de TokenUsage Agents API (openai@7.25.0).
 * Le calcul de coût est dans lib/openai-pricing.ts.
 */

export type TokenUsageSnapshot = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  /** Objet usage brut tel que renvoyé par l'API. */
  raw: Record<string, unknown>;
};

export function parseTokenUsage(raw: unknown): TokenUsageSnapshot | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const inputTokens = record.input_tokens;
  const outputTokens = record.output_tokens;
  const totalTokens = record.total_tokens;

  if (
    typeof inputTokens !== "number" ||
    typeof outputTokens !== "number" ||
    typeof totalTokens !== "number" ||
    !Number.isFinite(inputTokens) ||
    !Number.isFinite(outputTokens) ||
    !Number.isFinite(totalTokens)
  ) {
    return null;
  }

  const inputDetails =
    record.input_tokens_details && typeof record.input_tokens_details === "object"
      ? (record.input_tokens_details as Record<string, unknown>)
      : null;
  const outputDetails =
    record.output_tokens_details && typeof record.output_tokens_details === "object"
      ? (record.output_tokens_details as Record<string, unknown>)
      : null;

  const cachedRaw = inputDetails?.cached_tokens;
  const reasoningRaw = outputDetails?.reasoning_tokens;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens:
      typeof cachedRaw === "number" && Number.isFinite(cachedRaw) ? cachedRaw : 0,
    reasoningTokens:
      typeof reasoningRaw === "number" && Number.isFinite(reasoningRaw)
        ? reasoningRaw
        : 0,
    raw: { ...record },
  };
}
