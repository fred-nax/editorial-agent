import { Prisma } from "@prisma/client";
import { db } from "../db";
import { logError, logInfo } from "../logger";
import { analyzeVisibilityResponse } from "./analyze";
import { ANALYSIS_VERSION, type ExtractedEntity, type MentionKind } from "./constants";
import {
  createMentionsForResponse,
  linkParentEntities,
} from "./entity-store";
import { toBrandIdentity } from "./campaigns";
import { extractEntityCandidates } from "./extract";
import {
  hasVerifiableIdentitySignals,
  isDistinctiveOrganizationName,
  isGenericDescriptor,
  isLexicalNoiseName,
  looksLikeHostname,
} from "./generic-filter";
import { buildEditorialHints, computeCampaignMetrics } from "./metrics";
import { entityNormalizedKey } from "./resolve";
import { normalizeCitations } from "./sources";
import { validateExtractedEntities } from "./validate-entities";

export type ReanalyzeMode = "reclassify" | "reextract";

export type ReanalyzeOptions = {
  /** reclassify (défaut) : conserve/vérifie historiques + reclassifie. reextract : réextraction locale ou LLM. */
  mode?: ReanalyzeMode;
  allowLlmExtraction?: boolean;
  confirmLlmCost?: boolean;
};

export type ReanalyzeReport = {
  analysisVersion: string;
  mode: ReanalyzeMode;
  usedLlm: boolean;
  historicalExamined: number;
  preserved: string[];
  newlyDetected: string[];
  rejected: Array<{ name: string; reason: string }>;
  ambiguous: string[];
  merged: string[];
  manualPreserved: string[];
  metricsBefore: unknown;
  metricsAfter: ReturnType<typeof computeCampaignMetrics>;
  unverifiableHistorical: string[];
  note: string;
};

export type ReanalyzeResult = {
  campaignId: string;
  analysisVersion: string;
  responsesProcessed: number;
  mentionsRecreated: number;
  usedLlm: boolean;
  mode: ReanalyzeMode;
  report: ReanalyzeReport;
  metrics: ReturnType<typeof computeCampaignMetrics>;
};

type HistoricalCandidate = {
  name: string;
  domain?: string | null;
  rawName?: string | null;
  mentionKind?: MentionKind;
  excerpt?: string | null;
  categoryManual?: boolean;
  lockedCategory?: ExtractedEntity["category"] | null;
  source: "mention" | "entity" | "snapshot";
};

/**
 * Une ligne en base / snapshot ne suffit pas : il faut une preuve d’identité.
 * Les faux positifs des réanalyses 1.1 / 1.1.1 ne sont pas réinjectés.
 */
function isEligibleHistoricalCandidate(item: HistoricalCandidate): {
  ok: boolean;
  reason?: string;
} {
  if (item.categoryManual) {
    return { ok: true };
  }
  if (looksLikeHostname(item.name) || looksLikeHostname(item.rawName || "")) {
    return {
      ok: false,
      reason: "Hostname / FQDN — exclu (pas un nom d’entreprise).",
    };
  }
  if (isGenericDescriptor(item.name) || isLexicalNoiseName(item.name)) {
    return {
      ok: false,
      reason: "Historique bruit lexical / générique — exclu de la réinjection.",
    };
  }
  if (isDistinctiveOrganizationName(item.name)) {
    return { ok: true };
  }
  if (
    hasVerifiableIdentitySignals({
      name: item.name,
      domain: item.domain,
      excerpt: item.excerpt,
    })
  ) {
    return { ok: true };
  }
  if (item.source === "entity") {
    return {
      ok: false,
      reason:
        "Entité en base sans domaine ni forme organisationnelle distinctive — non réinjectée.",
    };
  }
  return {
    ok: false,
    reason: "Historique non distinctif — exclu de la réinjection automatique.",
  };
}

function collectFromSnapshot(snapshot: unknown): HistoricalCandidate[] {
  if (!snapshot || typeof snapshot !== "object") {
    return [];
  }
  const record = snapshot as Record<string, unknown>;
  const lists = [record.entities, record.competitors];
  const out: HistoricalCandidate[] = [];
  for (const list of lists) {
    if (!Array.isArray(list)) {
      continue;
    }
    for (const item of list) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const row = item as Record<string, unknown>;
      const name =
        typeof row.canonicalName === "string"
          ? row.canonicalName
          : typeof row.name === "string"
            ? row.name
            : "";
      if (!name) {
        continue;
      }
      out.push({
        name,
        domain: typeof row.domain === "string" ? row.domain : null,
        source: "snapshot",
      });
    }
  }
  return out;
}

