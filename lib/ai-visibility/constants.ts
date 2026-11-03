export const ANALYSIS_VERSION = "geo-1.1.4";
export const ANALYSIS_VERSION_LEGACY = "geo-1.0";
export const ANALYSIS_VERSION_PREV = "geo-1.1.3";

export const ALLOWED_QUESTION_COUNTS = [5, 10, 20] as const;
export const ALLOWED_REPETITIONS = [1, 2, 3] as const;
export const DEFAULT_MODEL = "gpt-5.6-terra";
export const DEFAULT_PROVIDER = "openai";

/** Plafond d’appels IA par campagne (questions × répétitions). */
export const MAX_CALLS_PER_CAMPAIGN = 60;

export const QUESTION_INTENTS = [
  "information",
  "comparison",
  "provider_search",
  "recommendation",
  "purchase",
] as const;

export type QuestionIntent = (typeof QUESTION_INTENTS)[number];

export const ENTITY_CATEGORIES = [
  "target_brand",
  "direct_competitor",
  "indirect_competitor",
  "software_product",
  "institution",
  "information_source",
  "other",
  "unknown",
] as const;

export type EntityCategory = (typeof ENTITY_CATEGORIES)[number];

export const MENTION_KINDS = [
  "mention",
  "recommendation",
  "negative",
  "citation_only",
] as const;

export type MentionKind = (typeof MENTION_KINDS)[number];

export type VisibilityCitation = {
  title?: string | null;
  url: string;
  domain?: string | null;
};

export type ExtractedEntity = {
  name: string;
  /** Nom brut tel qu’extrait de la réponse (avant normalisation). */
  rawName?: string | null;
  domain?: string | null;
  /** Kind historique (compat métriques / Prisma). */
  kind: "target_brand" | "competitor" | "other" | "source";
  category: EntityCategory;
  categoryConfidence?: number | null;
  categoryJustification?: string | null;
  mentionKind: MentionKind;
  appearanceOrder?: number | null;
  excerpt?: string | null;
  confidence?: number | null;
  parentKey?: string | null;
};

export type ProviderAnswer = {
  text: string;
  citations: VisibilityCitation[];
  raw?: unknown;
  inputTokens?: number | null;
  outputTokens?: number | null;
  durationMs: number;
};

export function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

export function domainFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

export function estimateCampaignCalls(
  questionCount: number,
  repetitions: number
): number {
  return questionCount * repetitions;
}

export function assertCampaignLimits(input: {
  questionCount: number;
  repetitions: number;
}): { ok: true; calls: number } | { ok: false; error: string } {
  if (
    !ALLOWED_QUESTION_COUNTS.includes(
      input.questionCount as (typeof ALLOWED_QUESTION_COUNTS)[number]
    )
  ) {
    return { ok: false, error: "Nombre de questions invalide (5, 10 ou 20)." };
  }
  if (
    !ALLOWED_REPETITIONS.includes(
      input.repetitions as (typeof ALLOWED_REPETITIONS)[number]
    )
  ) {
    return { ok: false, error: "Nombre de répétitions invalide (1 à 3)." };
  }
  const calls = estimateCampaignCalls(input.questionCount, input.repetitions);
  if (calls > MAX_CALLS_PER_CAMPAIGN) {
    return {
      ok: false,
      error: `Trop d’appels estimés (${calls}, max ${MAX_CALLS_PER_CAMPAIGN}).`,
    };
  }
  return { ok: true, calls };
}

/** Mappe la catégorie GEO 1.1 vers le kind historique Prisma. */
export function categoryToLegacyKind(
  category: EntityCategory
): ExtractedEntity["kind"] {
  switch (category) {
    case "target_brand":
      return "target_brand";
    case "direct_competitor":
    case "indirect_competitor":
      return "competitor";
    case "information_source":
      return "source";
    default:
      return "other";
  }
}

export function isEntityCategory(value: unknown): value is EntityCategory {
  return (
    typeof value === "string" &&
    (ENTITY_CATEGORIES as readonly string[]).includes(value)
  );
}
