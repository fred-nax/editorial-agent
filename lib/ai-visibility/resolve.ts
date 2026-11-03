import { normalizeDomain } from "./constants";

/**
 * Résolution / normalisation d’entités GEO 1.1.
 * Règle critique : similarité lexicale seule ≠ fusion.
 */

export type ResolvedIdentity = {
  rawName: string;
  canonicalName: string;
  normalizedKey: string;
  domain: string | null;
  parentKey: string | null;
  aliases: string[];
};

/**
 * Alias typographiques connus (équivalents, pas des fusions abusives).
 * Le premier élément est la forme canonique utilisée dans les dictionnaires.
 */
const ALIAS_GROUPS: string[][] = [
  ["revolve ai", "revolve ia"],
  ["openai", "open ai"],
  ["chatgpt", "chat gpt"],
  ["hubspot", "hub spot"],
  ["salesforce", "sales force"],
  ["bpifrance", "bpi france"],
  ["microsoft 365", "ms 365", "office 365"],
];

/** Toutes les formes équivalentes d’une clé (pour lookup dictionnaires). */
export function expandAliasKeys(key: string): string[] {
  for (const group of ALIAS_GROUPS) {
    if (group.includes(key)) {
      return [...group];
    }
  }
  return [key];
}

/**
 * Produits distincts rattachés à un éditeur parent (pas interchangeables).
 * Clé = nom normalisé du produit → parent normalisé.
 */
const PRODUCT_PARENTS: Record<string, string> = {
  "microsoft 365": "microsoft",
  "office 365": "microsoft",
  azure: "microsoft",
  "microsoft azure": "microsoft",
  "microsoft teams": "microsoft",
  "dynamics 365": "microsoft",
  "google cloud": "google",
  "google workspace": "google",
  gmail: "google",
  gemini: "google",
  chatgpt: "openai",
  "gpt 4": "openai",
  "gpt 5": "openai",
};

export function normalizeEntityName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(inc|ltd|sas|sarl|sa|gmbh|llc|corp|corporation)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clé stable pour lookup (alias groupés → forme canonique du groupe). */
export function entityNormalizedKey(value: string): string {
  let key = normalizeEntityName(value);
  // Variantes IA / AI uniquement pour tokens isolés ou suffixes connus
  key = key.replace(/\bia\b/g, "ai");
  for (const group of ALIAS_GROUPS) {
    if (group.includes(key)) {
      return group[0]!;
    }
  }
  return key;
}

export function displayCanonicalName(rawName: string): string {
  const key = entityNormalizedKey(rawName);
  for (const group of ALIAS_GROUPS) {
    if (group.includes(key) || group.includes(normalizeEntityName(rawName))) {
      // Prefers a readable title-ish form from the first raw-looking alias
      const preferred = group[0]!;
      return preferred
        .split(" ")
        .map((part) =>
          part === "ai" || part === "ia"
            ? part.toUpperCase()
            : part.charAt(0).toUpperCase() + part.slice(1)
        )
        .join(" ");
    }
  }
  return rawName.trim().replace(/\s+/g, " ");
}

export function resolveParentKey(normalizedKey: string): string | null {
  for (const key of expandAliasKeys(normalizedKey)) {
    if (PRODUCT_PARENTS[key]) {
      return PRODUCT_PARENTS[key]!;
    }
  }
  return null;
}

/**
 * Correspondance stricte d’identité.
 * - même clé normalisée (après alias)
 * - OU même domaine vérifié (et pas un produit distinct)
 * Ne fusionne PAS sur simple inclusion lexicale.
 */
export function identitiesMatch(
  left: { name: string; domain?: string | null },
  right: { name: string; domain?: string | null }
): boolean {
  const leftKey = entityNormalizedKey(left.name);
  const rightKey = entityNormalizedKey(right.name);
  if (leftKey && rightKey && leftKey === rightKey) {
    return true;
  }

  const leftDomain = left.domain ? normalizeDomain(left.domain) : "";
  const rightDomain = right.domain ? normalizeDomain(right.domain) : "";
  if (leftDomain && rightDomain && leftDomain === rightDomain) {
    // Domaine identique mais produits distincts (ex. azure vs microsoft 365)
    const leftParent = resolveParentKey(leftKey);
    const rightParent = resolveParentKey(rightKey);
    if (leftParent || rightParent) {
      // Même éditeur via domaine ≠ même produit
      return leftKey === rightKey;
    }
    return true;
  }

  return false;
}

/** Alias exact (liste) — pas de fuzzy. */
export function matchesAlias(
  name: string,
  aliases: string[] | null | undefined
): boolean {
  const key = entityNormalizedKey(name);
  if (!key) {
    return false;
  }
  return (aliases ?? []).some((alias) => entityNormalizedKey(alias) === key);
}

export function resolveIdentity(input: {
  name: string;
  domain?: string | null;
  aliases?: string[] | null;
}): ResolvedIdentity {
  const rawName = input.name.trim();
  const normalizedKey = entityNormalizedKey(rawName);
  const domain = input.domain ? normalizeDomain(input.domain) : null;
  const parentKey = resolveParentKey(normalizedKey);
  const aliases = [
    ...new Set(
      [rawName, ...(input.aliases ?? [])]
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ];

  return {
    rawName,
    canonicalName: displayCanonicalName(rawName),
    normalizedKey,
    domain,
    parentKey,
    aliases,
  };
}

/**
 * Fusionne deux listes d’alias sans perdre les formes brutes.
 */
export function mergeAliases(
  existing: unknown,
  incoming: string[]
): string[] {
  const current = Array.isArray(existing)
    ? existing.filter((item): item is string => typeof item === "string")
    : [];
  return [...new Set([...current, ...incoming].map((item) => item.trim()).filter(Boolean))].slice(
    0,
    40
  );
}
