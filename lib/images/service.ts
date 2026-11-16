import { db } from "@/lib/db";
import { resolveEditorialIdentity } from "@/lib/editorial/identity";
import {
  languageLabel,
  parseStoredEditorialContext,
} from "@/lib/editorial-context";
import { resolveRuntimeConnections } from "@/lib/settings/app-settings";
import {
  fetchWordPressPost,
  setWordPressFeaturedMedia,
  updateWordPressMediaAltText,
  uploadWordPressMedia,
  WordPressMediaError,
} from "@/lib/wordpress-media";
import { proposeFeaturedImageAltText } from "./alt-text";
import {
  FEATURED_IMAGE_MIME,
  FEATURED_IMAGE_MODEL,
  isFeaturedImageAspectId,
  isFeaturedImageStyleId,
  MAX_ALT_TEXT_LENGTH,
  MAX_VISUAL_INSTRUCTIONS_LENGTH,
  sizeForAspect,
  type FeaturedImageAspectId,
  type FeaturedImageStyleId,
} from "./config";
import {
  FeaturedImageGenerationError,
  generateFeaturedImageBytes,
} from "./generate";
import {
  releaseFeaturedImageLock,
  releaseImageGenerationSlot,
  tryAcquireFeaturedImageLock,
  tryAcquireImageGenerationSlot,
} from "./locks";
import { buildFeaturedImagePrompt } from "./prompt";
import {
  ensureFeaturedImageStorage,
  buildFeaturedImageRelativePath,
  readFeaturedImageFile,
  writeFeaturedImageFile,
} from "./storage";
import { toFeaturedImagePublic, type FeaturedImagePublic } from "./types";

export class FeaturedImageServiceError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly payload?: Record<string, unknown>;

  constructor(
    message: string,
    status = 400,
    code?: string,
    payload?: Record<string, unknown>
  ) {
    super(message);
    this.name = "FeaturedImageServiceError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

async function assertFeaturedImageTargetsCurrentWordPress(generation: {
  wpUrl: string | null;
  wpPostId: number | null;
}): Promise<void> {
  const { resolveWordPressConfig } = await import("@/lib/settings/app-settings");
  const { normalizeWpOrigin } = await import("@/lib/settings/wp-url");
  const wp = await resolveWordPressConfig();
  if (!wp) {
    throw new FeaturedImageServiceError("WordPress non configuré.", 503);
  }
  if (!generation.wpUrl?.trim()) {
    throw new FeaturedImageServiceError(
      "URL WordPress du brouillon manquante : envoi d’image refusé.",
      409
    );
  }
  let draftOrigin: string;
  try {
    draftOrigin = normalizeWpOrigin(generation.wpUrl);
  } catch {
    throw new FeaturedImageServiceError(
      "URL WordPress du brouillon invalide.",
      409
    );
  }
  const configuredOrigin = normalizeWpOrigin(wp.url);
  if (draftOrigin !== configuredOrigin) {
    throw new FeaturedImageServiceError(
      "Ce brouillon appartient à un autre site WordPress que celui configuré. Envoi d’image refusé.",
      409,
      "WP_SITE_MISMATCH"
    );
  }
}

function cleanOptionalText(value: unknown, max: number): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new FeaturedImageServiceError("Texte invalide.");
  }
  const cleaned = value
    .replace(/\u0000/g, "")
    .replaceAll("<<<", "[")
    .replaceAll(">>>", "]")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return null;
  }
  if (cleaned.length > max) {
    throw new FeaturedImageServiceError(
      `Ce champ ne peut pas dépasser ${max} caractères.`
    );
  }
  return cleaned;
}

async function loadEligibleGeneration(generationId: string) {
  const generation = await db.articleGeneration.findUnique({
    where: { id: generationId },
  });
  if (!generation) {
    throw new FeaturedImageServiceError("Génération introuvable.", 404);
  }
  if (generation.status !== "completed") {
    throw new FeaturedImageServiceError(
      "L’image à la une n’est disponible que pour un article terminé.",
      409
    );
  }
  if (
    typeof generation.wpPostId !== "number" ||
    !Number.isInteger(generation.wpPostId) ||
    generation.wpPostId <= 0
  ) {
    throw new FeaturedImageServiceError(
      "Un identifiant de brouillon WordPress valide est requis.",
      409
    );
  }
  return generation;
}

