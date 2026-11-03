import {
  brandNameVariants,
  type BrandIdentity,
} from "./brand-identity";
import { enrichExtractedEntity } from "./classify";
import {
  type ExtractedEntity,
  type VisibilityCitation,
} from "./constants";
import { collapseNameFragments } from "./extract";
import {
  nameMatchesBounded,
  stripUrlsAndTracking,
  verifyNamePresence,
} from "./match-name";
import { entityNormalizedKey } from "./resolve";

function dedupeByNameAndKind(entities: ExtractedEntity[]): ExtractedEntity[] {
  const map = new Map<string, ExtractedEntity>();
  for (const entity of entities) {
    const key = `${entityNormalizedKey(entity.name)}|${entity.mentionKind}`;
    const existing = map.get(key);
    if (!existing || (entity.confidence ?? 0) > (existing.confidence ?? 0)) {
      map.set(key, entity);
    }
  }
  return [...map.values()];
}

/**
 * GEO 1.1.4 — validation commune post-extraction (analyse LLM ou heuristique).
 * Autorité : classification locale + preuves dans le corps de la réponse source.
 */

const PROMPT_LEAK_PATTERNS = [
  /marque\s+cible\s*:/i,
  /sujet\s+de\s+campagne\s*:/i,
  /offres\s+de\s+la\s+marque\s*:/i,
  /extrais\s+les\s+marques/i,
  /retourne\s+uniquement\s+un\s+json/i,
];

/** Extrait contaminé par les instructions d’analyse (pas une preuve de réponse). */
export function isAnalysisPromptLeak(excerpt: string | null | undefined): boolean {
  if (!excerpt) {
    return false;
  }
  return PROMPT_LEAK_PATTERNS.some((pattern) => pattern.test(excerpt));
}

/**
 * L’excerpt doit être ancré dans le texte source (corps), pas dans le prompt.
 */
export function isExcerptGroundedInSource(
  excerpt: string | null | undefined,
  sourceText: string
): boolean {
  if (!excerpt || !excerpt.trim()) {
    return true;
  }
  if (isAnalysisPromptLeak(excerpt)) {
    return false;
  }
  const body = stripUrlsAndTracking(sourceText);
  const needle = excerpt.trim().slice(0, 120);
  // Correspondance bornée sur un fragment significatif de l’extrait
  if (needle.length >= 12 && nameMatchesBounded(needle.slice(0, 80), body)) {
    return true;
  }
  // Fallback : inclusion normalisée (espaces / accents)
  const norm = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  const bodyNorm = norm(body);
  const excerptNorm = norm(needle);
  if (excerptNorm.length < 8) {
    return bodyNorm.includes(excerptNorm);
  }
  // Prend une fenêtre centrale pour tolérer troncature
  const window = excerptNorm.slice(0, Math.min(60, excerptNorm.length));
  return bodyNorm.includes(window);
}

/** Présence de la marque (ou alias) dans le corps réel de la réponse. */
export function brandMentionedInResponseBody(
  brand: BrandIdentity,
  responseText: string
): boolean {
  const body = stripUrlsAndTracking(responseText);
  for (const alias of [brand.name, ...(brand.aliases ?? [])]) {
    if (nameMatchesBounded(alias, body)) {
      return true;
    }
  }
  return false;
}

export function isAuthorizedDirectCompetitor(
  name: string,
  domain: string | null | undefined,
  brand: BrandIdentity
): boolean {
  const key = entityNormalizedKey(name);
  for (const competitor of brand.knownCompetitors ?? []) {
    if (entityNormalizedKey(competitor.name) === key) {
      return true;
    }
    if (
      competitor.domain &&
      domain &&
      competitor.domain.toLowerCase() === domain.toLowerCase()
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Recalcule la catégorie finale : le LLM n’a pas d’autorité sur
 * target_brand / direct_competitor / indirect_competitor.
 */
export function finalizeEntityCategory(
  entity: ExtractedEntity,
  brand: BrandIdentity,
  campaignSubject?: string | null
): ExtractedEntity {
  return enrichExtractedEntity(entity, brand, campaignSubject);
}

/**
 * Pipeline unique post-extraction — à appeler après heuristique et/ou LLM.
 */
export function validateExtractedEntities(input: {
  entities: ExtractedEntity[];
  brand: BrandIdentity;
  responseText: string;
  citations?: VisibilityCitation[];
  campaignSubject?: string | null;
}): ExtractedEntity[] {
  const brandInBody = brandMentionedInResponseBody(
    input.brand,
    input.responseText
  );
  const brandKeys = new Set(brandNameVariants(input.brand));

  const out: ExtractedEntity[] = [];

  for (const raw of input.entities) {
    let entity = finalizeEntityCategory(
      raw,
      input.brand,
      input.campaignSubject
    );

    // Excerpt non ancré → invalider la preuve textuelle
    if (
      entity.excerpt &&
      !isExcerptGroundedInSource(entity.excerpt, input.responseText)
    ) {
      entity = {
        ...entity,
        excerpt: null,
        confidence: Math.min(entity.confidence ?? 0.5, 0.4),
      };
    }

    const isBrandName = brandKeys.has(entityNormalizedKey(entity.name));

    // Marque cible : preuve corps obligatoire
    if (entity.category === "target_brand" || isBrandName) {
      if (!brandInBody) {
        // Pas de mention textuelle réelle — ne pas créer d’observation cible
        continue;
      }
      const presence = verifyNamePresence({
        name: entity.name,
        bodyText: input.responseText,
        citations: input.citations,
      });
      if (!presence.inBody) {
        continue;
      }
      // citation_only / URL seule ≠ mention textuelle
      if (entity.mentionKind === "citation_only") {
        continue;
      }
      // Reco / négatif : excerpt doit être ancré si fourni ; kind recalculé sur corps
      if (
        entity.mentionKind === "recommendation" ||
        entity.mentionKind === "negative"
      ) {
        if (entity.excerpt && isAnalysisPromptLeak(entity.excerpt)) {
          entity = { ...entity, mentionKind: "mention", excerpt: null };
        }
      }
      entity = {
        ...entity,
        category: "target_brand",
        kind: "target_brand",
        categoryConfidence: entity.categoryConfidence ?? 0.95,
        categoryJustification:
          entity.categoryJustification ??
          "Marque cible présente dans le corps de la réponse (preuve bornée).",
      };
      out.push(entity);
      continue;
    }

    // Concurrent direct non autorisé → already handled in finalizeEntityCategory
    // Double filet
    if (
      entity.category === "direct_competitor" &&
      !isAuthorizedDirectCompetitor(entity.name, entity.domain, input.brand)
    ) {
      entity = {
        ...entity,
        category: "unknown",
        kind: "other",
        categoryConfidence: 0.35,
        categoryJustification:
          "Concurrent direct rejeté : absent de knownCompetitors et sans correction manuelle.",
      };
    }

    out.push(entity);
  }

  return collapseNameFragments(dedupeByNameAndKind(out));
}
