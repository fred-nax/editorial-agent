import { openai } from "@/lib/openai";
import { EDITORIAL_SIMILARITY_MODEL } from "./editorial-similarity-config";
import {
  releaseSimilarityAiSlot,
  tryAcquireSimilarityAiSlot,
} from "./editorial-similarity-locks";
import {
  isRapprochementKind,
  RAPPROCHEMENT_MESSAGES,
  type EditorialMatch,
  type RapprochementKind,
} from "./editorial-similarity-types";

export class EditorialSimilarityAiError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "EditorialSimilarityAiError";
    this.status = status;
  }
}

function assertLiveAllowed(): void {
  if (
    process.env.NODE_ENV === "test" ||
    process.env.npm_lifecycle_event === "test" ||
    process.env.VITEST ||
    process.env.OPENAI_BLOCK_LIVE === "1"
  ) {
    throw new EditorialSimilarityAiError(
      "Analyse IA interdite pendant les tests automatisés.",
      503
    );
  }
}

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    assessments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          wpPostId: { type: "number" },
          kind: {
            type: "string",
            enum: ["probable_duplicate", "close", "complementary"],
          },
          explanation: { type: "string" },
        },
        required: ["wpPostId", "kind", "explanation"],
      },
    },
  },
  required: ["assessments"],
} as const;

function extractOutputText(response: {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
}): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }
  const chunks: string[] = [];
  for (const item of response.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && typeof part.text === "string") {
        chunks.push(part.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

export function normalizeAiAssessments(
  raw: unknown,
  candidates: EditorialMatch[]
): EditorialMatch[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new EditorialSimilarityAiError("Réponse IA invalide.", 502);
  }
  const assessments = (raw as { assessments?: unknown }).assessments;
  if (!Array.isArray(assessments)) {
    throw new EditorialSimilarityAiError("Réponse IA invalide.", 502);
  }

  const byId = new Map(candidates.map((item) => [item.wpPostId, item]));
  const updated: EditorialMatch[] = [];
  const seen = new Set<number>();

  for (const item of assessments) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const wpPostId =
      typeof record.wpPostId === "number" ? record.wpPostId : Number.NaN;
    const kindRaw = typeof record.kind === "string" ? record.kind : "";
    const explanation =
      typeof record.explanation === "string"
        ? record.explanation.replace(/\s+/g, " ").trim()
        : "";
    if (
      !Number.isInteger(wpPostId) ||
      !isRapprochementKind(kindRaw) ||
      explanation.length < 12 ||
      explanation.length > 280 ||
      seen.has(wpPostId)
    ) {
      continue;
    }
    const base = byId.get(wpPostId);
    if (!base) {
      continue;
    }
    seen.add(wpPostId);
    const kind = kindRaw as RapprochementKind;
    updated.push({
      ...base,
      kind,
      explanation,
      message: RAPPROCHEMENT_MESSAGES[kind],
    });
  }

  if (updated.length === 0) {
    throw new EditorialSimilarityAiError(
      "L’analyse IA n’a renvoyé aucun rapprochement exploitable.",
      502
    );
  }

  const kindRank: Record<RapprochementKind, number> = {
    probable_duplicate: 0,
    close: 1,
    complementary: 2,
  };
  updated.sort(
    (left, right) =>
      kindRank[left.kind] - kindRank[right.kind] ||
      right.rankScore - left.rankScore
  );
  return updated;
}

export async function analyzeEditorialSimilarityWithAi(input: {
  subject: string;
  angle?: string | null;
  candidates: EditorialMatch[];
}): Promise<EditorialMatch[]> {
  if (input.candidates.length === 0) {
    throw new EditorialSimilarityAiError(
      "Aucun candidat local à analyser.",
      400
    );
  }
  if (!tryAcquireSimilarityAiSlot()) {
    throw new EditorialSimilarityAiError(
      "Trop d’analyses IA en cours. Réessayez dans un instant.",
      429
    );
  }

  try {
    assertLiveAllowed();

    const candidateLines = input.candidates.map((item, index) =>
      [
        `${index + 1}. wpPostId=${item.wpPostId}`,
        `titre="${item.title}"`,
        `url=${item.url}`,
        `classement_local=${item.kind}`,
        `note_locale=${item.explanation}`,
      ].join(" | ")
    );

    const response = await openai.responses.create({
      model: EDITORIAL_SIMILARITY_MODEL,
      temperature: 0.2,
      max_output_tokens: 900,
      text: {
        format: {
          type: "json_schema",
          name: "editorial_similarity",
          strict: true,
          schema: ANALYSIS_SCHEMA,
        },
      },
      input: [
        {
          role: "system",
          content: [
            "Tu es un assistant éditorial francophone.",
            "Tu compares un sujet proposé UNIQUEMENT aux candidats fournis (issus du moteur local).",
            "Tu ne peux pas inventer d’article, d’URL ou de wpPostId absent de la liste.",
            "Tu ne connais que le titre et la note locale : n’affirme jamais connaître le contenu intégral.",
            "Évalue la proximité des intentions de recherche (sécurité, confidentialité, comparatif, tutoriel, actualité, gouvernance…).",
            "Une même famille technologique (IA générative, agents IA, LLM) ne suffit pas pour close ou probable_duplicate sans intention proche.",
            "Rétrograde plutôt qu’inventer une proximité : un vocabulaire générique (sécurité, risque, entreprise) ne suffit pas.",
            "PHP / sessions WordPress / failles web ne sont pas proches de la sécurité de l’IA générative sans pont explicite.",
            "Tu peux rétrograder un faux positif local ; tu ne peux pas ajouter d’article hors liste.",
            "Classe chaque candidat : probable_duplicate | close | complementary.",
            "Explication courte en français (1 phrase), fondée sur les points communs visibles, sans pourcentage SEO.",
            "Réponds uniquement via le schéma JSON.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Sujet proposé : ${input.subject}`,
            input.angle ? `Angle : ${input.angle}` : "Angle : (non précisé)",
            "Candidats :",
            ...candidateLines,
          ].join("\n"),
        },
      ],
    });

    const text = extractOutputText(response);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new EditorialSimilarityAiError(
        "Réponse IA illisible.",
        502
      );
    }
    return normalizeAiAssessments(parsed, input.candidates);
  } catch (error) {
    if (error instanceof EditorialSimilarityAiError) {
      throw error;
    }
    throw new EditorialSimilarityAiError(
      "L’analyse IA de similarité a échoué.",
      502
    );
  } finally {
    releaseSimilarityAiSlot();
  }
}
