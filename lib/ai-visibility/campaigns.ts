import { Prisma } from "@prisma/client";
import { db } from "../db";
import { logError, logInfo } from "../logger";
import { analyzeVisibilityResponse } from "./analyze";
import {
  ANALYSIS_VERSION,
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  assertCampaignLimits,
  type ExtractedEntity,
} from "./constants";
import {
  parseAliasList,
  parseKnownCompetitors,
  type BrandIdentity,
} from "./entities";
import {
  createMentionsForResponse,
  linkParentEntities,
} from "./entity-store";
import { buildEditorialHints, computeCampaignMetrics } from "./metrics";
import { getVisibilityProvider } from "./providers/openai";
import { generateVisibilityQuestions } from "./questions";
import { normalizeCitations } from "./sources";

export function toBrandIdentity(brand: {
  name: string;
  primaryDomain: string;
  aliases: unknown;
  domainAliases: unknown;
  knownCompetitors: unknown;
  description?: string | null;
  sector?: string | null;
  products?: string | null;
}): BrandIdentity {
  return {
    name: brand.name,
    primaryDomain: brand.primaryDomain,
    aliases: parseAliasList(brand.aliases),
    domainAliases: parseAliasList(brand.domainAliases),
    knownCompetitors: parseKnownCompetitors(brand.knownCompetitors),
    description: brand.description ?? null,
    sector: brand.sector ?? null,
    products: brand.products ?? null,
  };
}

export async function generateCampaignQuestions(campaignId: string) {
  const campaign = await db.visibilityCampaign.findUnique({
    where: { id: campaignId },
    include: { brand: true, questions: true },
  });
  if (!campaign) {
    throw new Error("Campagne introuvable.");
  }
  if (campaign.status === "running") {
    throw new Error("Campagne déjà en cours.");
  }

  const generated = await generateVisibilityQuestions({
    subject: campaign.subject,
    brandName: campaign.brand.name,
    sector: campaign.brand.sector,
    country: campaign.country,
    language: campaign.language,
    count: campaign.questionCount,
    instructions: campaign.instructions,
  });

  await db.visibilityQuestion.deleteMany({ where: { campaignId } });
  await db.visibilityQuestion.createMany({
    data: generated.map((item, index) => ({
      campaignId,
      text: item.text,
      intent: item.intent,
      sortOrder: index,
      validated: false,
    })),
  });

  await db.visibilityCampaign.update({
    where: { id: campaignId },
    data: { status: "questions_ready", error: null },
  });

  return db.visibilityQuestion.findMany({
    where: { campaignId },
    orderBy: { sortOrder: "asc" },
  });
}

