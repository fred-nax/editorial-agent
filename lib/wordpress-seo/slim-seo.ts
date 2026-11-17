import type { SeoAdapterResult, SeoMetaFields, SeoVerifyResult } from "./types";

/**
 * Adaptateur Slim SEO — logique historique inchangée.
 * WordPress attend `meta.slim_seo.{ title, description }`.
 */
export function buildSlimSeoMeta(fields: SeoMetaFields): SeoAdapterResult {
  return {
    restMeta: {
      slim_seo: {
        title: fields.meta_title,
        description: fields.meta_description,
      },
    },
    verifyKeys: ["slim_seo"],
  };
}

export function verifySlimSeoMeta(
  meta: Record<string, unknown> | null | undefined,
  fields: SeoMetaFields
): SeoVerifyResult {
  if (!meta || typeof meta !== "object") {
    return {
      persisted: false,
      error: "Métadonnées Slim SEO absentes de la réponse WordPress.",
      titleMatch: false,
      descriptionMatch: false,
    };
  }

  const slim = meta.slim_seo;
  if (!slim || typeof slim !== "object") {
    return {
      persisted: false,
      error:
        "Champ meta.slim_seo introuvable. Vérifiez que Slim SEO est actif et expose ses champs en REST.",
      titleMatch: false,
      descriptionMatch: false,
    };
  }

  const record = slim as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title : "";
  const description =
    typeof record.description === "string" ? record.description : "";
  const titleMatch = title.trim() === fields.meta_title.trim();
  const descriptionMatch =
    description.trim() === fields.meta_description.trim();

  if (!titleMatch || !descriptionMatch) {
    return {
      persisted: false,
      error: `Métadonnées Slim SEO incomplètes (title=${titleMatch}, description=${descriptionMatch}).`,
      titleMatch,
      descriptionMatch,
    };
  }

  return {
    persisted: true,
    error: null,
    titleMatch: true,
    descriptionMatch: true,
  };
}