export async function getLatestFeaturedImage(
  generationId: string
): Promise<FeaturedImagePublic | null> {
  await loadEligibleGeneration(generationId);
  const row = await db.articleFeaturedImage.findFirst({
    where: { generationId },
    orderBy: { createdAt: "desc" },
  });
  return row ? toFeaturedImagePublic(row) : null;
}

async function runImageGenerationCore(input: {
  generationId: string;
  imageId?: string;
  style: FeaturedImageStyleId;
  aspectRatio: FeaturedImageAspectId;
  visualInstructions: string | null;
  origin: "manual" | "auto";
}): Promise<FeaturedImagePublic> {
  const lockKey = `generate:${input.generationId}`;
  if (!tryAcquireFeaturedImageLock(lockKey)) {
    throw new FeaturedImageServiceError(
      "Une génération d’image est déjà en cours pour cet article.",
      409,
      "IN_PROGRESS"
    );
  }

  if (!tryAcquireImageGenerationSlot()) {
    releaseFeaturedImageLock(lockKey);
    throw new FeaturedImageServiceError(
      "Trop de générations d’image simultanées. Réessayez dans un instant.",
      429,
      "RATE_LIMIT"
    );
  }

  try {
    const generation = await loadEligibleGeneration(input.generationId);
    const editorial = parseStoredEditorialContext(generation.editorialContext);
    const size = sizeForAspect(input.aspectRatio);
    let identity;
    try {
      const connections = await resolveRuntimeConnections();
      identity = resolveEditorialIdentity({
        wpUrl: connections.wordpress.url,
        siteName: connections.siteName,
        clientName: connections.clientName,
      });
    } catch {
      identity = undefined;
    }
    const prompt = buildFeaturedImagePrompt({
      title: generation.title ?? editorial?.preferredTitle ?? null,
      subject: generation.subject,
      excerpt: generation.excerpt,
      angle: editorial?.angle ?? null,
      languageLabel: languageLabel(editorial?.language ?? null),
      style: input.style,
      visualInstructions: input.visualInstructions,
      identity,
    });

    await ensureFeaturedImageStorage();
    const generated = await generateFeaturedImageBytes({ prompt, size });

    let imageId = input.imageId;
    if (!imageId) {
      const created = await db.articleFeaturedImage.create({
        data: {
          generationId: generation.id,
          relativePath: "pending",
          mimeType: generated.mimeType,
          byteSize: generated.bytes.byteLength,
          prompt,
          style: input.style,
          aspectRatio: input.aspectRatio,
          size: generated.size,
          model: generated.model,
          visualInstructions: input.visualInstructions,
          origin: input.origin,
          status: "ready",
        },
      });
      imageId = created.id;
    }

    const relativePath = buildFeaturedImageRelativePath(
      generation.id,
      imageId
    );
    await writeFeaturedImageFile(relativePath, generated.bytes);

    const alt = await proposeFeaturedImageAltText({
      imageBytes: generated.bytes,
      mimeType: generated.mimeType,
      title: generation.title,
      subject: generation.subject,
      languageLabel: languageLabel(editorial?.language ?? null),
    });

    const updated = await db.articleFeaturedImage.update({
      where: { id: imageId },
      data: {
        relativePath,
        mimeType: generated.mimeType,
        byteSize: generated.bytes.byteLength,
        prompt,
        style: input.style,
        aspectRatio: input.aspectRatio,
        size: generated.size,
        model: generated.model,
        visualInstructions: input.visualInstructions,
        origin: input.origin,
        altText: alt.altText,
        altModel: alt.model,
        status: "ready",
        error: null,
      },
    });

    return toFeaturedImagePublic(updated);
  } catch (error) {
    if (
      error instanceof FeaturedImageServiceError ||
      error instanceof FeaturedImageGenerationError
    ) {
      throw error instanceof FeaturedImageGenerationError
        ? new FeaturedImageServiceError(error.message, error.status)
        : error;
    }
    throw new FeaturedImageServiceError(
      "La génération d’image a échoué.",
      502
    );
  } finally {
    releaseImageGenerationSlot();
    releaseFeaturedImageLock(lockKey);
  }
}

