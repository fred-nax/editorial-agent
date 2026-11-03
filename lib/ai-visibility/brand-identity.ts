import { normalizeDomain, type ExtractedEntity } from "./constants";
import {
  entityNormalizedKey,
  matchesAlias,
} from "./resolve";

export type BrandIdentity = {
  name: string;
  primaryDomain: string;
  aliases?: string[] | null;
  domainAliases?: string[] | null;
  knownCompetitors?: Array<{ name: string; domain?: string | null }> | null;
  description?: string | null;
  sector?: string | null;
  products?: string | null;
};

export function brandNameVariants(brand: BrandIdentity): string[] {
  const list = [brand.name, ...(brand.aliases ?? [])];
  return [...new Set(list.map(entityNormalizedKey).filter(Boolean))];
}

export function brandDomainVariants(brand: BrandIdentity): string[] {
  const list = [brand.primaryDomain, ...(brand.domainAliases ?? [])];
  return [...new Set(list.map(normalizeDomain).filter(Boolean))];
}

/**
 * Identité marque cible par nom / alias / domaine — pas par category seule.
 * GEO 1.1.4 : `category === "target_brand"` n’est plus une preuve.
 */
export function isTargetBrandEntity(
  entity: Pick<ExtractedEntity, "name" | "domain" | "category">,
  brand: BrandIdentity
): boolean {
  const nameHit =
    brandNameVariants(brand).includes(entityNormalizedKey(entity.name)) ||
    matchesAlias(entity.name, brand.aliases);
  if (nameHit) {
    return true;
  }
  if (!entity.domain) {
    return false;
  }
  const domain = normalizeDomain(entity.domain);
  return brandDomainVariants(brand).some(
    (alias) => domain === alias || domain.endsWith(`.${alias}`)
  );
}
