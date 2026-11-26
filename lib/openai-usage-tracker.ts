/**
 * Collecte centralisée des consommations OpenAI (V7.15.0).
 *
 * - workspaceId figé à l’appel (jamais relu depuis le cookie UI).
 * - Idempotence via idempotencyKey unique.
 * - Une erreur du tracker ne relance jamais OpenAI et n’échoue pas l’opération métier.
 * - Ne stocke ni prompts ni réponses brutes ni secrets.
 * - Ne convertit jamais une consommation inconnue en zéro.
 */

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logError, logInfo } from "@/lib/logger";
import {
  OPENAI_PRICING_VERSION,
  estimateImageTokenCostUsd,
  estimateLlmCostUsd,
  estimateWebSearchToolCostUsd,
  getImageModelRates,
  getModelRates,
  getWebSearchToolRates,
} from "@/lib/openai-pricing";
import type {
  OpenAiUsageCompleteness,
  OpenAiUsageOperationType,
  OpenAiUsageStatus,
} from "@/lib/openai-usage-types";

export {
  OPENAI_USAGE_OPERATION_TYPES,
  type OpenAiUsageCompleteness,
  type OpenAiUsageOperationType,
  type OpenAiUsageStatus,
} from "@/lib/openai-usage-types";

function assertUsageEventDelegateAvailable(): string | null {
  const hasModel = Prisma.dmmf.datamodel.models.some(
    (model) => model.name === "OpenAiUsageEvent"
  );
  if (!hasModel) {
    return "client Prisma sans modèle OpenAiUsageEvent (régénérer + redémarrer Next.js)";
  }
  if (typeof (db as { openAiUsageEvent?: unknown }).openAiUsageEvent !== "object") {
    return "délégué openAiUsageEvent indisponible sur le client Prisma";
  }
  return null;
}

export type RecordOpenAiUsageInput = {
  workspaceId: string;
  operationType: OpenAiUsageOperationType;
  idempotencyKey: string;
  endpoint: string;
  status?: OpenAiUsageStatus;
  operationKey?: string | null;
  generationId?: string | null;
  featuredImageId?: string | null;
  requestedModel?: string | null;
  usedModel?: string | null;
  responseId?: string | null;
  requestId?: string | null;
  consumedAt?: Date;
  inputTokens?: number | null;
  cachedInputTokens?: number | null;
  outputTokens?: number | null;
  reasoningTokens?: number | null;
  totalTokens?: number | null;
  textInputTokens?: number | null;
  imageInputTokens?: number | null;
  imageOutputTokens?: number | null;
  toolCallCount?: number | null;
  estimatedCostUsd?: number | null;
  completeness: OpenAiUsageCompleteness;
  costSource?: "local_estimate" | "legacy_mirror";
  pricingVersion?: string;
  meta?: Record<string, unknown> | null;
};

export type RecordOpenAiUsageResult = {
  recorded: boolean;
  duplicate: boolean;
  eventId: string | null;
  error: string | null;
};

function toDecimal(value: number | null | undefined): Prisma.Decimal | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return new Prisma.Decimal(value.toFixed(8));
}

function classifyFromCost(
  cost: number | null,
  hasObservableUsage: boolean
): OpenAiUsageCompleteness {
  if (cost === 0) {
    return "zero";
  }
  if (typeof cost === "number" && Number.isFinite(cost)) {
    return "complete";
  }
  if (hasObservableUsage) {
    return "unknown";
  }
  return "unknown";
}

/**
 * Enregistre une consommation. Idempotent. Ne jette jamais vers l’appelant métier.
 */
