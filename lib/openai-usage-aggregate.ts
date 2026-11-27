/**
 * Agrégations et lecture unifiée des consommations OpenAI (V7.15.0).
 *
 * Stratégie historique (pas de double comptage) :
 * - Les nouveaux événements vivent dans OpenAiUsageEvent.
 * - Les coûts LLM historiques restent sur ArticleGeneration.estimatedCost.
 * - Pour un article : si des events `article_generation` existent → on les utilise ;
 *   sinon on expose le Float historique comme composant legacy (couverture partielle).
 * - Les totaux workspace somment les events + les estimatedCost des générations
 *   sans event LLM correspondant (même période / filtres).
 */

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { workspaceWhere } from "@/lib/workspace";
import { decimalToNumber } from "@/lib/openai-usage-tracker";
import {
  OPENAI_USAGE_OPERATION_TYPES,
  type OpenAiUsageCompleteness,
  type OpenAiUsageOperationType,
} from "@/lib/openai-usage-types";
import { formatEstimatedCost } from "@/lib/format";

import {
  resolveUsagePeriod,
  type UsagePeriodPreset,
} from "./openai-usage-period";

export type { UsagePeriodPreset };
export { resolveUsagePeriod };

export type UsageQueryFilters = {
  workspaceId: string;
  from: Date;
  to: Date;
  operationType?: OpenAiUsageOperationType | "all";
  model?: string | "all";
  status?: string | "all";
  completeness?: OpenAiUsageCompleteness | "all";
  page?: number;
  pageSize?: number;
};

export type UsageSummary = {
  knownEstimatedCostUsd: number;
  knownEstimatedCostLabel: string;
  operationCount: number;
  unknownOrPartialCount: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  imageGenerationCount: number;
  averageCostPerArticleUsd: number | null;
  averageCostPerArticleLabel: string;
  byOperation: Array<{
    operationType: string;
    count: number;
    knownCostUsd: number;
    unknownOrPartial: number;
  }>;
  byModel: Array<{
    model: string;
    count: number;
    knownCostUsd: number;
  }>;
  seriesDaily: Array<{
    date: string;
    knownCostUsd: number;
    operations: number;
  }>;
  legacyLlmIncluded: boolean;
  legacyLlmCount: number;
  legacyLlmCostUsd: number;
  /** Événements réellement persistés dans OpenAiUsageEvent (hors legacy). */
  registryEventCount: number;
  registryKnownCostUsd: number;
  coverageNote: string;
};

export type UsageHistoryRow = {
  id: string;
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
  estimatedCostLabel: string;
  completeness: string;
  pricingVersion: string;
  costSource: string;
  status: string;
  isLegacy: boolean;
};

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function eventWhere(filters: UsageQueryFilters): Prisma.OpenAiUsageEventWhereInput {
  const where: Prisma.OpenAiUsageEventWhereInput = {
    ...workspaceWhere(filters.workspaceId),
    consumedAt: { gte: filters.from, lte: filters.to },
  };
  if (filters.operationType && filters.operationType !== "all") {
    where.operationType = filters.operationType;
  }
  if (filters.model && filters.model !== "all") {
    where.OR = [
      { usedModel: filters.model },
      { requestedModel: filters.model },
    ];
  }
  if (filters.status && filters.status !== "all") {
    where.status = filters.status;
  }
  if (filters.completeness && filters.completeness !== "all") {
    where.completeness = filters.completeness;
  }
  return where;
}

async function loadLegacyLlmRows(filters: UsageQueryFilters): Promise<
  Array<{
    id: string;
    createdAt: Date;
    estimatedCost: number | null;
    model: string | null;
    inputTokens: number | null;
    cachedInputTokens: number | null;
    outputTokens: number | null;
  }>
