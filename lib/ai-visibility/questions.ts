import { openai } from "../openai";
import { extractJsonArray } from "../seo/validate";
import {
  DEFAULT_MODEL,
  QUESTION_INTENTS,
  type QuestionIntent,
} from "./constants";

export type GeneratedQuestion = {
  text: string;
  intent: QuestionIntent;
};

function asIntent(value: unknown): QuestionIntent {
  if (typeof value === "string" && QUESTION_INTENTS.includes(value as QuestionIntent)) {
    return value as QuestionIntent;
  }
  return "information";
}

/**
 * Génère des questions GEO neutres (sans forcer le nom de la marque).
 */
export async function generateVisibilityQuestions(input: {
  subject: string;
  brandName: string;
  sector?: string | null;
  country: string;
  language: string;
  count: number;
  instructions?: string | null;
}): Promise<GeneratedQuestion[]> {
  const prompt = [
    "Tu es un analyste GEO. Génère des questions que poseraient de vrais prospects à une IA.",
    `Sujet : « ${input.subject} ».`,
    `Contexte marché : ${input.country}, langue ${input.language}.`,
    input.sector ? `Secteur : ${input.sector}.` : null,
    `Marque étudiée (ne pas l’insérer systématiquement dans les questions) : ${input.brandName}.`,
    `Génère exactement ${input.count} questions DISTINCTES et NEUTRES.`,
    "Diversifie les intentions : information, comparison, provider_search, recommendation, purchase.",
    "Pas de formulations qui orientent artificiellement vers la marque cible.",
    "Pas de statistiques inventées.",
    input.instructions
      ? `Consignes utilisateur (paramètres) : ${input.instructions}`
      : null,
    "Retourne UNIQUEMENT un JSON array d’objets {text, intent}.",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await openai.responses.create({
    model: DEFAULT_MODEL,
    input: prompt,
  });

  const text =
    typeof response.output_text === "string" ? response.output_text : "";
  const parsed = extractJsonArray(text);
  if (!Array.isArray(parsed)) {
    throw new Error("Impossible d’extraire les questions générées.");
  }

  const out: GeneratedQuestion[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const q =
      typeof record.text === "string"
        ? record.text.trim()
        : typeof record.question === "string"
          ? record.question.trim()
          : "";
    if (!q) {
      continue;
    }
    out.push({
      text: q.slice(0, 400),
      intent: asIntent(record.intent),
    });
    if (out.length >= input.count) {
      break;
    }
  }

  if (out.length === 0) {
    throw new Error("Aucune question valide générée.");
  }

  return out.slice(0, input.count);
}

/** Diversité d’intentions (testable sans IA). */
export function intentDiversityScore(intents: string[]): number {
  return new Set(intents.filter(Boolean)).size;
}

/**
 * Graines de questions neutres (tests / fallback hors production).
 * Ne force pas le nom de la marque dans le texte.
 */
export function buildNeutralQuestionSeeds(input: {
  subject: string;
  count: number;
}): GeneratedQuestion[] {
  const subject = input.subject.trim() || "ce sujet";
  const seeds: GeneratedQuestion[] = [
    {
      text: `Qu’est-ce que ${subject} et à qui s’adresse cette approche ?`,
      intent: "information",
    },
    {
      text: `Quelles solutions comparer pour ${subject} ?`,
      intent: "comparison",
    },
    {
      text: `Quelle entreprise ou agence peut accompagner sur ${subject} ?`,
      intent: "provider_search",
    },
    {
      text: `Que recommande-t-on comme prestataire pour ${subject} ?`,
      intent: "recommendation",
    },
    {
      text: `Combien coûte typiquement ${subject} pour une PME ?`,
      intent: "purchase",
    },
    {
      text: `Quels critères utiliser pour choisir une offre liée à ${subject} ?`,
      intent: "purchase",
    },
    {
      text: `Quelles alternatives existent autour de ${subject} ?`,
      intent: "comparison",
    },
    {
      text: `Comment démarrer un projet de ${subject} de façon sécurisée ?`,
      intent: "information",
    },
    {
      text: `Qui propose des services spécialisés sur ${subject} en France ?`,
      intent: "provider_search",
    },
    {
      text: `Quels retours d’expérience existent sur ${subject} ?`,
      intent: "recommendation",
    },
  ];
  const count = Math.max(1, Math.min(20, input.count));
  const out: GeneratedQuestion[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(seeds[i % seeds.length]!);
  }
  return out;
}
