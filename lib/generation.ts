import { db } from "./db";
import {
  AgentSessionError,
  runAgentSession,
  type RunAgentSessionResult,
} from "./agent/run-session";
import { toStoredError } from "./generation-errors";
import { logError, logInfo } from "./logger";
import {
  PROGRESS_MESSAGES,
  isProgressAhead,
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
  topicId?: string;
}) {
  const generation = await db.articleGeneration.create({
    data: {
      subject: input.subject,
      status: "queued",
      topicId: input.topicId,
      progressStage: "queued",
      progressMessage: PROGRESS_MESSAGES.queued,
      progressUpdatedAt: new Date(),
    },
  });

  logInfo("generation", "queued", { generationId: generation.id });
  return generation;
}

async function syncTopicStatus(
  topicId: string | null | undefined,
  status: "completed" | "pending"
): Promise<void> {
  if (!topicId) {
    return;
  }

  await db.topic.updateMany({
    where: { id: topicId, status: "generating" },
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

  const startedAt = Date.now();
  const run =
    options.run ??
    ((subject) =>
      runAgentSession(subject, {
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

    await db.articleGeneration.update({
      where: { id },
      data: {
        status: "completed",
        sessionId: result.sessionId,
        wpPostId: result.wordpress.postId,
        wpUrl: result.wordpress.link || null,
        title: result.wordpress.title || null,
        slug: result.wordpress.slug || null,
        excerpt: result.wordpress.excerpt || null,
        metaTitle: result.wordpress.metaTitle || null,
        metaDescription: result.wordpress.metaDescription || null,
        categories: result.detectedCategories,
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

    await syncTopicStatus(generation.topicId, "completed");

    logInfo("generation", "completed", {
      generationId: id,
      sessionId: result.sessionId,
      wpPostId: result.wordpress.postId,
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
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const sessionId =
      error instanceof AgentSessionError ? error.sessionId : generation.sessionId;

    await db.articleGeneration.update({
      where: { id },
      data: {
        status: "failed",
        error: toStoredError(error),
        durationMs,
        sessionId,
        progressStage: "failed",
        progressMessage: PROGRESS_MESSAGES.failed,
        progressUpdatedAt: new Date(),
      },
    });

    await syncTopicStatus(generation.topicId, "pending");

    logError("generation", "failed", {
      generationId: id,
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

    await db.articleGeneration
      .updateMany({
        where: { id, status: "running" },
        data: {
          status: "failed",
          error: toStoredError(error),
          progressStage: "failed",
          progressMessage: PROGRESS_MESSAGES.failed,
          progressUpdatedAt: new Date(),
        },
      })
      .catch((persistError) => {
        logError("generation", "unexpected failure", {
          generationId: id,
          message: toStoredError(persistError),
        });
      });
  });
}