export async function recordOpenAiUsageEvent(
  input: RecordOpenAiUsageInput
): Promise<RecordOpenAiUsageResult> {
  try {
    const workspaceId = input.workspaceId?.trim();
    if (!workspaceId) {
      return {
        recorded: false,
        duplicate: false,
        eventId: null,
        error: "workspaceId manquant",
      };
    }
    const key = input.idempotencyKey?.trim();
    if (!key) {
      return {
        recorded: false,
        duplicate: false,
        eventId: null,
        error: "idempotencyKey manquant",
      };
    }

    const delegateError = assertUsageEventDelegateAvailable();
    if (delegateError) {
      logError("openai-usage", "record unavailable", {
        operationType: input.operationType,
        generationId: input.generationId ?? null,
        featuredImageId: input.featuredImageId ?? null,
        error: delegateError,
      });
      return {
        recorded: false,
        duplicate: false,
        eventId: null,
        error: delegateError,
      };
    }

    // DB-003 — défense en profondeur : parents ∈ workspaceId fourni.
    const generationId = input.generationId?.trim() || null;
    const featuredImageId = input.featuredImageId?.trim() || null;
    if (generationId) {
      const generation = await db.articleGeneration.findFirst({
        where: { id: generationId, workspaceId },
        select: { id: true },
      });
      if (!generation) {
        return {
          recorded: false,
          duplicate: false,
          eventId: null,
          error: "generationId hors workspace",
        };
      }
    }
    if (featuredImageId) {
      const image = await db.articleFeaturedImage.findFirst({
        where: { id: featuredImageId, workspaceId },
        select: { id: true },
      });
      if (!image) {
        return {
          recorded: false,
          duplicate: false,
          eventId: null,
          error: "featuredImageId hors workspace",
        };
      }
    }

    const created = await db.openAiUsageEvent.create({
      data: {
        workspaceId,
        operationType: input.operationType,
        operationKey: input.operationKey ?? null,
        generationId,
        featuredImageId,
        requestedModel: input.requestedModel ?? null,
        usedModel: input.usedModel ?? null,
        endpoint: input.endpoint,
        responseId: input.responseId ?? null,
        requestId: input.requestId ?? null,
        consumedAt: input.consumedAt ?? new Date(),
        status: input.status ?? "succeeded",
        inputTokens: input.inputTokens ?? null,
        cachedInputTokens: input.cachedInputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
        reasoningTokens: input.reasoningTokens ?? null,
        totalTokens: input.totalTokens ?? null,
        textInputTokens: input.textInputTokens ?? null,
        imageInputTokens: input.imageInputTokens ?? null,
        imageOutputTokens: input.imageOutputTokens ?? null,
        toolCallCount: input.toolCallCount ?? null,
        estimatedCostUsd: toDecimal(input.estimatedCostUsd),
        currency: "USD",
        pricingVersion: input.pricingVersion ?? OPENAI_PRICING_VERSION,
        completeness: input.completeness,
        costSource: input.costSource ?? "local_estimate",
        idempotencyKey: key,
        meta:
          input.meta === undefined || input.meta === null
            ? undefined
            : (input.meta as Prisma.InputJsonValue),
      },
      select: { id: true },
    });

    logInfo("openai-usage", "recorded", {
      eventId: created.id,
      workspaceId,
      operationType: input.operationType,
      completeness: input.completeness,
      estimatedCostUsd: input.estimatedCostUsd ?? null,
    });

    return {
      recorded: true,
      duplicate: false,
      eventId: created.id,
      error: null,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        recorded: false,
        duplicate: true,
        eventId: null,
        error: null,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    logError("openai-usage", "record failed", {
      operationType: input.operationType,
      idempotencyKey: input.idempotencyKey,
      generationId: input.generationId ?? null,
      featuredImageId: input.featuredImageId ?? null,
      workspaceId: input.workspaceId,
      error: message,
    });
    return {
      recorded: false,
      duplicate: false,
      eventId: null,
      error: message,
    };
  }
}

/** Enregistre le coût LLM d’une session Agents (génération d’article). */
export async function recordArticleGenerationLlmUsage(input: {
  workspaceId: string;
  generationId: string;
  sessionId: string | null;
  model: string | null;
  status: OpenAiUsageStatus;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd?: number | null;
}): Promise<RecordOpenAiUsageResult> {
  const hasTokens =
    typeof input.inputTokens === "number" &&
    typeof input.outputTokens === "number";
  const cost =
    typeof input.estimatedCostUsd === "number"
      ? input.estimatedCostUsd
      : hasTokens
        ? estimateLlmCostUsd(input.model, {
            inputTokens: input.inputTokens!,
            cachedInputTokens: input.cachedInputTokens ?? 0,
            outputTokens: input.outputTokens!,
          })
        : null;

  let completeness: OpenAiUsageCompleteness;
  if (!hasTokens) {
    completeness = "unknown";
  } else if (cost === 0) {
    completeness = "zero";
  } else if (typeof cost === "number") {
    // LLM connu mais web_search / images hors de cet événement → partial
    completeness = "partial";
  } else if (input.model && !getModelRates(input.model)) {
    completeness = "unknown";
  } else {
    completeness = "unknown";
  }

  const sessionPart = input.sessionId?.trim() || "nosession";
  return recordOpenAiUsageEvent({
    workspaceId: input.workspaceId,
    operationType: "article_generation",
    idempotencyKey: `gen:${input.generationId}:llm:${sessionPart}`,
    endpoint: "agents.sessions",
    status: input.status,
    operationKey: input.generationId,
    generationId: input.generationId,
    requestedModel: input.model,
    usedModel: input.model,
    responseId: input.sessionId,
    inputTokens: input.inputTokens,
    cachedInputTokens: input.cachedInputTokens,
    outputTokens: input.outputTokens,
    reasoningTokens: input.reasoningTokens,
    totalTokens: input.totalTokens,
    estimatedCostUsd: cost,
    completeness,
  });
}

/** Enregistre le coût outil web_search d’une génération (appels observés). */
export async function recordArticleGenerationWebSearchUsage(input: {
  workspaceId: string;
  generationId: string;
  sessionId: string | null;
  model: string | null;
  billableCallCount: number;
  status?: OpenAiUsageStatus;
}): Promise<RecordOpenAiUsageResult> {
  const rates = getWebSearchToolRates(input.model);
  const cost =
    input.billableCallCount > 0
      ? estimateWebSearchToolCostUsd(input.model, input.billableCallCount)
      : 0;

  let completeness: OpenAiUsageCompleteness;
  if (input.billableCallCount <= 0) {
    completeness = "zero";
  } else if (!rates) {
    completeness = "unknown";
  } else if (typeof cost === "number") {
    completeness = "partial";
  } else {
    completeness = "unknown";
  }

  const sessionPart = input.sessionId?.trim() || "nosession";
  return recordOpenAiUsageEvent({
    workspaceId: input.workspaceId,
    operationType: "web_search",
    idempotencyKey: `gen:${input.generationId}:web_search:${sessionPart}`,
    endpoint: "agents.sessions",
    status: input.status ?? "succeeded",
    operationKey: input.generationId,
    generationId: input.generationId,
    requestedModel: input.model,
    usedModel: input.model,
    responseId: input.sessionId,
    toolCallCount: input.billableCallCount,
    estimatedCostUsd: cost,
    completeness,
    meta: {
      note: rates?.searchContentIncludedInCallFee
        ? "content_tokens_included_in_tool_fee"
        : "content_tokens_billed_in_model_usage",
    },
  });
}

export async function recordImageGenerationUsage(input: {
  workspaceId: string;
  generationId: string;
  featuredImageId: string;
  model: string;
  size: string;
  quality: string;
  status: OpenAiUsageStatus;
  usage: {
    textInputTokens: number;
    imageInputTokens: number;
    imageOutputTokens: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    responseId: string | null;
  } | null;
}): Promise<RecordOpenAiUsageResult> {
  const hasUsage = input.usage !== null;
  const cost = hasUsage
    ? estimateImageTokenCostUsd(input.model, {
        textInputTokens: input.usage!.textInputTokens,
        imageInputTokens: input.usage!.imageInputTokens,
        imageOutputTokens: input.usage!.imageOutputTokens,
      })
    : null;

  let completeness: OpenAiUsageCompleteness;
  if (!hasUsage) {
    completeness = getImageModelRates(input.model) ? "unknown" : "unknown";
  } else if (cost === 0) {
    completeness = "zero";
  } else if (typeof cost === "number") {
    completeness = "complete";
  } else {
    completeness = "unknown";
  }

  return recordOpenAiUsageEvent({
    workspaceId: input.workspaceId,
    operationType: "image_generation",
    idempotencyKey: `img:${input.featuredImageId}:generate`,
    endpoint: "images.generate",
    status: input.status,
    operationKey: input.featuredImageId,
    generationId: input.generationId,
    featuredImageId: input.featuredImageId,
    requestedModel: input.model,
    usedModel: input.model,
    responseId: input.usage?.responseId ?? null,
    inputTokens: input.usage?.inputTokens ?? null,
    outputTokens: input.usage?.outputTokens ?? null,
    totalTokens: input.usage?.totalTokens ?? null,
    textInputTokens: input.usage?.textInputTokens ?? null,
    imageInputTokens: input.usage?.imageInputTokens ?? null,
    imageOutputTokens: input.usage?.imageOutputTokens ?? null,
    estimatedCostUsd: cost,
    completeness,
    meta: { size: input.size, quality: input.quality },
  });
}

export async function recordImageAltUsage(input: {
  workspaceId: string;
  generationId: string;
  featuredImageId: string;
  model: string;
  status: OpenAiUsageStatus;
  usage: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    totalTokens: number;
    responseId: string | null;
  } | null;
}): Promise<RecordOpenAiUsageResult> {
  const hasUsage = input.usage !== null;
  const cost = hasUsage
    ? estimateLlmCostUsd(input.model, {
        inputTokens: input.usage!.inputTokens,
        cachedInputTokens: input.usage!.cachedInputTokens,
        outputTokens: input.usage!.outputTokens,
      })
    : null;

  const completeness = classifyFromCost(cost, hasUsage);

  return recordOpenAiUsageEvent({
    workspaceId: input.workspaceId,
    operationType: "image_alt",
    idempotencyKey: `img:${input.featuredImageId}:alt`,
    endpoint: "chat.completions",
    status: input.status,
    operationKey: input.featuredImageId,
    generationId: input.generationId,
    featuredImageId: input.featuredImageId,
    requestedModel: input.model,
    usedModel: input.model,
    responseId: input.usage?.responseId ?? null,
    inputTokens: input.usage?.inputTokens ?? null,
    cachedInputTokens: input.usage?.cachedInputTokens ?? null,
    outputTokens: input.usage?.outputTokens ?? null,
    reasoningTokens: input.usage?.reasoningTokens ?? null,
    totalTokens: input.usage?.totalTokens ?? null,
    estimatedCostUsd: cost,
    completeness: hasUsage && typeof cost === "number" ? completeness : "unknown",
  });
}