export async function generateFeaturedImageForArticle(input: {
  generationId: string;
  style: string;
  aspectRatio: string;
  visualInstructions?: unknown;
}): Promise<FeaturedImagePublic> {
  if (!isFeaturedImageStyleId(input.style)) {
    throw new FeaturedImageServiceError("Style visuel invalide.");
  }
  if (!isFeaturedImageAspectId(input.aspectRatio)) {
    throw new FeaturedImageServiceError("Format d’image invalide.");
  }

  const active = await db.articleFeaturedImage.findFirst({
    where: {
      generationId: input.generationId,
      status: { in: ["pending", "generating"] },
    },
    select: { id: true },
  });
  if (active) {
    throw new FeaturedImageServiceError(
      "Une génération d’image est déjà planifiée ou en cours pour cet article.",
      409,
      "IN_PROGRESS"
    );
  }

  return runImageGenerationCore({
    generationId: input.generationId,
    style: input.style,
    aspectRatio: input.aspectRatio,
    visualInstructions: cleanOptionalText(
      input.visualInstructions,
      MAX_VISUAL_INSTRUCTIONS_LENGTH
    ),
    origin: "manual",
  });
}

/**
 * Finalise une ligne pending/generating (workflow auto V7.1).
 * Réutilise le même moteur Images + ALT que la génération manuelle.
 */
export async function fulfillPendingFeaturedImage(
  imageId: string
): Promise<FeaturedImagePublic> {
  const row = await db.articleFeaturedImage.findUnique({
    where: { id: imageId },
  });
  if (!row) {
    throw new FeaturedImageServiceError("Image introuvable.", 404);
  }
  if (row.status !== "generating" && row.status !== "pending") {
    throw new FeaturedImageServiceError(
      "Cette demande d’image n’est plus en attente.",
      409
    );
  }
  if (!isFeaturedImageStyleId(row.style)) {
    throw new FeaturedImageServiceError("Style visuel invalide.");
  }
  if (!isFeaturedImageAspectId(row.aspectRatio)) {
    throw new FeaturedImageServiceError("Format d’image invalide.");
  }

  return runImageGenerationCore({
    generationId: row.generationId,
    imageId: row.id,
    style: row.style,
    aspectRatio: row.aspectRatio,
    visualInstructions: row.visualInstructions,
    origin: row.origin === "auto" ? "auto" : "manual",
  });
}

export async function updateFeaturedImageAltText(input: {
  generationId: string;
  imageId: string;
  altText: unknown;
}): Promise<FeaturedImagePublic> {
  await loadEligibleGeneration(input.generationId);
  const altText = cleanOptionalText(input.altText, MAX_ALT_TEXT_LENGTH);

  const row = await db.articleFeaturedImage.findFirst({
    where: { id: input.imageId, generationId: input.generationId },
  });
  if (!row) {
    throw new FeaturedImageServiceError("Image introuvable.", 404);
  }

  const updated = await db.articleFeaturedImage.update({
    where: { id: row.id },
    data: { altText, error: null },
  });
  return toFeaturedImagePublic(updated);
}

