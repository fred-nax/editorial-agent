/**
 * Configuration centralisée de la génération d’images à la une.
 * Indépendante du moteur éditorial OpenAI Agents.
 */

export const FEATURED_IMAGE_MODEL =
  process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-2.5-flare";

export const FEATURED_IMAGE_QUALITY = "medium" as const;
export const FEATURED_IMAGE_OUTPUT_FORMAT = "webp" as const;
export const FEATURED_IMAGE_MIME = "image/webp";

/** Modèle vision pour proposer le texte ALT (configurable). */
export const FEATURED_ALT_MODEL =
  process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4.1-mini";

export const FEATURED_IMAGE_STYLES = [
  {
    id: "photographic",
    label: "Photographique",
    promptHint:
      "photographie éditoriale réaliste, lumière naturelle, rendu professionnel",
  },
  {
    id: "editorial_illustration",
    label: "Illustration éditoriale",
    promptHint:
      "illustration éditoriale soignée, trait clair, ambiance magazine",
  },
  {
    id: "flat_design",
    label: "Flat design",
    promptHint: "flat design moderne, formes simples, couleurs plates",
  },
  {
    id: "illustration_3d",
    label: "Illustration 3D",
    promptHint: "illustration 3D douce, volumes propres, rendu studio",
  },
  {
    id: "minimal",
    label: "Minimaliste",
    promptHint: "composition minimaliste, beaucoup d’espace négatif, sobriété",
  },
] as const;

export type FeaturedImageStyleId = (typeof FEATURED_IMAGE_STYLES)[number]["id"];

export const FEATURED_IMAGE_ASPECTS = [
  {
    id: "3:2",
    label: "Paysage 3:2",
    size: "1536x1024",
  },
  {
    id: "16:9",
    label: "Paysage 16:9",
    size: "1536x864",
  },
] as const;

export type FeaturedImageAspectId = (typeof FEATURED_IMAGE_ASPECTS)[number]["id"];

export const MAX_VISUAL_INSTRUCTIONS_LENGTH = 500;
export const MAX_ALT_TEXT_LENGTH = 180;
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export function isFeaturedImageStyleId(value: string): value is FeaturedImageStyleId {
  return FEATURED_IMAGE_STYLES.some((style) => style.id === value);
}

export function isFeaturedImageAspectId(
  value: string
): value is FeaturedImageAspectId {
  return FEATURED_IMAGE_ASPECTS.some((aspect) => aspect.id === value);
}

export function styleLabel(id: FeaturedImageStyleId): string {
  return FEATURED_IMAGE_STYLES.find((style) => style.id === id)?.label ?? id;
}

export function aspectLabel(id: FeaturedImageAspectId): string {
  return FEATURED_IMAGE_ASPECTS.find((aspect) => aspect.id === id)?.label ?? id;
}

export function sizeForAspect(id: FeaturedImageAspectId): string {
  return (
    FEATURED_IMAGE_ASPECTS.find((aspect) => aspect.id === id)?.size ??
    "1536x1024"
  );
}
