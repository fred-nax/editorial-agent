import type { SeoAdapterResult, SeoMetaFields, SeoVerifyResult } from "./types";

/** Clés post meta Yoast (écriture via REST native, pas l'API Yoast). */
export const YOAST_META_TITLE_KEY = "_yoast_wpseo_title";
export const YOAST_META_DESC_KEY = "_yoast_wpseo_metadesc";

/**
 * Adaptateur Yoast SEO.
 * L'API REST Yoast (`yoast/v1`) est en lecture seule.
 * L'écriture passe par `/wp/v2/posts` + `meta` après `register_post_meta`.
 */
export function buildYoastSeoMeta(fields: SeoMetaFields): SeoAdapterResult {
  return {
    restMeta: {
      [YOAST_META_TITLE_KEY]: fields.meta_title,
      [YOAST_META_DESC_KEY]: fields.meta_description,
    },
    verifyKeys: [YOAST_META_TITLE_KEY, YOAST_META_DESC_KEY],
  };
}

export function verifyYoastSeoMeta(
  meta: Record<string, unknown> | null | undefined,
  fields: SeoMetaFields
): SeoVerifyResult {
  if (!meta || typeof meta !== "object") {
    return {
      persisted: false,
      error:
        "Métadonnées Yoast absentes. Installez l'extension Naxialis Yoast REST Meta et activez Yoast SEO.",
      titleMatch: false,
      descriptionMatch: false,
    };
  }

  const title =
    typeof meta[YOAST_META_TITLE_KEY] === "string"
      ? (meta[YOAST_META_TITLE_KEY] as string)
      : "";
  const description =
    typeof meta[YOAST_META_DESC_KEY] === "string"
      ? (meta[YOAST_META_DESC_KEY] as string)
      : "";

  const titlePresent = YOAST_META_TITLE_KEY in meta;
  const descPresent = YOAST_META_DESC_KEY in meta;

  if (!titlePresent && !descPresent) {
    return {
      persisted: false,
      error:
        "Champs Yoast non exposés en REST. Activez l'extension WordPress « Naxialis Yoast REST Meta » (register_post_meta).",
      titleMatch: false,
      descriptionMatch: false,
    };
  }

  const titleMatch = title.trim() === fields.meta_title.trim();
  const descriptionMatch =
    description.trim() === fields.meta_description.trim();

  if (!titleMatch || !descriptionMatch) {
    return {
      persisted: false,
      error: `Métadonnées Yoast non persistées correctement (title=${titleMatch}, description=${descriptionMatch}).`,
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
