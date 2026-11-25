import { Prisma } from "@prisma/client";
import { db } from "./db";
import {
  hasEditorialContext,
  parseStoredEditorialContext,
  type EditorialContext,
} from "./editorial-context";
import {
  completedTraceUpdate,
  contextSnapshot,
  failedTraceUpdate,
} from "./generation-trace";
import { buildGenerationMessage } from "./topics/build-generation-context";
import {
  AgentSessionError,
  runAgentSession,
  type RunAgentSessionResult,
} from "./agent/run-session";
import { toStoredError } from "./generation-errors";
import { logError, logInfo } from "./logger";
import {
  cancelPendingFeaturedImagesForFailedArticle,
  createPendingFeaturedImageRequest,
  enqueueFeaturedImageAfterArticle,
} from "./images/pipeline";
import type { FeaturedImageRequest } from "./images/request";
import {
  PROGRESS_MESSAGES,
  isProgressAhead,
  preserveProgressStageOnFailure,
  type GenerationStage,
} from "./progress";

export type ArticleRunner = (
  subject: string
) => Promise<RunAgentSessionResult>;

const MAX_SUBJECT_LENGTH = 500;

export function parseSubject(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Le sujet est obligatoire.");
  }

  const subject = value.trim();

  if (!subject) {
    throw new Error("Le sujet est obligatoire.");
  }

  if (subject.length > MAX_SUBJECT_LENGTH) {
    throw new Error(
      `Le sujet ne peut pas dépasser ${MAX_SUBJECT_LENGTH} caractères.`
    );
  }

  return subject;
}

export async function updateGenerationProgress(
  generationId: string,
  stage: GenerationStage,
  message: string
): Promise<void> {
  const current = await db.articleGeneration.findUnique({
    where: { id: generationId },
    select: { progressStage: true, progressMessage: true },
  });

  if (!current) {
    return;
  }

  if (
    current.progressStage === stage &&
    current.progressMessage === message
  ) {
    return;
  }

  if (
    stage !== "failed" &&
    current.progressStage &&
    !isProgressAhead(stage, current.progressStage as GenerationStage)
  ) {
    return;
  }

  await db.articleGeneration.update({
    where: { id: generationId },
    data: {
      progressStage: stage,
      progressMessage: message,
      progressUpdatedAt: new Date(),
    },
  });

  logInfo("generation", "progress", {
    generationId,
    stage,
    message,
  });
}

export async function createQueuedGeneration(input: {
  subject: string;
  /** Espace figé à la création — jamais relu depuis le cookie UI ensuite. */
  workspaceId: string;
  topicId?: string;
  editorialContext?: EditorialContext | null;
  featuredImageRequest?: FeaturedImageRequest | null;
  /** Destination CMS — doit correspondre à workspace.cmsProvider. */
  cmsDestination?: string | null;
}) {
  const editorial =
    input.editorialContext && hasEditorialContext(input.editorialContext)
      ? input.editorialContext
      : null;

  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) {
    throw new Error("workspaceId obligatoire pour créer une génération.");
  }

  const cmsDestination = input.cmsDestination?.trim() || "wordpress";

  if (input.topicId) {
    const topic = await db.topic.findFirst({
      where: { id: input.topicId, workspaceId },
      select: { id: true },
    });
    if (!topic) {
      throw new Error(
        "Sujet introuvable dans cet espace éditorial (relation croisée interdite)."
      );
    }
  }

  const generation = await db.articleGeneration.create({
    data: {
      workspaceId,
      subject: input.subject,
      status: "queued",
      topicId: input.topicId,
      cmsDestination,
      editorialContext: editorial
        ? (editorial as Prisma.InputJsonValue)
        : undefined,
      progressStage: "queued",
      progressMessage: PROGRESS_MESSAGES.queued,
      progressUpdatedAt: new Date(),
    },
  });

  if (input.featuredImageRequest?.enabled) {
    await createPendingFeaturedImageRequest(
      generation.id,
      input.featuredImageRequest,
      workspaceId
    );
  }

  logInfo("generation", "queued", {
    generationId: generation.id,
    workspaceId,
  });
  return generation;
}