async function finalizeCampaignMetrics(input: {
  campaignId: string;
  brandId: string;
  brandIdentity: BrandIdentity;
  brandName: string;
  subject: string;
  questions: string[];
  failedResponses: number;
  validResponses: number;
  costSum: number;
  previousMetricsSnapshot?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
}): Promise<void> {
  await linkParentEntities(input.brandId);

  const responses = await db.visibilityResponse.findMany({
    where: { campaignId: input.campaignId },
    include: { mentions: { include: { entity: true } } },
  });

  const metricsInput = responses.map((response) => ({
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
    brand: input.brandIdentity,
    responses: metricsInput,
  });

  const editorialHints = buildEditorialHints({
    brandName: input.brandName,
    subject: input.subject,
    metrics,
    questions: input.questions,
  });

  const finalStatus =
    input.failedResponses === 0
      ? "completed"
      : input.validResponses === 0
        ? "failed"
        : "partial";

  await db.visibilityCampaign.update({
    where: { id: input.campaignId },
    data: {
      status: finalStatus,
      analysisVersion: ANALYSIS_VERSION,
      mentionRate: metrics.mentionRate,
      recommendationRate: metrics.recommendationRate,
      domainCitationRate: metrics.domainCitationRate,
      ...(input.previousMetricsSnapshot !== undefined
        ? {
            previousMetricsSnapshot:
              input.previousMetricsSnapshot === null
                ? Prisma.JsonNull
                : input.previousMetricsSnapshot,
          }
        : {}),
      metricsSnapshot: metrics as unknown as Prisma.InputJsonValue,
      editorialHints: editorialHints as unknown as Prisma.InputJsonValue,
      estimatedCostUsd: input.costSum || null,
      finishedAt: new Date(),
      error:
        finalStatus === "failed"
          ? "Toutes les réponses ont échoué."
          : finalStatus === "partial"
            ? `${input.failedResponses} réponse(s) en échec.`
            : null,
    },
  });
}

export async function processVisibilityCampaign(campaignId: string): Promise<void> {
  const campaign = await db.visibilityCampaign.findUnique({
    where: { id: campaignId },
    include: {
      brand: true,
      questions: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!campaign) {
    throw new Error("Campagne introuvable.");
  }

  if (campaign.status === "running") {
    throw new Error("Campagne déjà en cours d’exécution.");
  }

  if (campaign.questions.length === 0) {
    throw new Error("Aucune question à analyser.");
  }

  const limits = assertCampaignLimits({
    questionCount: campaign.questions.length,
    repetitions: campaign.repetitions,
  });
  if (!limits.ok) {
    throw new Error(limits.error);
  }

  const runningElsewhere = await db.visibilityCampaign.findFirst({
    where: { status: "running", id: { not: campaignId } },
  });
  if (runningElsewhere) {
    throw new Error("Une autre campagne GEO est déjà en cours.");
  }

  await db.visibilityCampaign.update({
    where: { id: campaignId },
    data: {
      status: "running",
      startedAt: new Date(),
      finishedAt: null,
      error: null,
      completedCalls: 0,
      validResponses: 0,
      failedResponses: 0,
      estimatedCalls: limits.calls,
      analysisVersion: ANALYSIS_VERSION,
    },
  });

  // Reset previous responses for relaunch safety
  await db.visibilityMention.deleteMany({
    where: { response: { campaignId } },
  });
  const previousResponseIds = (
    await db.visibilityResponse.findMany({
      where: { campaignId },
      select: { id: true },
    })
  ).map((item) => item.id);
  if (previousResponseIds.length > 0) {
    await db.visibilityCitation.deleteMany({
      where: { responseId: { in: previousResponseIds } },
    });
  }
  await db.visibilityResponse.deleteMany({ where: { campaignId } });

  const provider = getVisibilityProvider(campaign.provider || DEFAULT_PROVIDER);
  const brandIdentity = toBrandIdentity(campaign.brand);
  let completedCalls = 0;
  let validResponses = 0;
  let failedResponses = 0;
  let costSum = 0;

  try {
    for (const question of campaign.questions) {
      for (let rep = 1; rep <= campaign.repetitions; rep += 1) {
        const responseRow = await db.visibilityResponse.create({
          data: {
            campaignId,
            questionId: question.id,
            repetitionIndex: rep,
            provider: campaign.provider,
            model: campaign.model || DEFAULT_MODEL,
            status: "pending",
            promptCountry: campaign.country,
            promptLanguage: campaign.language,
          },
        });

        try {
          const answer = await provider.ask({
            question: question.text,
            country: campaign.country,
            language: campaign.language,
            model: campaign.model || DEFAULT_MODEL,
            instructions: campaign.instructions,
          });

          const citations = normalizeCitations(answer.citations);
          const entities = await analyzeVisibilityResponse({
            text: answer.text,
            citations,
            brand: brandIdentity,
            campaignSubject: campaign.subject,
          });

          const raw = answer.raw as { estimatedCostUsd?: number | null } | undefined;
          const estimatedCostUsd = raw?.estimatedCostUsd ?? null;
          if (typeof estimatedCostUsd === "number") {
            costSum += estimatedCostUsd;
          }

          await db.visibilityResponse.update({
            where: { id: responseRow.id },
            data: {
              status: "completed",
              responseText: answer.text,
              citations: citations as Prisma.InputJsonValue,
              rawPayload: (answer.raw ?? Prisma.JsonNull) as Prisma.InputJsonValue,
              durationMs: answer.durationMs,
              inputTokens: answer.inputTokens ?? null,
              outputTokens: answer.outputTokens ?? null,
              estimatedCostUsd,
              finishedAt: new Date(),
            },
          });

          for (const citation of citations) {
            await db.visibilityCitation.create({
              data: {
                responseId: responseRow.id,
                title: citation.title,
                url: citation.url,
                domain: citation.domain,
              },
            });
          }

          await createMentionsForResponse({
            responseId: responseRow.id,
            brandId: campaign.brandId,
            entities,
            analysisVersion: ANALYSIS_VERSION,
          });

          validResponses += 1;
        } catch (error) {
          failedResponses += 1;
          const message =
            error instanceof Error ? error.message.slice(0, 500) : "Erreur IA.";
          await db.visibilityResponse.update({
            where: { id: responseRow.id },
            data: {
              status: "failed",
              error: message,
              finishedAt: new Date(),
            },
          });
        }

        completedCalls += 1;
        await db.visibilityCampaign.update({
          where: { id: campaignId },
          data: {
            completedCalls,
            validResponses,
            failedResponses,
            estimatedCostUsd: costSum || null,
          },
        });
      }
    }

    await finalizeCampaignMetrics({
      campaignId,
      brandId: campaign.brandId,
      brandIdentity,
      brandName: campaign.brand.name,
      subject: campaign.subject,
      questions: campaign.questions.map((item) => item.text),
      failedResponses,
      validResponses,
      costSum,
    });

    logInfo("ai-visibility", "campaign finished", {
      campaignId,
      validResponses,
      failedResponses,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 500) : "Erreur campagne.";
    await db.visibilityCampaign.update({
      where: { id: campaignId },
      data: {
        status: validResponses > 0 ? "partial" : "failed",
        error: message,
        finishedAt: new Date(),
      },
    });
    logError("ai-visibility", "campaign failed", { campaignId, message });
  }
}

export function enqueueVisibilityCampaign(campaignId: string): void {
  void processVisibilityCampaign(campaignId).catch(async (error) => {
    const message =
      error instanceof Error ? error.message.slice(0, 500) : "Erreur inattendue.";
    await db.visibilityCampaign
      .updateMany({
        where: { id: campaignId, status: "running" },
        data: {
          status: "failed",
          error: message,
          finishedAt: new Date(),
        },
      })
      .catch(() => undefined);
  });
}
