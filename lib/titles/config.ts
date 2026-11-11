/** Modèle OpenAI pour les suggestions de titres (tâche courte, coût réduit). */
export const TITLE_SUGGESTION_MODEL =
  process.env.OPENAI_TITLE_MODEL?.trim() || "gpt-4.1-mini";

export const TITLE_SUGGESTION_COUNT = 5;
export const MAX_PREFERRED_TITLE_LENGTH = 180;
export const MAX_CONCURRENT_TITLE_SUGGESTIONS = 3;

export const TITLE_APPROACHES = [
  "tutoriel",
  "guide",
  "comparaison",
  "analyse",
  "liste",
] as const;

export type TitleApproach = (typeof TITLE_APPROACHES)[number];

export function isTitleApproach(value: string): value is TitleApproach {
  return (TITLE_APPROACHES as readonly string[]).includes(value);
}