async function syncTopicStatus(
  topicId: string | null | undefined,
  workspaceId: string,
  status: "completed" | "pending"
): Promise<void> {
  if (!topicId) {
    return;
  }

  await db.topic.updateMany({
    where: { id: topicId, workspaceId, status: "generating" },
    data: { status },
  });
}

export async function processArticleGeneration(
  id: string,
  options: { run?: ArticleRunner } = {}
): Promise<void> {
  const claimed = await db.articleGeneration.updateMany({
    where: { id, status: "queued" },
    data: { status: "running", error: null },
  });

  if (claimed.count !== 1) {
    logInfo("generation", "skipped", { generationId: id });
    return;
  }

  const generation = await db.articleGeneration.findUnique({ where: { id } });

  if (!generation) {
    return;
  }

  // Contexte figé à la création : workspaceId de l'enregistrement, jamais le cookie UI.
  const workspaceId = generation.workspaceId;

  const startedAt = Date.now();
  const topic = generation.topicId
    ? await db.topic.findFirst({
        where: { id: generation.topicId, workspaceId },
      })
    : null;
  const storedEditorial = parseStoredEditorialContext(generation.editorialContext);
  const contextInput = {
    subject: generation.subject,
    origin: topic?.origin,
    angle: storedEditorial?.angle ?? topic?.angle,
    notes: storedEditorial?.notes ?? topic?.notes,
    audience: storedEditorial?.audience,
    objective: storedEditorial?.objective,
    seoKeywords: storedEditorial?.seoKeywords,
    language: storedEditorial?.language,
    preferredTitle: storedEditorial?.preferredTitle,
    sourceTitle: topic?.sourceTitle,
    sourceName: topic?.sourceName,
    sourceUrl: topic?.sourceUrl,
    sourcePublishedOn: topic?.sourcePublishedOn,
    sourceKind: topic?.sourceKind,
  };
  const generationMessage = buildGenerationMessage(contextInput);
  const transmittedContext = contextSnapshot(contextInput);
  const run =
    options.run ??
    ((subject) =>
      runAgentSession(subject, {
        generationMessage:
          generationMessage === subject ? undefined : generationMessage,
        cmsDestination: generation.cmsDestination ?? "wordpress",
        workspaceId,
        webflowCategoryItemId: storedEditorial?.webflowCategoryItemId ?? null,
        webflowAuthorItemId: storedEditorial?.webflowAuthorItemId ?? null,
        wpCategorizationMode: storedEditorial?.wpCategorizationMode ?? null,
        wpCategoryIds: storedEditorial?.wpCategoryIds ?? null,
        wpAuthorId: storedEditorial?.wpAuthorId ?? null,
        onProgress: async (progress) => {
          await updateGenerationProgress(id, progress.stage, progress.message);
        },
      }));

  logInfo("generation", "started", { generationId: id });
  await updateGenerationProgress(
    id,
    "preparing",
    PROGRESS_MESSAGES.preparing
  );

  try {
    const result = await run(generation.subject);
    const durationMs = Date.now() - startedAt;
    const destination = result.cmsDestination;
    const storedTrace = completedTraceUpdate(
      transmittedContext,
      result.trace,
      result.cms.status
    );

    const isWebflow = destination === "webflow";
    await db.articleGeneration.update({
      where: { id },
      data: {
        status: "completed",
        sessionId: result.sessionId,
        trace: storedTrace.trace as Prisma.InputJsonValue,
        wpStatus: isWebflow ? result.cms.status : storedTrace.wpStatus,
        // Webflow : jamais de wpPostId / wpUrl inventés.
        wpPostId: isWebflow ? null : result.wordpress?.postId ?? null,
        wpUrl: isWebflow ? null : result.wordpress?.link || null,
        cmsDestination: destination,
        cmsExternalId: result.cms.externalId,
        title: result.cms.title || null,
        slug: result.cms.slug || null,
        excerpt: result.cms.excerpt || null,
        metaTitle: result.cms.metaTitle || null,
        metaDescription: result.cms.metaDescription || null,
        categories: isWebflow ? [] : result.detectedCategories,
        durationMs,
        error: null,
        inputTokens: result.inputTokens,
        cachedInputTokens: result.cachedInputTokens,
        outputTokens: result.outputTokens,
        reasoningTokens: result.reasoningTokens,
        estimatedCost: result.estimatedCost,
        model: result.model,
        progressStage: "completed",
        progressMessage: PROGRESS_MESSAGES.completed,
        progressUpdatedAt: new Date(),
      },
    });

    await syncTopicStatus(generation.topicId, workspaceId, "completed");

    logInfo("generation", "completed", {
      generationId: id,
      workspaceId,
      sessionId: result.sessionId,
      cmsDestination: destination,
      cmsExternalId: result.cms.externalId,
      wpPostId: isWebflow ? null : result.wordpress?.postId ?? null,
      durationMs,
      inputTokens: result.inputTokens,
      cachedInputTokens: result.cachedInputTokens,
      outputTokens: result.outputTokens,
      reasoningTokens: result.reasoningTokens,
      estimatedCost: result.estimatedCost,
      model: result.model,
      usageDelayMs: result.usageCollection.delayMs,
      usageRetries: result.usageCollection.retries,
    });

    // Image à la une : WordPress uniquement pour l’instant (V7.10.1).
    if (!isWebflow) {
      await enqueueFeaturedImageAfterArticle(id);
    }
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const sessionId =
      error instanceof AgentSessionError ? error.sessionId : generation.sessionId;
    const storedTrace = failedTraceUpdate(transmittedContext, error);

    const latest = await db.articleGeneration.findUnique({
      where: { id },
      select: { progressStage: true },
    });
    const preservedStage = preserveProgressStageOnFailure(
      latest?.progressStage
    );

    await db.articleGeneration.update({
      where: { id },
      data: {
        status: "failed",
        error: toStoredError(error),
        durationMs,
        sessionId,
        trace: storedTrace.trace as Prisma.InputJsonValue,
        wpStatus: storedTrace.wpStatus,
        ...(storedTrace.wpPostId
          ? {
              wpPostId: storedTrace.wpPostId,
              wpUrl: storedTrace.wpUrl,
              cmsDestination: generation.cmsDestination ?? "wordpress",
              cmsExternalId: String(storedTrace.wpPostId),
            }
          : {}),
        // Conserve recherche/rédaction/création — ne pas écraser en "failed"
        // sinon l’UI affiche à tort un échec pendant la préparation.
        progressStage: preservedStage,
        progressMessage: toStoredError(error) || PROGRESS_MESSAGES.failed,
        progressUpdatedAt: new Date(),
      },
    });

    await syncTopicStatus(generation.topicId, workspaceId, "pending");
    await cancelPendingFeaturedImagesForFailedArticle(id);

    logError("generation", "failed", {
      generationId: id,
      workspaceId,
      sessionId,
      durationMs,
      message: toStoredError(error),
    });
  }
}

