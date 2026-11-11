import { openai } from "@/lib/openai";
import {
  languageLabel,
  type EditorialContext,
  type LanguageCode,
} from "@/lib/editorial-context";
import { parseSubject } from "@/lib/generation";
import {
  isTitleApproach,
  TITLE_APPROACHES,
  TITLE_SUGGESTION_COUNT,
  TITLE_SUGGESTION_MODEL,
} from "./config";
import {
  releaseTitleSuggestionSlot,
  tryAcquireTitleSuggestionSlot,
} from "./locks";
import type { TitleSuggestion } from "./types";

export type { TitleSuggestion } from "./types";
export { approachLabel } from "./types";

export class TitleSuggestionError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "TitleSuggestionError";
    this.status = status;
  }
}

const SUGGESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    suggestions: {
      type: "array",
      minItems: TITLE_SUGGESTION_COUNT,
      maxItems: TITLE_SUGGESTION_COUNT,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          approach: {
            type: "string",
            enum: [...TITLE_APPROACHES],
          },
        },
        required: ["title", "approach"],
      },
    },
  },
  required: ["suggestions"],
} as const;

function assertLiveAllowed(): void {
  const automated =
    process.env.NODE_ENV === "test" ||
    process.env.npm_lifecycle_event === "test" ||
    process.argv.includes("--test") ||
    process.execArgv.includes("--test");
  if (automated) {
    throw new TitleSuggestionError(
      "Les tests automatisés ne contactent pas OpenAI.",
      409
    );
  }
}

function cleanTitle(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value
    .replace(/\u0000/g, "")
    .replace(/^["«»']+|["«»']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length < 8 || cleaned.length > 180) {
    return null;
  }
  return cleaned;
}

function buildPrompt(input: {
  subject: string;
  angle: string | null;
  audience: string | null;
  objective: string | null;
  seoKeywords: string | null;
  language: LanguageCode | null;
}): string {
  const language =
    languageLabel(input.language) ??
    (input.language ? input.language : "français");
  const lines = [
    "Propose exactement 5 titres d’articles de blog professionnels pour Naxialis.",
    `Langue de rédaction : ${language}.`,
    "",
    "Sujet :",
    input.subject,
  ];
  if (input.angle) {
    lines.push("", "Angle éditorial :", input.angle);
  }
  if (input.audience) {
    lines.push("", "Public cible :", input.audience);
  }
  if (input.objective) {
    lines.push("", "Objectif éditorial :", input.objective);
  }
  if (input.seoKeywords) {
    lines.push("", "Mots-clés suggérés (sans bourrage) :", input.seoKeywords);
  }
  lines.push(
    "",
    "Contraintes :",
    "- Exactement 5 titres distincts, naturels et pertinents.",
    "- Varier les approches quand c’est adapté : tutoriel, guide, liste, comparaison, analyse.",
    "- Ne force pas une comparaison si le sujet ne s’y prête pas.",
    "- Pas de clickbait, pas de promesses non vérifiées, pas de bourrage SEO.",
    "- Chaque entrée a un champ approach parmi : tutoriel, guide, comparaison, analyse, liste.",
    "- Réponds uniquement via le schéma JSON demandé."
  );
  return lines.join("\n");
}

export function normalizeTitleSuggestions(
  raw: unknown
): TitleSuggestion[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TitleSuggestionError("Réponse de suggestions invalide.", 502);
  }
  const suggestions = (raw as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(suggestions) || suggestions.length !== TITLE_SUGGESTION_COUNT) {
    throw new TitleSuggestionError(
      "Le modèle n’a pas renvoyé cinq propositions.",
      502
    );
  }

  const seen = new Set<string>();
  const normalized: TitleSuggestion[] = [];
  for (const item of suggestions) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new TitleSuggestionError("Proposition de titre invalide.", 502);
    }
    const record = item as Record<string, unknown>;
    const title = cleanTitle(record.title);
    const approachRaw =
      typeof record.approach === "string" ? record.approach.trim() : "";
    if (!title || !isTitleApproach(approachRaw)) {
      throw new TitleSuggestionError("Proposition de titre invalide.", 502);
    }
    const key = title.toLocaleLowerCase("fr-FR");
    if (seen.has(key)) {
      throw new TitleSuggestionError(
        "Des propositions de titres sont en double.",
        502
      );
    }
    seen.add(key);
    normalized.push({ title, approach: approachRaw });
  }
  return normalized;
}

export async function suggestEditorialTitles(input: {
  subject: unknown;
  editorial?: Pick<
    EditorialContext,
    "angle" | "audience" | "objective" | "seoKeywords" | "language"
  > | null;
}): Promise<{ suggestions: TitleSuggestion[]; model: string }> {
  const subject = parseSubject(input.subject);
  if (!tryAcquireTitleSuggestionSlot()) {
    throw new TitleSuggestionError(
      "Trop de demandes de suggestions simultanées. Réessayez dans un instant.",
      429
    );
  }

  try {
    assertLiveAllowed();
    const prompt = buildPrompt({
      subject,
      angle: input.editorial?.angle ?? null,
      audience: input.editorial?.audience ?? null,
      objective: input.editorial?.objective ?? null,
      seoKeywords: input.editorial?.seoKeywords ?? null,
      language: input.editorial?.language ?? null,
    });

    const response = await openai.responses.create({
      model: TITLE_SUGGESTION_MODEL,
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "editorial_title_suggestions",
          strict: true,
          schema: SUGGESTION_SCHEMA,
        },
      },
    });

    const text = response.output_text?.trim();
    if (!text) {
      throw new TitleSuggestionError("Réponse de suggestions vide.", 502);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new TitleSuggestionError(
        "Réponse de suggestions illisible.",
        502
      );
    }

    return {
      suggestions: normalizeTitleSuggestions(parsed),
      model: TITLE_SUGGESTION_MODEL,
    };
  } catch (error) {
    if (error instanceof TitleSuggestionError) {
      throw error;
    }
    throw new TitleSuggestionError(
      "La suggestion de titres a échoué. Réessayez plus tard.",
      502
    );
  } finally {
    releaseTitleSuggestionSlot();
  }
}