> {
  // Legacy uniquement si le filtre opération est compatible.
  if (
    filters.operationType &&
    filters.operationType !== "all" &&
    filters.operationType !== "article_generation"
  ) {
    return [];
  }
  if (
    filters.completeness &&
    filters.completeness !== "all" &&
    filters.completeness !== "partial" &&
    filters.completeness !== "unknown" &&
    filters.completeness !== "zero" &&
    filters.completeness !== "complete"
  ) {
    return [];
  }

  // Exclusion set : générations déjà couvertes par un event LLM (anti double comptage).
  const covered = await db.openAiUsageEvent.findMany({
    where: {
      ...workspaceWhere(filters.workspaceId),
      operationType: "article_generation",
      generationId: { not: null },
    },
    select: { generationId: true },
    distinct: ["generationId"],
  });
  const coveredIds = covered
    .map((row) => row.generationId)
    .filter((id): id is string => Boolean(id));

  const gens = await db.articleGeneration.findMany({
    where: {
      ...workspaceWhere(filters.workspaceId),
      createdAt: { gte: filters.from, lte: filters.to },
      ...(filters.model && filters.model !== "all"
        ? { model: filters.model }
        : {}),
      ...(coveredIds.length > 0 ? { id: { notIn: coveredIds } } : {}),
    },
    select: {
      id: true,
      createdAt: true,
      estimatedCost: true,
      model: true,
      inputTokens: true,
      cachedInputTokens: true,
      outputTokens: true,
    },
  });

  return gens
    .filter((g) => {
      // Pas de ligne legacy sans signal de coût/tokens (évite le bruit).
      if (
        g.estimatedCost === null &&
        g.inputTokens === null &&
        g.outputTokens === null
      ) {
        return false;
      }
      if (filters.completeness && filters.completeness !== "all") {
        if (filters.completeness === "zero") {
          return g.estimatedCost === 0;
        }
        if (filters.completeness === "unknown") {
          return g.estimatedCost === null;
        }
        if (filters.completeness === "partial" || filters.completeness === "complete") {
          return g.estimatedCost !== null && g.estimatedCost !== 0;
        }
      }
      return true;
    })
    .map((g) => ({
      id: g.id,
      createdAt: g.createdAt,
      estimatedCost: g.estimatedCost,
      model: g.model,
      inputTokens: g.inputTokens,
      cachedInputTokens: g.cachedInputTokens,
      outputTokens: g.outputTokens,
    }));
}

/**
 * Totaux connus pour le dashboard (sans byModel / séries journalières).
 * Évite de matérialiser tous les événements en JS.
 */
export async function getUsageDashboardTotals(
  filters: UsageQueryFilters
): Promise<{
  knownEstimatedCostUsd: number;
  knownEstimatedCostLabel: string;
  legacyLlmCount: number;
  legacyLlmCostUsd: number;
  registryEventCount: number;
  registryKnownCostUsd: number;
}> {
  const where = eventWhere(filters);
  const [agg, legacy] = await Promise.all([
    db.openAiUsageEvent.aggregate({
      where,
      _sum: { estimatedCostUsd: true },
      _count: true,
    }),
    loadLegacyLlmRows(filters),
  ]);

  const registrySum = decimalToNumber(agg._sum.estimatedCostUsd);
  const registryKnownCostUsd = typeof registrySum === "number" ? registrySum : 0;

  let legacyLlmCostUsd = 0;
  for (const row of legacy) {
    if (typeof row.estimatedCost === "number") {
      legacyLlmCostUsd += row.estimatedCost;
    }
  }

  const knownEstimatedCostUsd = registryKnownCostUsd + legacyLlmCostUsd;
  return {
    knownEstimatedCostUsd,
    knownEstimatedCostLabel: formatEstimatedCost(knownEstimatedCostUsd),
    legacyLlmCount: legacy.length,
    legacyLlmCostUsd,
    registryEventCount: agg._count,
    registryKnownCostUsd,
  };
}

