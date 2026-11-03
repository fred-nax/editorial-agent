import { normalizeEntityName } from "./resolve";

/**
 * Correspondance de noms GEO 1.1.2 — limites lexicales sur texte normalisé.
 * Ne jamais utiliser String.includes pour une identité.
 */

/** Retire URL et paramètres de tracking du corps (ne constituent pas une mention). */
export function stripUrlsAndTracking(text: string): string {
  return text
    .replace(/https?:\/\/[^\s)\]]+/gi, " ")
    .replace(/www\.[^\s)\]]+/gi, " ")
    .replace(/[?&]utm_[^=\s&\])]+[=][^\s&\])]+/gi, " ")
    .replace(/\butm_source=[^\s&\])]+/gi, " ");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * true si `name` apparaît comme séquence de tokens bornée dans `text`
 * (après normalisation accents/casse). `sage` ∉ `usage`, `openai` ∉ milieu de mot.
 */
export function nameMatchesBounded(name: string, text: string): boolean {
  const needle = normalizeEntityName(name);
  if (needle.length < 3) {
    return false;
  }
  const hay = normalizeEntityName(text);
  if (!hay) {
    return false;
  }
  const tokenPattern = needle
    .split(/\s+/)
    .filter(Boolean)
    .map(escapeRegex)
    .join("\\s+");
  if (!tokenPattern) {
    return false;
  }
  // Bornes : pas de lettre/chiffre adjacent (équivalent \b sur forme ASCII normalisée)
  const re = new RegExp(`(?:^|[^a-z0-9])${tokenPattern}(?:[^a-z0-9]|$)`);
  return re.test(hay);
}

export function findBoundedNameIndex(
  name: string,
  text: string
): { index: number; length: number } | null {
  const needle = normalizeEntityName(name);
  if (needle.length < 3) {
    return null;
  }
  // Recherche approximative dans le texte original (insensible accents via NFD strip local)
  const folded = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const foldedNeedle = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const tokens = foldedNeedle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map(escapeRegex);
  if (tokens.length === 0) {
    return null;
  }
  const re = new RegExp(
    `(?<![A-Za-z0-9])${tokens.join("\\s+")}(?![A-Za-z0-9])`,
    "i"
  );
  const match = re.exec(folded);
  if (!match || match.index == null) {
    return null;
  }
  return { index: match.index, length: match[0].length };
}

export type NamePresence = {
  present: boolean;
  inBody: boolean;
  inCitationTitles: boolean;
  inCitationDomains: boolean;
  /** true si uniquement trouvé dans une URL / query (ne compte pas comme mention corps). */
  onlyInUrlNoise: boolean;
};

/**
 * Sépare corps / titres de sources / domaines — jamais les query strings d’URL.
 */
export function verifyNamePresence(input: {
  name: string;
  bodyText: string;
  citations?: Array<{ url: string; title?: string | null; domain?: string | null }>;
}): NamePresence {
  const body = stripUrlsAndTracking(input.bodyText);
  const inBody = nameMatchesBounded(input.name, body);

  let inCitationTitles = false;
  let inCitationDomains = false;
  for (const citation of input.citations ?? []) {
    if (citation.title && nameMatchesBounded(input.name, citation.title)) {
      inCitationTitles = true;
    }
    if (citation.domain && nameMatchesBounded(input.name, citation.domain)) {
      inCitationDomains = true;
    }
  }

  // Détection bruit URL (diagnostic) — ne crée pas de présence positive
  const onlyInUrlNoise =
    !inBody &&
    !inCitationTitles &&
    !inCitationDomains &&
    nameMatchesBounded(input.name, input.bodyText) &&
    !nameMatchesBounded(input.name, body);

  return {
    present: inBody || inCitationTitles || inCitationDomains,
    inBody,
    inCitationTitles,
    inCitationDomains,
    onlyInUrlNoise,
  };
}