export async function uploadFeaturedImageToWordPress(input: {
  generationId: string;
  imageId: string;
  altText?: unknown;
  confirmReplace?: boolean;
}): Promise<{
  image: FeaturedImagePublic;
  wordpress: { postId: number; status: string; link: string; mediaId: number };
}> {
  const lockKey = `upload:${input.generationId}`;
  if (!tryAcquireFeaturedImageLock(lockKey)) {
    throw new FeaturedImageServiceError(
      "Un envoi WordPress est déjà en cours pour cet article.",
      409,
      "IN_PROGRESS"
    );
  }

  try {
    const generation = await loadEligibleGeneration(input.generationId);
    await assertFeaturedImageTargetsCurrentWordPress(generation);

    const row = await db.articleFeaturedImage.findFirst({
      where: { id: input.imageId, generationId: input.generationId },
    });
    if (!row) {
      throw new FeaturedImageServiceError("Image introuvable.", 404);
    }
    if (row.relativePath === "pending") {
      throw new FeaturedImageServiceError("Fichier image indisponible.", 409);
    }

    const altText =
      input.altText !== undefined
        ? cleanOptionalText(input.altText, MAX_ALT_TEXT_LENGTH)
        : row.altText;

    if (altText !== row.altText) {
      await db.articleFeaturedImage.update({
        where: { id: row.id },
        data: { altText },
      });
    }

    const post = await fetchWordPressPost(generation.wpPostId!);
    if (post.id !== generation.wpPostId) {
      throw new FeaturedImageServiceError(
        "L’identifiant WordPress ne correspond pas.",
        409
      );
    }
    if (post.status !== "draft") {
      throw new FeaturedImageServiceError(
        "Seuls les brouillons WordPress peuvent recevoir une image à la une.",
        409,
        "NOT_DRAFT"
      );
    }

    const existingFeatured = post.featured_media > 0 ? post.featured_media : 0;
    if (
      existingFeatured > 0 &&
      existingFeatured !== row.wpMediaId &&
      !input.confirmReplace
    ) {
      throw new FeaturedImageServiceError(
        "Ce brouillon a déjà une image à la une. Confirmez le remplacement.",
        409,
        "CONFIRM_REPLACE",
        { existingFeaturedMedia: existingFeatured }
      );
    }

    await db.articleFeaturedImage.update({
      where: { id: row.id },
      data: { status: "uploading", error: null },
    });

    let mediaId = row.wpMediaId;
    let mediaUrl = row.wpMediaUrl;

    try {
      if (!mediaId) {
        const bytes = await readFeaturedImageFile(row.relativePath);
        if (bytes.byteLength === 0) {
          throw new FeaturedImageServiceError("Fichier image vide.", 409);
        }
        const media = await uploadWordPressMedia({
          bytes,
          filename: `${row.id}.webp`,
          mimeType: row.mimeType || FEATURED_IMAGE_MIME,
          altText,
        });
        mediaId = media.id;
        mediaUrl = media.source_url || null;
        await db.articleFeaturedImage.update({
          where: { id: row.id },
          data: {
            wpMediaId: mediaId,
            wpMediaUrl: mediaUrl,
          },
        });
      } else if (altText) {
        try {
          await updateWordPressMediaAltText(mediaId, altText);
        } catch {
          // Conservé pour reprise : association possible même si ALT échoue.
        }
      }

      const updatedPost = await setWordPressFeaturedMedia(
        generation.wpPostId!,
        mediaId
      );
      if (updatedPost.status !== "draft") {
        throw new FeaturedImageServiceError(
          "Le statut WordPress n’est plus brouillon après association.",
          409,
          "NOT_DRAFT"
        );
      }
      if (updatedPost.featured_media !== mediaId) {
        throw new FeaturedImageServiceError(
          "L’image à la une n’a pas été confirmée par WordPress.",
          502
        );
      }

      const verified = await fetchWordPressPost(generation.wpPostId!);
      if (
        verified.status !== "draft" ||
        verified.featured_media !== mediaId
      ) {
        throw new FeaturedImageServiceError(
          "Vérification WordPress échouée.",
          502
        );
      }

      const finalRow = await db.articleFeaturedImage.update({
        where: { id: row.id },
        data: {
          status: "attached",
          wpMediaId: mediaId,
          wpMediaUrl: mediaUrl,
          altText,
          error: null,
        },
      });

      return {
        image: toFeaturedImagePublic(finalRow),
        wordpress: {
          postId: verified.id,
          status: verified.status,
          link: verified.link || generation.wpUrl || "",
          mediaId,
        },
      };
    } catch (error) {
      const message =
        error instanceof FeaturedImageServiceError ||
        error instanceof WordPressMediaError
          ? error.message
          : "Échec de l’envoi WordPress.";
      const status =
        error instanceof FeaturedImageServiceError ||
        error instanceof WordPressMediaError
          ? error.status
          : 502;
      const code =
        error instanceof FeaturedImageServiceError ? error.code : undefined;
      const payload =
        error instanceof FeaturedImageServiceError ? error.payload : undefined;

      await db.articleFeaturedImage.update({
        where: { id: row.id },
        data: {
          status: mediaId ? "ready" : "failed",
          wpMediaId: mediaId ?? row.wpMediaId,
          wpMediaUrl: mediaUrl ?? row.wpMediaUrl,
          error: message,
        },
      });

      throw new FeaturedImageServiceError(message, status, code, payload);
    }
  } finally {
    releaseFeaturedImageLock(lockKey);
  }
}

export async function readFeaturedImageBytesForArticle(input: {
  generationId: string;
  imageId: string;
}): Promise<{ bytes: Buffer; mimeType: string }> {
  await loadEligibleGeneration(input.generationId);
  const row = await db.articleFeaturedImage.findFirst({
    where: { id: input.imageId, generationId: input.generationId },
  });
  if (!row || row.relativePath === "pending") {
    throw new FeaturedImageServiceError("Image introuvable.", 404);
  }
  const bytes = await readFeaturedImageFile(row.relativePath);
  return { bytes, mimeType: row.mimeType || FEATURED_IMAGE_MIME };
}

export { FEATURED_IMAGE_MODEL };
