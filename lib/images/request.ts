import {
  isFeaturedImageAspectId,
  isFeaturedImageStyleId,
  MAX_VISUAL_INSTRUCTIONS_LENGTH,
  sizeForAspect,
  type FeaturedImageAspectId,
  type FeaturedImageStyleId,
} from "./config";

export type FeaturedImageRequest = {
  enabled: boolean;
  style: FeaturedImageStyleId;
  aspectRatio: FeaturedImageAspectId;
  visualInstructions: string | null;
  size: string;
};

function cleanInstructions(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error("Les instructions visuelles sont invalides.");
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
  if (cleaned.length > MAX_VISUAL_INSTRUCTIONS_LENGTH) {
    throw new Error(
      `Les instructions visuelles ne peuvent pas dépasser ${MAX_VISUAL_INSTRUCTIONS_LENGTH} caractères.`
    );
  }
  return cleaned;
}

/**
 * Option image facultative dans /api/generate.
 * Absente ou enabled=false → null (comportement historique).
 */
export function parseFeaturedImageRequest(
  body: Record<string, unknown>
): FeaturedImageRequest | null {
  const raw = body.featuredImage;
  if (raw === undefined || raw === null) {
    if (body.generateFeaturedImage === true) {
      return parseFeaturedImageRequest({
        featuredImage: {
          enabled: true,
          style: body.featuredImageStyle,
          format: body.featuredImageFormat,
          aspectRatio: body.featuredImageAspectRatio,
          instructions: body.featuredImageInstructions,
        },
      });
    }
    return null;
  }

  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Les paramètres d’image à la une sont invalides.");
  }

  const request = raw as Record<string, unknown>;
  if (request.enabled !== true) {
    return null;
  }

  const styleRaw =
    typeof request.style === "string" ? request.style : "photographic";
  const aspectRaw =
    typeof request.aspectRatio === "string"
      ? request.aspectRatio
      : typeof request.format === "string"
        ? request.format
        : "3:2";

  if (!isFeaturedImageStyleId(styleRaw)) {
    throw new Error("Le style visuel de l’image est invalide.");
  }
  if (!isFeaturedImageAspectId(aspectRaw)) {
    throw new Error("Le format de l’image est invalide.");
  }

  return {
    enabled: true,
    style: styleRaw,
    aspectRatio: aspectRaw,
    visualInstructions: cleanInstructions(
      request.instructions ?? request.visualInstructions
    ),
    size: sizeForAspect(aspectRaw),
  };
}