export async function getUsageSummary(
  filters: UsageQueryFilters
): Promise<UsageSummary> {
  const where = eventWhere(filters);
  const [events, legacy] = await Promise.all([
    db.openAiUsageEvent.findMany({
      where,
      select: {
        operationType: true,
        usedModel: true,
        requestedModel: true,
        estimatedCostUsd: true,
        completeness: true,
        inputTokens: true,
        outputTokens: true,
        cachedInputTokens: true,
        consumedAt: true,
        generationId: true,
      },
    }),
    loadLegacyLlmRows(filters),
  ]);

  let knownEstimatedCostUsd = 0;
  let unknownOrPartialCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;
  let imageGenerationCount = 0;

  const byOperationMap = new Map<
    string,
    { count: number; knownCostUsd: number; unknownOrPartial: number }
  >();
  const byModelMap = new Map<string, { count: number; knownCostUsd: number }>();
  const dailyMap = new Map<string, { knownCostUsd: number; operations: number }>();

  const bumpOp = (
    type: string,
    cost: number | null,
    incomplete: boolean
  ) => {
    const row = byOperationMap.get(type) ?? {
      count: 0,
      knownCostUsd: 0,
      unknownOrPartial: 0,
    };
    row.count += 1;
    if (typeof cost === "number") {
      row.knownCostUsd += cost;
    }
    if (incomplete) {
      row.unknownOrPartial += 1;
    }
    byOperationMap.set(type, row);
  };

  const bumpModel = (model: string | null, cost: number | null) => {
    const key = model?.trim() || "(inconnu)";
    const row = byModelMap.get(key) ?? { count: 0, knownCostUsd: 0 };
    row.count += 1;
    if (typeof cost === "number") {
      row.knownCostUsd += cost;
    }
    byModelMap.set(key, row);
  };

  const bumpDay = (at: Date, cost: number | null) => {
    const key = startOfDayUtc(at).toISOString().slice(0, 10);
    const row = dailyMap.get(key) ?? { knownCostUsd: 0, operations: 0 };
    row.operations += 1;
    if (typeof cost === "number") {
      row.knownCostUsd += cost;
    }
    dailyMap.set(key, row);
  };

  for (const event of events) {
    const cost = decimalToNumber(event.estimatedCostUsd);
    const incomplete =
      event.completeness === "partial" ||
      event.completeness === "unknown" ||
      cost === null;
    if (typeof cost === "number") {
      knownEstimatedCostUsd += cost;
    }
    if (incomplete) {
      unknownOrPartialCount += 1;
    }
    if (typeof event.inputTokens === "number") {
      inputTokens += event.inputTokens;
    }
    if (typeof event.outputTokens === "number") {
      outputTokens += event.outputTokens;
    }
    if (typeof event.cachedInputTokens === "number") {
      cachedInputTokens += event.cachedInputTokens;
    }
    if (event.operationType === "image_generation") {
      imageGenerationCount += 1;
    }
    bumpOp(event.operationType, cost, incomplete);
    bumpModel(event.usedModel ?? event.requestedModel, cost);
    bumpDay(event.consumedAt, cost);
  }

  let legacyLlmCostUsd = 0;
  for (const row of legacy) {
    const cost = row.estimatedCost;
    const incomplete = true; // legacy = toujours couverture partielle (hors tools/images)
    if (typeof cost === "number") {
      knownEstimatedCostUsd += cost;
      legacyLlmCostUsd += cost;
    } else {
      unknownOrPartialCount += 1;
    }
    if (typeof cost === "number" && filters.completeness === "unknown") {
      // déjà filtré
    }
    if (typeof row.inputTokens === "number") {
      inputTokens += row.inputTokens;
    }
    if (typeof row.outputTokens === "number") {
      outputTokens += row.outputTokens;
    }
    if (typeof row.cachedInputTokens === "number") {
      cachedInputTokens += row.cachedInputTokens;
    }
    bumpOp("article_generation", cost, incomplete || cost === null);
    bumpModel(row.model, cost);
    bumpDay(row.createdAt, cost);
  }

  const articleKeys = new Set<string>();
  for (const event of events) {
    if (
      event.operationType === "article_generation" &&
      event.generationId
    ) {
      articleKeys.add(event.generationId);
    }
  }
  for (const row of legacy) {
    articleKeys.add(row.id);
  }

  const averageCostPerArticleUsd =
    articleKeys.size > 0
      ? (() => {
          let sum = 0;
          let n = 0;
          for (const event of events) {
            if (
              event.operationType === "article_generation" &&
              event.generationId
            ) {
              const c = decimalToNumber(event.estimatedCostUsd);
              if (typeof c === "number") {
                sum += c;
                n += 1;
              }
            }
          }
          for (const row of legacy) {
            if (typeof row.estimatedCost === "number") {
              sum += row.estimatedCost;
              n += 1;
            }
          }
          return n > 0 ? sum / articleKeys.size : null;
        })()
      : null;

  let registryKnownCostUsd = 0;
  for (const event of events) {
    const cost = decimalToNumber(event.estimatedCostUsd);
    if (typeof cost === "number") {
      registryKnownCostUsd += cost;
    }
  }

  return {
    knownEstimatedCostUsd,
    knownEstimatedCostLabel: formatEstimatedCost(knownEstimatedCostUsd),
    operationCount: events.length + legacy.length,
    unknownOrPartialCount,
    inputTokens,
    outputTokens,
    cachedInputTokens,
    imageGenerationCount,
    averageCostPerArticleUsd,
    averageCostPerArticleLabel: formatEstimatedCost(averageCostPerArticleUsd),
    byOperation: [...byOperationMap.entries()]
      .map(([operationType, v]) => ({ operationType, ...v }))
      .sort((a, b) => b.knownCostUsd - a.knownCostUsd),
    byModel: [...byModelMap.entries()]
      .map(([model, v]) => ({ model, ...v }))
      .sort((a, b) => b.knownCostUsd - a.knownCostUsd),
    seriesDaily: [...dailyMap.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    legacyLlmIncluded: legacy.length > 0,
    legacyLlmCount: legacy.length,
    legacyLlmCostUsd,
    registryEventCount: events.length,
    registryKnownCostUsd,
    coverageNote:
      "Total estimé connu = registre OpenAiUsageEvent + éventuels coûts LLM historiques. Les lignes legacy ne sont pas de nouveaux événements registre. Jamais un montant facturé OpenAI.",
  };
}

/** Plafond export / pages larges — PERF-003. */
export const USAGE_HISTORY_MAX_PAGE_SIZE = 5000;

export async function listUsageHistory(
  filters: UsageQueryFilters
): Promise<{ rows: UsageHistoryRow[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(
    USAGE_HISTORY_MAX_PAGE_SIZE,
    Math.max(1, filters.pageSize ?? 25)
  );
  const where = eventWhere(filters);

  // Index léger (id + date) + legacy, puis hydrate uniquement la page.
  const [eventIndex, legacy, eventCount] = await Promise.all([
    db.openAiUsageEvent.findMany({
      where,
      orderBy: { consumedAt: "desc" },
      select: { id: true, consumedAt: true },
    }),
    loadLegacyLlmRows(filters),
    db.openAiUsageEvent.count({ where }),
  ]);

  type IndexEntry =
    | { kind: "event"; id: string; at: number }
    | { kind: "legacy"; id: string; at: number };

  const index: IndexEntry[] = [
    ...eventIndex.map((row) => ({
      kind: "event" as const,
      id: row.id,
      at: row.consumedAt.getTime(),
    })),
    ...legacy.map((row) => ({
      kind: "legacy" as const,
      id: row.id,
      at: row.createdAt.getTime(),
    })),
  ].sort((a, b) => b.at - a.at);

  const total = eventCount + legacy.length;
  const start = (page - 1) * pageSize;
  const pageIndex = index.slice(start, start + pageSize);
  const eventIds = pageIndex
    .filter((row) => row.kind === "event")
    .map((row) => row.id);
  const legacyIds = new Set(
    pageIndex.filter((row) => row.kind === "legacy").map((row) => row.id)
  );

  const events =
    eventIds.length === 0
      ? []
      : await db.openAiUsageEvent.findMany({
          where: { id: { in: eventIds }, ...workspaceWhere(filters.workspaceId) },
          select: {
            id: true,
            consumedAt: true,
            workspaceId: true,
            operationType: true,
            usedModel: true,
            requestedModel: true,
            operationKey: true,
            generationId: true,
            inputTokens: true,
            cachedInputTokens: true,
            outputTokens: true,
            toolCallCount: true,
            estimatedCostUsd: true,
            completeness: true,
            pricingVersion: true,
            costSource: true,
            status: true,
          },
        });

  const eventById = new Map(events.map((event) => [event.id, event]));
  const legacyById = new Map(legacy.map((row) => [row.id, row]));

  const rows: UsageHistoryRow[] = [];
  for (const entry of pageIndex) {
    if (entry.kind === "event") {
      const event = eventById.get(entry.id);
      if (!event) continue;
      const cost = decimalToNumber(event.estimatedCostUsd);
      rows.push({
        id: event.id,
        consumedAt: event.consumedAt.toISOString(),
        workspaceId: event.workspaceId,
        operationType: event.operationType,
        model: event.usedModel ?? event.requestedModel,
        operationKey: event.operationKey,
        generationId: event.generationId,
        inputTokens: event.inputTokens,
        cachedInputTokens: event.cachedInputTokens,
        outputTokens: event.outputTokens,
        toolCallCount: event.toolCallCount,
        estimatedCostUsd: cost,
        estimatedCostLabel: formatEstimatedCost(cost),
        completeness: event.completeness,
        pricingVersion: event.pricingVersion,
        costSource: event.costSource,
        status: event.status,
        isLegacy: false,
      });
      continue;
    }
    if (!legacyIds.has(entry.id)) continue;
    const row = legacyById.get(entry.id);
    if (!row) continue;
    const cost = row.estimatedCost;
    rows.push({
      id: `legacy:${row.id}`,
      consumedAt: row.createdAt.toISOString(),
      workspaceId: filters.workspaceId,
      operationType: "article_generation",
      model: row.model,
      operationKey: row.id,
      generationId: row.id,
      inputTokens: row.inputTokens,
      cachedInputTokens: row.cachedInputTokens,
      outputTokens: row.outputTokens,
      toolCallCount: null,
      estimatedCostUsd: cost,
      estimatedCostLabel: formatEstimatedCost(cost),
      completeness: cost === null ? "unknown" : cost === 0 ? "zero" : "partial",
      pricingVersion: "legacy-article-generation",
      costSource: "legacy_mirror",
      status: "succeeded",
      isLegacy: true,
    });
  }

  return { rows, total, page, pageSize };
}

export type ArticleCostBreakdown = {
  llmHistorical: number | null;
  llmHistoricalLabel: string;
  llmEvents: number | null;
  webSearch: number | null;
  imageGeneration: number | null;
  imageAlt: number | null;
  otherLinked: number | null;
  knownTotal: number | null;
  knownTotalLabel: string;
  unknownComponents: string[];
  coverage: "complete" | "partial" | "unknown" | "legacy_partial";
  rows: UsageHistoryRow[];
};

export async function getArticleCostBreakdown(input: {
  workspaceId: string;
  generationId: string;
  historicalEstimatedCost: number | null;
}): Promise<ArticleCostBreakdown> {
  const events = await db.openAiUsageEvent.findMany({
    where: {
      ...workspaceWhere(input.workspaceId),
      generationId: input.generationId,
    },
    orderBy: { consumedAt: "asc" },
  });

  const sumType = (type: string): number | null => {
    const matched = events.filter((e) => e.operationType === type);
    if (matched.length === 0) {
      return null;
    }
    let sum = 0;
    let any = false;
    let anyUnknown = false;
    for (const e of matched) {
      const c = decimalToNumber(e.estimatedCostUsd);
      if (typeof c === "number") {
        sum += c;
        any = true;
      } else {
        anyUnknown = true;
      }
    }
    if (!any && anyUnknown) {
      return null;
    }
    return any ? sum : null;
  };

  const llmEvents = sumType("article_generation");
  const webSearch = sumType("web_search");
  const imageGeneration = sumType("image_generation");
  const imageAlt = sumType("image_alt");
  const otherTypes = events.filter(
    (e) =>
      ![
        "article_generation",
        "web_search",
        "image_generation",
        "image_alt",
      ].includes(e.operationType)
  );
  let otherLinked: number | null = null;
  if (otherTypes.length > 0) {
    otherLinked = 0;
    for (const e of otherTypes) {
      const c = decimalToNumber(e.estimatedCostUsd);
      if (typeof c === "number") {
        otherLinked += c;
      }
    }
  }

  const llmHistorical =
    llmEvents === null ? input.historicalEstimatedCost : null;

  const parts = [
    llmEvents,
    llmHistorical,
    webSearch,
    imageGeneration,
    imageAlt,
    otherLinked,
  ];
  const knownParts = parts.filter(
    (p): p is number => typeof p === "number" && Number.isFinite(p)
  );
  const knownTotal = knownParts.length > 0 ? knownParts.reduce((a, b) => a + b, 0) : null;

  const unknownComponents: string[] = [];
  if (llmEvents === null && llmHistorical === null) {
    unknownComponents.push("Rédaction LLM");
  }
  if (events.some((e) => e.operationType === "web_search" && e.estimatedCostUsd === null)) {
    unknownComponents.push("Recherche web");
  } else if (
    llmEvents !== null &&
    webSearch === null &&
    !events.some((e) => e.operationType === "web_search")
  ) {
    // web_search non observé séparément — couverture partielle historique possible
  }
  if (
    events.some(
      (e) => e.operationType === "image_generation" && e.completeness === "unknown"
    )
  ) {
    unknownComponents.push("Images générées");
  }
  if (
    events.some(
      (e) => e.operationType === "image_alt" && e.completeness === "unknown"
    )
  ) {
    unknownComponents.push("Texte ALT");
  }

  let coverage: ArticleCostBreakdown["coverage"] = "partial";
  if (events.length === 0 && llmHistorical !== null) {
    coverage = "legacy_partial";
  } else if (events.length === 0 && llmHistorical === null) {
    coverage = "unknown";
  } else if (
    unknownComponents.length === 0 &&
    events.every(
      (e) => e.completeness === "complete" || e.completeness === "zero"
    )
  ) {
    coverage = "complete";
  }

  const rows: UsageHistoryRow[] = events.map((event) => {
    const cost = decimalToNumber(event.estimatedCostUsd);
    return {
      id: event.id,
      consumedAt: event.consumedAt.toISOString(),
      workspaceId: event.workspaceId,
      operationType: event.operationType,
      model: event.usedModel ?? event.requestedModel,
      operationKey: event.operationKey,
      generationId: event.generationId,
      inputTokens: event.inputTokens,
      cachedInputTokens: event.cachedInputTokens,
      outputTokens: event.outputTokens,
      toolCallCount: event.toolCallCount,
      estimatedCostUsd: cost,
      estimatedCostLabel: formatEstimatedCost(cost),
      completeness: event.completeness,
      pricingVersion: event.pricingVersion,
      costSource: event.costSource,
      status: event.status,
      isLegacy: false,
    };
  });

  if (llmHistorical !== null) {
    rows.unshift({
      id: `legacy:${input.generationId}`,
      consumedAt: new Date(0).toISOString(),
      workspaceId: input.workspaceId,
      operationType: "article_generation",
      model: null,
      operationKey: input.generationId,
      generationId: input.generationId,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      toolCallCount: null,
      estimatedCostUsd: llmHistorical,
      estimatedCostLabel: formatEstimatedCost(llmHistorical),
      completeness: "partial",
      pricingVersion: "legacy-article-generation",
      costSource: "legacy_mirror",
      status: "succeeded",
      isLegacy: true,
    });
  }

  return {
    llmHistorical,
    llmHistoricalLabel: formatEstimatedCost(llmHistorical),
    llmEvents,
    webSearch,
    imageGeneration,
    imageAlt,
    otherLinked,
    knownTotal,
    knownTotalLabel: formatEstimatedCost(knownTotal),
    unknownComponents,
    coverage,
    rows,
  };
}

export { operationTypeLabel } from "./openai-usage-labels";

export function isOpenAiUsageOperationType(
  value: string
): value is OpenAiUsageOperationType {
  return (OPENAI_USAGE_OPERATION_TYPES as readonly string[]).includes(value);
}

export { buildUsageCsv, csvSafeCell } from "./openai-usage-csv";
