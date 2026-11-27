import { db } from "@/lib/db";
import {
  INTERRUPTED_ERROR,
  STALE_GENERATION_MS,
  toStoredError,
} from "@/lib/generation-errors";
import { logError, logInfo } from "@/lib/logger";
import { FEATURED_IMAGE_MODEL, sizeForAspect } from "./config";
import type { FeaturedImageRequest } from "./request";
import { fulfillPendingFeaturedImage } from "./service";

export const FEATURED_IMAGE_INTERRUPTED_ERROR =
  "Génération d’image interrompue avant sa finalisation. Relancez manuellement si besoin.";

/**
 * Crée une demande d’image persistée (status pending) liée à la génération.
 * Aucun appel OpenAI Images à ce stade.
 */
export async function createPendingFeaturedImageRequest(
  generationId: string,
  request: FeaturedImageRequest,
  workspaceId?: string
): Promise<string> {
  const existing = await db.articleFeaturedImage.findFirst({
    where: {
      generationId,
      status: { in: ["pending", "generating"] },
    },
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }

  let resolvedWorkspaceId = workspaceId?.trim() || "";
  if (!resolvedWorkspaceId) {
    const generation = await db.articleGeneration.findUnique({
      where: { id: generationId },
      select: { workspaceId: true },
    });
    if (!generation?.workspaceId) {
      throw new Error(
        "workspaceId introuvable pour la demande d’image à la une."
      );
    }
    resolvedWorkspaceId = generation.workspaceId;
  }

  const created = await db.articleFeaturedImage.create({
    data: {
      workspaceId: resolvedWorkspaceId,
      generationId,
      relativePath: "pending",
      prompt: "",
      style: request.style,
      aspectRatio: request.aspectRatio,
      size: request.size || sizeForAspect(request.aspectRatio),
      model: FEATURED_IMAGE_MODEL,
      visualInstructions: request.visualInstructions,
      origin: "auto",
      status: "pending",
    },
  });

  logInfo("featured-image", "pending request created", {
    generationId,
    imageId: created.id,
  });

  return created.id;
}

/** Annule les demandes pending si l’article a échoué. */
export async function cancelPendingFeaturedImagesForFailedArticle(
  generationId: string
): Promise<void> {
  await db.articleFeaturedImage.updateMany({
    where: {
      generationId,
      status: { in: ["pending", "generating"] },
    },
    data: {
      status: "failed",
      error: "Article non terminé : aucune image générée.",
    },
  });
}

/**
 * Traite une demande pending pour un article completed
 * (WordPress : wpPostId ; Webflow : cmsExternalId).
 * Claim atomique pending → generating pour éviter les doublons.
 */
export async function processPendingFeaturedImageJob(
  imageId: string
): Promise<void> {
  const claimed = await db.articleFeaturedImage.updateMany({
    where: { id: imageId, status: "pending" },
    data: { status: "generating", error: null },
  });

  if (claimed.count !== 1) {
    logInfo("featured-image", "job skipped", { imageId });
    return;
  }

  const row = await db.articleFeaturedImage.findUnique({
    where: { id: imageId },
  });
  if (!row) {
    return;
  }

  const generation = await db.articleGeneration.findUnique({
    where: { id: row.generationId },
    select: {
      status: true,
      wpPostId: true,
      cmsDestination: true,
      cmsExternalId: true,
    },
  });

  const isWebflow = generation?.cmsDestination === "webflow";
  const hasDraft = isWebflow
    ? Boolean(generation?.cmsExternalId?.trim())
    : typeof generation?.wpPostId === "number" && generation.wpPostId > 0;

  if (!generation || generation.status !== "completed" || !hasDraft) {
    await db.articleFeaturedImage.update({
      where: { id: imageId },
      data: {
        status: "failed",
        error: "Article non terminé : aucune image générée.",
      },
    });
    return;
  }

  try {
    await fulfillPendingFeaturedImage(imageId);
    logInfo("featured-image", "auto generation completed", {
      imageId,
      generationId: row.generationId,
    });
  } catch (error) {
    const message = toStoredError(error);
    await db.articleFeaturedImage
      .updateMany({
        where: { id: imageId, status: "generating" },
        data: { status: "failed", error: message.slice(0, 500) },
      })
      .catch(() => undefined);
    logError("featured-image", "auto generation failed", {
      imageId,
      generationId: row.generationId,
      message,
    });
  }
}

export function enqueuePendingFeaturedImage(imageId: string): void {
  void processPendingFeaturedImageJob(imageId).catch((error) => {
    logError("featured-image", "unexpected job failure", {
      imageId,
      message: toStoredError(error),
    });
  });
}

/**
 * Après article completed : lance le job image s’il existe une demande pending.
 */
export async function enqueueFeaturedImageAfterArticle(
  generationId: string
): Promise<void> {
  const pending = await db.articleFeaturedImage.findFirst({
    where: { generationId, status: "pending", origin: "auto" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!pending) {
    return;
  }
  enqueuePendingFeaturedImage(pending.id);
}

/**
 * Récupération : generating interrompu → failed (pas de relance API aveugle).
 * pending d’articles completed → requeue.
 */
export async function recoverFeaturedImageJobs(
  options: { fromBoot?: boolean } = {}
): Promise<{ interrupted: number; requeued: number }> {
  const fromBoot = options.fromBoot === true;
  const cutoff = new Date(Date.now() - STALE_GENERATION_MS);

  const interruptedWhere = fromBoot
    ? { status: "generating" as const }
    : { status: "generating" as const, updatedAt: { lt: cutoff } };

  const interrupted = await db.articleFeaturedImage.updateMany({
    where: interruptedWhere,
    data: {
      status: "failed",
      error: FEATURED_IMAGE_INTERRUPTED_ERROR,
    },
  });

  // Demandes pending/generating liées à un article failed — 1 updateMany relationnel
  // (évite de charger tous les ids « failed » en mémoire, PERF/V7.16.2).
  await db.articleFeaturedImage.updateMany({
    where: {
      status: { in: ["pending", "generating"] },
      generation: { status: "failed" },
    },
    data: {
      status: "failed",
      error: "Article non terminé : aucune image générée.",
    },
  });

  const requeueCandidates = await db.articleFeaturedImage.findMany({
    where: {
      status: "pending",
      OR: [
        {
          generation: {
            status: "completed",
            cmsDestination: { not: "webflow" },
            wpPostId: { not: null },
          },
        },
        {
          generation: {
            status: "completed",
            cmsDestination: "webflow",
            cmsExternalId: { not: null },
          },
        },
      ],
    },
    select: { id: true },
  });

  for (const item of requeueCandidates) {
    enqueuePendingFeaturedImage(item.id);
  }

  if (interrupted.count > 0 || requeueCandidates.length > 0) {
    logInfo(
      fromBoot ? "boot" : "featured-image",
      fromBoot
        ? "featured image jobs recovered"
        : "stale featured image jobs recovered",
      {
        interrupted: interrupted.count,
        requeued: requeueCandidates.length,
        note: INTERRUPTED_ERROR,
      }
    );
  }

  return {
    interrupted: interrupted.count,
    requeued: requeueCandidates.length,
  };
}