/**
 * Lance le traitement dans le process Node de Next.js, sans garder
 * la requête HTTP ouverte (une génération réelle dure ~1 min).
 *
 * Limites V1 (runtime Node persistant, pas serverless) :
 * - pas de Redis / BullMQ / worker séparé ;
 * - un redémarrage du process abandonne les générations `running`
 *   (récupération via recoverStaleGenerations après 30 min) ;
 * - un seul processus est supposé (VPS Docker unique).
 */
export function enqueueArticleGeneration(
  id: string,
  run?: ArticleRunner
): void {
  void processArticleGeneration(id, run ? { run } : {}).catch(async (error) => {
    logError("generation", "unexpected failure", {
      generationId: id,
      message: toStoredError(error),
    });

    void (async () => {
      try {
        const latest = await db.articleGeneration.findUnique({
          where: { id },
          select: { progressStage: true, status: true },
        });
        if (!latest || latest.status !== "running") {
          return;
        }
        await db.articleGeneration.updateMany({
          where: { id, status: "running" },
          data: {
            status: "failed",
            error: toStoredError(error),
            progressStage: preserveProgressStageOnFailure(latest.progressStage),
            progressMessage: toStoredError(error) || PROGRESS_MESSAGES.failed,
            progressUpdatedAt: new Date(),
          },
        });
      } catch (persistError) {
        logError("generation", "unexpected failure", {
          generationId: id,
          message: toStoredError(persistError),
        });
      }
    })();
  });
}
