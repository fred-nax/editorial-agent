import {
  categoryToLegacyKind,
  normalizeDomain,
  type ExtractedEntity,
  type MentionKind,
} from "./constants";
import { enrichExtractedEntity } from "./classify";
import {
  brandDomainVariants,
  brandNameVariants,
  isTargetBrandEntity,
  type BrandIdentity,
} from "./brand-identity";
import { extractEntityCandidates } from "./extract";
import {
  entityNormalizedKey,
  identitiesMatch,
  matchesAlias,
} from "./resolve";

export type { BrandIdentity } from "./brand-identity";
export {
  brandDomainVariants,
  brandNameVariants,
  isTargetBrandEntity,
} from "./brand-identity";

/**
 * Correspondance de noms stricte (égalité normalisée / alias).
 * PAS d’inclusion lexicale — trop agressive pour la déduplication.
 */
export function namesMatch(left: string, right: string): boolean {
  const a = entityNormalizedKey(left);
  const b = entityNormalizedKey(right);
  if (!a || !b) {
    return false;
  }
  return a === b;
}

/**
 * Extraction heuristique locale (tests / réanalyse / fallback).
 * Délègue à extract.ts — filtre les génériques.
 */
export function detectMentionsHeuristically(input: {
  text: string;
  brand: BrandIdentity;
  citations?: Array<{ url: string; domain?: string | null; title?: string | null }>;
  campaignSubject?: string | null;
  historicalNames?: Array<{
    name: string;
    domain?: string | null;
    rawName?: string | null;
    mentionKind?: MentionKind;
    excerpt?: string | null;
    categoryManual?: boolean;
    lockedCategory?: ExtractedEntity["category"] | null;
  }>;
}): ExtractedEntity[] {
  // Validation commune différée à analyzeVisibilityResponse / reanalyze
  // pour éviter une double passe ; extract reste pur.
  return extractEntityCandidates(input).entities;
}

/**
 * Déduplique les observations d’une même réponse :
 * une seule entrée par (entité, mentionKind).
 */
export function dedupeExtractedEntities(
  entities: ExtractedEntity[]
): ExtractedEntity[] {
  const map = new Map<string, ExtractedEntity>();
  for (const entity of entities) {
    const key = `${entityNormalizedKey(entity.name)}|${entity.mentionKind}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, entity);
      continue;
    }
    if ((entity.confidence ?? 0) > (existing.confidence ?? 0)) {
      map.set(key, {
        ...entity,
        rawName: existing.rawName ?? entity.rawName,
      });
    }
  }
  return [...map.values()];
}

/**
 * Ré-applique la classification sur des entités déjà extraites
 * (réanalyse locale sans nouvel appel web).
 */
export function reclassifyEntities(
  entities: Array<{
    name: string;
    domain?: string | null;
    mentionKind: MentionKind;
    excerpt?: string | null;
    rawName?: string | null;
    appearanceOrder?: number | null;
    confidence?: number | null;
    categoryManual?: boolean;
    lockedCategory?: ExtractedEntity["category"] | null;
  }>,
  brand: BrandIdentity,
  campaignSubject?: string | null
): ExtractedEntity[] {
  return dedupeExtractedEntities(
    entities.map((entity) => {
      if (entity.categoryManual && entity.lockedCategory) {
        return {
          name: entity.name,
          rawName: entity.rawName ?? entity.name,
          domain: entity.domain,
          kind: categoryToLegacyKind(entity.lockedCategory),
          category: entity.lockedCategory,
          categoryConfidence: 1,
          categoryJustification: "Classification manuelle verrouillée.",
          mentionKind: entity.mentionKind,
          appearanceOrder: entity.appearanceOrder,
          excerpt: entity.excerpt,
          confidence: entity.confidence,
        };
      }
      return enrichExtractedEntity(
        {
          name: entity.name,
          rawName: entity.rawName ?? entity.name,
          domain: entity.domain,
          mentionKind: entity.mentionKind,
          appearanceOrder: entity.appearanceOrder,
          excerpt: entity.excerpt,
          confidence: entity.confidence,
        },
        brand,
        campaignSubject
      );
    })
  );
}

export function parseAliasList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 30);
  }
  if (typeof value === "string") {
    return value
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 30);
  }
  return [];
}

export function parseKnownCompetitors(
  value: unknown
): Array<{ name: string; domain?: string | null }> {
  if (!Array.isArray(value)) {
    if (typeof value === "string") {
      return value
        .split(/[,;\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((name) => ({ name, domain: null }))
        .slice(0, 30);
    }
    return [];
  }
  const out: Array<{ name: string; domain?: string | null }> = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      out.push({ name: item.trim(), domain: null });
    } else if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const name = typeof record.name === "string" ? record.name.trim() : "";
      if (!name) {
        continue;
      }
      out.push({
        name,
        domain:
          typeof record.domain === "string"
            ? normalizeDomain(record.domain)
            : null,
      });
    }
    if (out.length >= 30) {
      break;
    }
  }
  return out;
}

export { identitiesMatch, entityNormalizedKey, matchesAlias };
