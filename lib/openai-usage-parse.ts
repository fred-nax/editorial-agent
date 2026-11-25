/**
 * Extraction best-effort des consommations depuis les réponses OpenAI.
 * Ne convertit jamais une absence d’usage en zéro.
 */

import { parseTokenUsage, type TokenUsageSnapshot } from "./openai-usage";

export type ResponsesUsageSnapshot = TokenUsageSnapshot & {
  responseId: string | null;
};

export type ChatCompletionUsageSnapshot = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  responseId: string | null;
};

export type ImagesUsageSnapshot = {
  textInputTokens: number;
  textCachedInputTokens: number;
  imageInputTokens: number;
  imageCachedInputTokens: number;
  imageOutputTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  responseId: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function finiteInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.trunc(value);
}

export function parseResponsesUsage(response: unknown): ResponsesUsageSnapshot | null {
  const record = asRecord(response);
  if (!record) {
    return null;
  }
  const usage = parseTokenUsage(record.usage);
  if (!usage) {
    return null;
  }
  const id = typeof record.id === "string" ? record.id : null;
  return { ...usage, responseId: id };
}

export function parseChatCompletionUsage(
  completion: unknown
): ChatCompletionUsageSnapshot | null {
  const record = asRecord(completion);
  if (!record) {
    return null;
  }
  const usage = asRecord(record.usage);
  if (!usage) {
    return null;
  }
  const prompt = finiteInt(usage.prompt_tokens);
  const completionTokens = finiteInt(usage.completion_tokens);
  const total = finiteInt(usage.total_tokens);
  if (prompt === null || completionTokens === null || total === null) {
    return null;
  }
  const details = asRecord(usage.prompt_tokens_details);
  const cached = finiteInt(details?.cached_tokens) ?? 0;
  const completionDetails = asRecord(usage.completion_tokens_details);
  const reasoning = finiteInt(completionDetails?.reasoning_tokens) ?? 0;
  const id = typeof record.id === "string" ? record.id : null;
  return {
    inputTokens: prompt,
    outputTokens: completionTokens,
    totalTokens: total,
    cachedInputTokens: cached,
    reasoningTokens: reasoning,
    responseId: id,
  };
}

/**
 * Usage Images API (gpt-image-*). Absent sur certains modèles → null.
 */
export function parseImagesUsage(response: unknown): ImagesUsageSnapshot | null {
  const record = asRecord(response);
  if (!record) {
    return null;
  }
  const usage = asRecord(record.usage);
  if (!usage) {
    return null;
  }

  const inputTokens = finiteInt(usage.input_tokens);
  const outputTokens = finiteInt(usage.output_tokens);
  const totalTokens = finiteInt(usage.total_tokens);

  const inputDetails = asRecord(usage.input_tokens_details);
  const imageInput = finiteInt(inputDetails?.image_tokens);
  const textIn =
    finiteInt(usage.text_input_tokens) ??
    finiteInt(inputDetails?.text_tokens);
  const imageIn = finiteInt(usage.image_input_tokens) ?? imageInput ?? 0;
  const imageOut =
    finiteInt(usage.image_output_tokens) ?? outputTokens;

  // Insuffisant pour tarifer — ne pas inventer de tokens.
  if (inputTokens === null && textIn === null) {
    return null;
  }
  if (imageOut === null && outputTokens === null) {
    return null;
  }

  const resolvedTextIn =
    textIn ?? Math.max(0, (inputTokens ?? 0) - imageIn);
  const resolvedImageOut = imageOut ?? outputTokens ?? 0;
  const resolvedInput = inputTokens ?? resolvedTextIn + imageIn;
  const resolvedOutput = outputTokens ?? resolvedImageOut;
  const resolvedTotal = totalTokens ?? resolvedInput + resolvedOutput;

  const id =
    typeof record.id === "string"
      ? record.id
      : typeof record.created === "number"
        ? `images:${record.created}`
        : null;

  return {
    textInputTokens: resolvedTextIn,
    textCachedInputTokens: 0,
    imageInputTokens: imageIn,
    imageCachedInputTokens: 0,
    imageOutputTokens: resolvedImageOut,
    inputTokens: resolvedInput,
    outputTokens: resolvedOutput,
    totalTokens: resolvedTotal,
    responseId: id,
  };
}

/** Compte les web_search_call distincts dans une réponse Responses. */
export function countWebSearchCallsInResponse(response: unknown): number {
  const record = asRecord(response);
  if (!record) {
    return 0;
  }
  const output = record.output;
  if (!Array.isArray(output)) {
    return 0;
  }
  const ids = new Set<string>();
  let anonymous = 0;
  for (const item of output) {
    const row = asRecord(item);
    if (!row || row.type !== "web_search_call") {
      continue;
    }
    if (typeof row.id === "string" && row.id.trim()) {
      ids.add(row.id.trim());
    } else {
      anonymous += 1;
    }
  }
  return ids.size + anonymous;
}

export function countWebSearchCallsFromTraceIds(
  callIds: string[] | null | undefined
): number {
  if (!Array.isArray(callIds)) {
    return 0;
  }
  const unique = new Set(
    callIds.filter((id) => typeof id === "string" && id.trim().length > 0)
  );
  return unique.size;
}