/**
 * Réanalyse GEO 1.1.2 — extraction stricte + historiques éligibles uniquement.
 * - Ne relance PAS la recherche web.
 * - Préserve responseText, rawPayload, citations et bilans d’audit.
 * - Idempotente (delete mentions + recreate unique).
 */
export async function reanalyzeVisibilityCampaign(
  campaignId: string,
  options: ReanalyzeOptions = {}
): Promise<ReanalyzeResult> {
  const mode: ReanalyzeMode = options.mode === "reextract" ? "reextract" : "reclassify";
  const allowLlm =
    options.allowLlmExtraction === true && options.confirmLlmCost === true;

  if (options.allowLlmExtraction && !options.confirmLlmCost) {
    throw new Error(
      "Extraction LLM demandée : confirmez le coût (confirmLlmCost=true). La réanalyse locale reste disponible sans LLM."
    );
  }

  const campaign = await db.visibilityCampaign.findUnique({
    where: { id: campaignId },
    include: {
      brand: true,
      questions: { orderBy: { sortOrder: "asc" } },
      responses: {
        orderBy: [{ questionId: "asc" }, { repetitionIndex: "asc" }],
        include: {
          mentions: { include: { entity: true } },
        },
      },
    },
  });

  if (!campaign) {
    throw new Error("Campagne introuvable.");
  }
  if (campaign.status === "running") {
    throw new Error("Campagne en cours — réanalyse impossible.");
  }
  if (campaign.responses.length === 0) {
    throw new Error("Aucune réponse stockée à réanalyser.");
  }

  const brandIdentity = toBrandIdentity({
    ...campaign.brand,
    description: campaign.brand.description,
    sector: campaign.brand.sector,
    products: campaign.brand.products,
  });

  const previousSnapshot = campaign.metricsSnapshot ?? null;
  const metricsBefore = previousSnapshot;

  // --- Collecte des candidats historiques AVANT suppression des mentions ---
  const historicalByKey = new Map<string, HistoricalCandidate>();
  const prefilterRejected: Array<{ name: string; reason: string }> = [];
  const addHistorical = (item: HistoricalCandidate) => {
    const key = entityNormalizedKey(item.name);
    if (!key) {
      return;
    }
    const eligibility = isEligibleHistoricalCandidate(item);
    if (!eligibility.ok) {
      prefilterRejected.push({
        name: item.name,
        reason: eligibility.reason || "Historique non éligible.",
      });
      return;
    }
    const existing = historicalByKey.get(key);
    if (!existing) {
      historicalByKey.set(key, item);
      return;
    }
    if (item.categoryManual && !existing.categoryManual) {
      historicalByKey.set(key, item);
    } else if (!existing.domain && item.domain) {
      historicalByKey.set(key, { ...existing, domain: item.domain });
    } else if (!existing.excerpt && item.excerpt) {
      historicalByKey.set(key, { ...existing, excerpt: item.excerpt });
    }
  };

  for (const response of campaign.responses) {
    for (const mention of response.mentions) {
      addHistorical({
        name: mention.entity.canonicalName || mention.entity.name,
        rawName: mention.rawName || mention.entity.name,
        domain: mention.entity.domain,
        mentionKind: mention.kind as MentionKind,
        excerpt: mention.excerpt,
        categoryManual: mention.entity.categoryManual,
        lockedCategory: mention.entity.categoryManual
          ? (mention.entity.category as ExtractedEntity["category"])
          : null,
        source: "mention",
      });
    }
  }

  for (const item of collectFromSnapshot(campaign.metricsSnapshot)) {
    addHistorical(item);
  }
  for (const item of collectFromSnapshot(campaign.previousMetricsSnapshot)) {
    addHistorical(item);
  }

  // Entités brand : manuelles prioritaires ; le reste doit déjà être distinctif
  // (évite de réinjecter toute la pollution 1.1.x stockée en base)
  const brandEntities = await db.visibilityEntity.findMany({
    where: {
      brandId: campaign.brandId,
      OR: [
        { categoryManual: true },
        { domain: { not: null } },
      ],
    },
  });
  for (const entity of brandEntities) {
    addHistorical({
      name: entity.canonicalName || entity.name,
      rawName: entity.name,
      domain: entity.domain,
      categoryManual: entity.categoryManual,
      lockedCategory: entity.categoryManual
        ? (entity.category as ExtractedEntity["category"])
        : null,
      source: "entity",
    });
  }

  const historicalList = [...historicalByKey.values()];
  const historicalExamined =
    historicalList.length + prefilterRejected.length;

  // Snapshot observations pour traçabilité
  const observationSnapshot = campaign.responses.flatMap((response) =>
    response.mentions.map((mention) => ({
      responseId: response.id,
      name: mention.entity.canonicalName || mention.entity.name,
      rawName: mention.rawName,
      kind: mention.kind,
      excerpt: mention.excerpt,
    }))
  );

  await db.visibilityMention.deleteMany({
    where: { response: { campaignId } },
  });

  const rejected: Array<{ name: string; reason: string }> = [
    ...prefilterRejected,
  ];
  const preserved = new Set<string>();
  const newlyDetected = new Set<string>();
  const ambiguous = new Set<string>();
  const manualPreserved = new Set<string>();
  const unverifiableHistorical = new Set<string>();
  const merged = new Set<string>();

  let mentionsRecreated = 0;
  let responsesProcessed = 0;

  try {
    for (const response of campaign.responses) {
      if (response.status !== "completed" || !response.responseText) {
        continue;
      }

      const citations = normalizeCitations(response.citations);
      const historicalNames = historicalList.map((item) => ({
        name: item.name,
        domain: item.domain,
        rawName: item.rawName,
        mentionKind: item.mentionKind,
        excerpt: item.excerpt,
        categoryManual: item.categoryManual,
        lockedCategory: item.lockedCategory,
        source: item.source,
      }));

      let entities: ExtractedEntity[];

      if (mode === "reclassify" && !allowLlm) {
        // Reclassification : extraction locale + validation GEO 1.1.4 (mêmes règles que l’analyse initiale)
        const extracted = extractEntityCandidates({
          text: response.responseText,
          brand: brandIdentity,
          citations,
          campaignSubject: campaign.subject,
          historicalNames,
        });
        entities = validateExtractedEntities({
          entities: extracted.entities,
          brand: brandIdentity,
          responseText: response.responseText,
          citations,
          campaignSubject: campaign.subject,
        });
        for (const item of extracted.rejected) {
          rejected.push(item);
          if (/non vérifiable/i.test(item.reason)) {
            unverifiableHistorical.add(item.name);
          }
        }
      } else {
        entities = await analyzeVisibilityResponse({
          text: response.responseText,
          citations,
          brand: brandIdentity,
          campaignSubject: campaign.subject,
          useModel: allowLlm,
          historicalNames,
        });
      }

      // Verrous manuels
      const locked = await db.visibilityEntity.findMany({
        where: { brandId: campaign.brandId, categoryManual: true },
      });
      const lockedByKey = new Map(
        locked
          .filter((item) => item.normalizedKey)
          .map((item) => [item.normalizedKey!, item])
      );

      const adjusted: ExtractedEntity[] = [];
      for (const entity of entities) {
        if (
          (isGenericDescriptor(entity.name) || isLexicalNoiseName(entity.name)) &&
          entity.category !== "target_brand"
        ) {
          rejected.push({
            name: entity.name,
            reason: "Filtré comme expression générique / bruit après extraction.",
          });
          continue;
        }
        const key = entityNormalizedKey(entity.name);
        const manual = lockedByKey.get(key);
        if (manual) {
          manualPreserved.add(manual.canonicalName || manual.name);
          adjusted.push({
            ...entity,
            category: manual.category as ExtractedEntity["category"],
            categoryConfidence: 1,
            categoryJustification: "Classification manuelle verrouillée.",
            kind: manual.kind as ExtractedEntity["kind"],
          });
          continue;
        }
        if (entity.category === "unknown") {
          ambiguous.add(entity.name);
        }
        adjusted.push(entity);
      }

      const histKeys = new Set(
        historicalList.map((item) => entityNormalizedKey(item.name))
      );
      for (const entity of adjusted) {
        const key = entityNormalizedKey(entity.name);
        if (histKeys.has(key)) {
          preserved.add(entity.name);
        } else {
          newlyDetected.add(entity.name);
        }
      }

      const count = await createMentionsForResponse({
        responseId: response.id,
        brandId: campaign.brandId,
        entities: adjusted,
        analysisVersion: ANALYSIS_VERSION,
      });
      mentionsRecreated += count;
      responsesProcessed += 1;
    }

    await linkParentEntities(campaign.brandId);

    // Détection fusions (même normalizedKey, plusieurs raw names dans snapshot)
    const rawByKey = new Map<string, Set<string>>();
    for (const obs of observationSnapshot) {
      const key = entityNormalizedKey(obs.name);
      if (!key) {
        continue;
      }
      const set = rawByKey.get(key) ?? new Set();
      set.add(obs.rawName || obs.name);
      rawByKey.set(key, set);
    }
    for (const [key, names] of rawByKey) {
      if (names.size > 1) {
        merged.add(`${key}: ${[...names].join(" / ")}`);
      }
    }

    const refreshed = await db.visibilityResponse.findMany({
      where: { campaignId },
      include: { mentions: { include: { entity: true } } },
    });

    const metricsInput = refreshed.map((response) => ({
      status: response.status as "completed" | "failed" | "pending",
      responseText: response.responseText,
      citations: normalizeCitations(response.citations),
      entities: response.mentions.map((mention) => ({
        name: mention.entity.canonicalName || mention.entity.name,
        rawName: mention.rawName,
        domain: mention.entity.domain,
        kind: mention.entity.kind as ExtractedEntity["kind"],
        category: mention.entity.category as ExtractedEntity["category"],
        categoryConfidence: mention.entity.categoryConfidence,
        categoryJustification: mention.entity.categoryJustification,
        mentionKind: mention.kind as ExtractedEntity["mentionKind"],
        appearanceOrder: mention.appearanceOrder,
        excerpt: mention.excerpt,
        confidence: mention.confidence,
      })),
    }));

    const metrics = computeCampaignMetrics({
      analysisVersion: ANALYSIS_VERSION,
      brand: brandIdentity,
      responses: metricsInput,
    });

    const editorialHints = buildEditorialHints({
      brandName: campaign.brand.name,
      subject: campaign.subject,
      metrics,
      questions: campaign.questions.map((item) => item.text),
    });

    const report: ReanalyzeReport = {
      analysisVersion: ANALYSIS_VERSION,
      mode,
      usedLlm: allowLlm,
      historicalExamined,
      preserved: [...preserved].sort(),
      newlyDetected: [...newlyDetected].sort(),
      rejected: dedupeRejected(rejected),
      ambiguous: [...ambiguous].sort(),
      merged: [...merged].sort(),
      manualPreserved: [...manualPreserved].sort(),
      metricsBefore,
      metricsAfter: metrics,
      unverifiableHistorical: [...unverifiableHistorical].sort(),
      note:
        historicalList.length === 0
          ? "Aucun historique éligible — extraction locale stricte sur les réponses stockées uniquement. Pas de recherche web."
          : `Historiques examinés : ${historicalExamined} (éligibles : ${historicalList.length}). GEO ${ANALYSIS_VERSION}. Pas de recherche web.`,
    };

    await db.visibilityCampaign.update({
      where: { id: campaignId },
      data: {
        analysisVersion: ANALYSIS_VERSION,
        previousMetricsSnapshot: (previousSnapshot ??
          Prisma.JsonNull) as Prisma.InputJsonValue,
        mentionRate: metrics.mentionRate,
        recommendationRate: metrics.recommendationRate,
        domainCitationRate: metrics.domainCitationRate,
        metricsSnapshot: metrics as unknown as Prisma.InputJsonValue,
        editorialHints: editorialHints as unknown as Prisma.InputJsonValue,
        reanalyzeReport: report as unknown as Prisma.InputJsonValue,
        validResponses: metrics.validResponses,
        failedResponses: metrics.failedResponses,
      },
    });

    logInfo("ai-visibility", "reanalyze finished", {
      campaignId,
      mode,
      responsesProcessed,
      mentionsRecreated,
      usedLlm: allowLlm,
      preserved: preserved.size,
      rejected: rejected.length,
    });

    return {
      campaignId,
      analysisVersion: ANALYSIS_VERSION,
      responsesProcessed,
      mentionsRecreated,
      usedLlm: allowLlm,
      mode,
      report,
      metrics,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 500) : "Erreur réanalyse.";
    logError("ai-visibility", "reanalyze failed", { campaignId, message });
    throw error;
  }
}

function dedupeRejected(
  items: Array<{ name: string; reason: string }>
): Array<{ name: string; reason: string }> {
  const map = new Map<string, { name: string; reason: string }>();
  for (const item of items) {
    const key = `${entityNormalizedKey(item.name)}|${item.reason}`;
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
