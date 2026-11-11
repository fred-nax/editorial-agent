/** Modèle OpenAI pour l’analyse de similarité éditoriale (facultative). */
export const EDITORIAL_SIMILARITY_MODEL =
  process.env.OPENAI_SIMILARITY_MODEL?.trim() || "gpt-4.1-mini";

export const MAX_EDITORIAL_MATCHES = 5;
export const MAX_EDITORIAL_SUBJECT_LENGTH = 500;
export const MAX_EDITORIAL_ANGLE_LENGTH = 240;
export const MAX_CONCURRENT_SIMILARITY_CHECKS = 4;
export const MAX_CONCURRENT_SIMILARITY_AI = 2;

/** Longueur minimale avant déclenchement auto (caractères). */
export const MIN_SUBJECT_CHARS_FOR_CHECK = 18;
/** Délai de temporisation UI (ms). */
export const EDITORIAL_CHECK_DEBOUNCE_MS = 650;
/** Inventaire considéré obsolète au-delà de ce délai. */
export const INVENTORY_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Seuils internes de classement (non exposés comme % SEO).
 * probable ≥ probableMin ; close ≥ closeMin ; complementary ≥ complementaryMin
 */
export const EDITORIAL_THRESHOLDS = {
  /** Doublon : concepts techniques partagés + score élevé. */
  probableMin: 0.7,
  /** Proche : même objet technique, angle éventuellement distinct. */
  closeMin: 0.52,
  /** Complémentaire : univers lié, intention différente. */
  complementaryMin: 0.36,
  exactTitleAsProbable: true,
} as const;
