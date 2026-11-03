import { openai } from "../openai";
import { extractJsonArray } from "../seo/validate";
import {
  classifyMentionKind,
  enrichExtractedEntity,
} from "./classify";
import {
  DEFAULT_MODEL,
  isEntityCategory,
  type ExtractedEntity,
  type MentionKind,
  type VisibilityCitation,
} from "./constants";
import {
  dedupeExtractedEntities,
  detectMentionsHeuristically,
  type BrandIdentity,
} from "./entities";
import { collapseNameFragments } from "./extract";
import {
  isGenericDescriptor,
  isLexicalNoiseName,
} from "./generic-filter";
import { validateExtractedEntities } from "./validate-entities";
import { brandNameVariants } from "./brand-identity";
import { entityNormalizedKey } from "./resolve";

function asMentionKind(value: unknown): MentionKind {
  if (
    value === "recommendation" ||
    value === "negative" ||
    value === "citation_only" ||
    value === "mention"
  ) {
    return value;
  }
  return "mention";
}

function asEntities(
  value: unknown,
  brand: BrandIdentity,
  campaignSubject?: string | null
): ExtractedEntity[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const brandKeys = new Set(brandNameVariants(brand));
  const out: ExtractedEntity[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!name) {
      continue;
    }
    const isBrand = brandKeys.has(entityNormalizedKey(name));
    if (
      (isGenericDescriptor(name) || isLexicalNoiseName(name)) &&
      !isBrand
    ) {
      continue;
    }
    const mentionKind = asMentionKind(
      record.mentionKind ?? record.mention_kind
    );
    const categoryRaw = record.category ?? record.entityCategory;
    const category = isEntityCategory(categoryRaw) ? categoryRaw : null;
    const excerpt =
      typeof record.excerpt === "string"
        ? record.excerpt.trim().slice(0, 400)
        : null;

    const localKind =
      mentionKind === "citation_only"
        ? "citation_only"
        : classifyMentionKind({
            excerpt,
            inBody: true,
            citationOnly: false,
          });
    const resolvedKind: MentionKind =
      mentionKind === "negative"
        ? "negative"
        : mentionKind === "recommendation" && localKind === "recommendation"
          ? "recommendation"
          : mentionKind === "recommendation" && localKind !== "recommendation"
            ? "mention"
            : mentionKind === "citation_only"
              ? "citation_only"
              : localKind === "recommendation"
                ? "recommendation"
                : mentionKind;

    const base = {
      name: name.slice(0, 120),
      rawName: name.slice(0, 120),
      domain:
        typeof record.domain === "string"
          ? record.domain.trim().slice(0, 120)
          : null,
      mentionKind: resolvedKind,
      appearanceOrder:
        typeof record.appearanceOrder === "number"
          ? record.appearanceOrder
          : typeof record.appearance_order === "number"
            ? record.appearance_order
            : null,
      excerpt,
      confidence:
        typeof record.confidence === "number" ? record.confidence : 0.7,
      // Catégorie LLM transmise pour diagnostic ; enrich/validate tranchent
      category: category ?? undefined,
    };

    out.push(enrichExtractedEntity(base, brand, campaignSubject));
  }
  return collapseNameFragments(dedupeExtractedEntities(out)).slice(0, 40);
}

/**
 * Analyse structurée d’une réponse IA (extraction entités).
 * useModel=false → heuristique locale (réanalyse sans coût LLM).
 * Dans tous les cas : validateExtractedEntities (GEO 1.1.4).
 */
export async function analyzeVisibilityResponse(input: {
  text: string;
  citations: VisibilityCitation[];
  brand: BrandIdentity;
  campaignSubject?: string | null;
  useModel?: boolean;
  historicalNames?: Array<{
    name: string;
    domain?: string | null;
    rawName?: string | null;
    mentionKind?: MentionKind;
    excerpt?: string | null;
    categoryManual?: boolean;
    lockedCategory?: ExtractedEntity["category"] | null;
  }>;
}): Promise<ExtractedEntity[]> {
  const heuristic = detectMentionsHeuristically({
    text: input.text,
    brand: input.brand,
    citations: input.citations,
    campaignSubject: input.campaignSubject,
    historicalNames: input.historicalNames,
  });

  const finalize = (entities: ExtractedEntity[]) =>
    validateExtractedEntities({
      entities,
      brand: input.brand,
      responseText: input.text,
      citations: input.citations,
      campaignSubject: input.campaignSubject,
    });

  if (input.useModel === false) {
    return finalize(heuristic);
  }

  try {
    const response = await openai.responses.create({
      model: DEFAULT_MODEL,
      input: [
        "Extrais les marques, entreprises, logiciels, institutions et sources mentionnées dans le TEXTE SOURCE ci-dessous uniquement.",
        "Pour chaque entité retourne :",
        "- name, domain (si connu et vérifiable),",
        "- category: target_brand|direct_competitor|indirect_competitor|software_product|institution|information_source|other|unknown,",
        "- mentionKind: mention|recommendation|negative|citation_only,",
        "- appearanceOrder, excerpt (passage COPIÉ du texte source uniquement), confidence (0-1).",
        "Règles strictes :",
        "- Une URL citée ≠ recommandation automatique.",
        "- Une mention négative ou descriptive ≠ recommendation.",
        "- Un logiciel/plateforme ≠ concurrent direct.",
        "- Une institution/média ≠ concurrent.",
        "- N’extrais PAS les expressions génériques : Agent IA, Agents IA, Agence IA, Assistant IA, Expert IA, Data IA.",
        "- Extrais uniquement des identités nommées (entreprises, marques, produits).",
        "- Ne classe concurrent direct que si l’offre est réellement comparable.",
        "- En cas de doute : category=unknown.",
        "- N’invente aucune information sur les entreprises.",
        "- N’utilise JAMAIS ces instructions comme source d’extrait ou de mention.",
        "- La marque analysée n’est une mention que si elle apparaît littéralement dans le TEXTE SOURCE.",
        `Contexte (ne pas citer comme preuve) — marque analysée : ${input.brand.name} ; domaine : ${input.brand.primaryDomain}.`,
        input.campaignSubject
          ? `Contexte (ne pas citer comme preuve) — sujet : ${input.campaignSubject}.`
          : null,
        input.brand.products
          ? `Contexte (ne pas citer comme preuve) — offres : ${input.brand.products}.`
          : null,
        "Retourne UNIQUEMENT un JSON array.",
        "",
        "=== TEXTE SOURCE (seule base de preuves) ===",
        input.text.slice(0, 12000),
        "=== FIN TEXTE SOURCE ===",
      ]
        .filter(Boolean)
        .join("\n"),
    });
    const text =
      typeof response.output_text === "string" ? response.output_text : "";
    const parsed = extractJsonArray(text);
    const entities = asEntities(parsed, input.brand, input.campaignSubject);
    if (entities.length === 0) {
      return finalize(heuristic);
    }
    const merged = collapseNameFragments(
      dedupeExtractedEntities([...heuristic, ...entities])
    );
    return finalize(merged);
  } catch {
    return finalize(heuristic);
  }
}