export async function recordResponsesApiUsage(input: {
  workspaceId: string;
  operationType: Exclude<
    OpenAiUsageOperationType,
    "article_generation" | "image_generation" | "image_alt" | "web_search"
  >;
  idempotencyKey: string;
  operationKey?: string | null;
  generationId?: string | null;
  model: string;
  status: OpenAiUsageStatus;
  usage: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    totalTokens: number;
    responseId: string | null;
  } | null;
  webSearchCallCount?: number;
}): Promise<RecordOpenAiUsageResult[]> {
  const results: RecordOpenAiUsageResult[] = [];
  const hasUsage = input.usage !== null;
  const llmCost = hasUsage
    ? estimateLlmCostUsd(input.model, {
        inputTokens: input.usage!.inputTokens,
        cachedInputTokens: input.usage!.cachedInputTokens,
        outputTokens: input.usage!.outputTokens,
      })
    : null;

  const llmCompleteness =
    !hasUsage
      ? "unknown"
      : typeof llmCost === "number"
        ? input.webSearchCallCount && input.webSearchCallCount > 0
          ? "partial"
          : llmCost === 0
            ? "zero"
            : "complete"
        : "unknown";

  results.push(
    await recordOpenAiUsageEvent({
      workspaceId: input.workspaceId,
      operationType: input.operationType,
      idempotencyKey: input.idempotencyKey,
      endpoint: "responses",
      status: input.status,
      operationKey: input.operationKey ?? null,
      generationId: input.generationId ?? null,
      requestedModel: input.model,
      usedModel: input.model,
      responseId: input.usage?.responseId ?? null,
      inputTokens: input.usage?.inputTokens ?? null,
      cachedInputTokens: input.usage?.cachedInputTokens ?? null,
      outputTokens: input.usage?.outputTokens ?? null,
      reasoningTokens: input.usage?.reasoningTokens ?? null,
      totalTokens: input.usage?.totalTokens ?? null,
      estimatedCostUsd: llmCost,
      completeness: llmCompleteness,
    })
  );

  const calls = input.webSearchCallCount ?? 0;
  if (calls > 0) {
    const toolCost = estimateWebSearchToolCostUsd(input.model, calls);
    const toolRates = getWebSearchToolRates(input.model);
    results.push(
      await recordOpenAiUsageEvent({
        workspaceId: input.workspaceId,
        operationType: "web_search",
        idempotencyKey: `${input.idempotencyKey}:web_search`,
        endpoint: "responses",
        status: input.status,
        operationKey: input.operationKey ?? null,
        generationId: input.generationId ?? null,
        requestedModel: input.model,
        usedModel: input.model,
        responseId: input.usage?.responseId ?? null,
        toolCallCount: calls,
        estimatedCostUsd: toolCost,
        completeness:
          !toolRates
            ? "unknown"
            : typeof toolCost === "number"
              ? toolCost === 0
                ? "zero"
                : "partial"
              : "unknown",
        meta: {
          parentOperation: input.operationType,
        },
      })
    );
  }

  return results;
}

export function decimalToNumber(
  value: Prisma.Decimal | number | null | undefined
): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const n = value.toNumber();
  return Number.isFinite(n) ? n : null;
}
