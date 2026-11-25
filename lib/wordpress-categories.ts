import type { WordPressCategory } from "@/lib/categories";
import { detectCategories as detectNaxialisCategories } from "@/lib/categories";
import { decodeHtmlEntities } from "@/lib/seo/normalize";
import {
  resolveWordPressConfig,
  type WordPressConfig,
} from "@/lib/settings/app-settings";
import {
  fetchWordPressNoRedirect,
  normalizeWpOrigin,
} from "@/lib/settings/wp-url";

/**
 * Texte catégorie WP → texte brut (entités HTML décodées).
 * Idempotent ; n’interprète pas de balises HTML.
 */
export function normalizeWordPressCategoryText(
  value: string | null | undefined
): string {
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }
  return decodeHtmlEntities(value);
}

export type SyncedWpCategory = {
  id: number;
  name: string;
  slug: string;
  count: number;
  description: string;
  /** Parent WP category id (0/null = racine). */
  parent?: number | null;
};

export type WordPressCategoryConfig = {
  categories: SyncedWpCategory[];
  allowedIds: number[];
  defaultCategoryId: number | null;
  syncedAt: string | null;
  origin: string | null;
};

export type ScoredCategoryMatch = {
  categoryId: number;
  name: string;
  keywords: string[];
  score: number;
  specificity: number;
};

/** Plafond mode dynamique (une 4ᵉ uniquement via règle explicite future). */
export const MAX_DYNAMIC_CATEGORIES = 3;

/** Score minimal pour retenir une catégorie (classement interne, pas un % SEO). */
export const MIN_DYNAMIC_CATEGORY_SCORE = 40;

type WpRestCategory = {
  id?: number;
  name?: string;
  slug?: string;
  count?: number;
  description?: string;
  parent?: number;
};

/** Termes trop génériques pour justifier une attribution à eux seuls. */
const GENERIC_TOKENS = new Set([
  "outil",
  "outils",
  "solution",
  "solutions",
  "entreprise",
  "entreprises",
  "contenu",
  "contenus",
  "web",
  "site",
  "sites",
  "article",
  "articles",
  "guide",
  "guides",
  "comment",
  "mettre",
  "place",
  "gestion",
  "comprendre",
  "actualite",
  "actualites",
  "actu",
  "autre",
  "autres",
  "general",
  "generale",
  "base",
  "bases",
  "pour",
  "avec",
  "dans",
  "sur",
  "des",
  "les",
  "une",
  "aux",
  "par",
  "et",
  "ou",
  "plus",
  "tout",
  "tous",
  "cette",
  "votre",
  "notre",
  "faire",
  "etre",
  "avoir",
  "deconnecter",
  "connecter",
  "connexion",
  "decoule",
  "decouple",
]);

function authHeader(username: string, appPassword: string): string {
  return `Basic ${Buffer.from(`${username}:${appPassword}`).toString("base64")}`;
}

export function parseSyncedCategoriesJson(
  raw: string | null | undefined
): SyncedWpCategory[] {
  if (!raw?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    const out: SyncedWpCategory[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const row = item as Record<string, unknown>;
      const id = Number(row.id);
      if (!Number.isInteger(id) || id <= 0) {
        continue;
      }
      const parentRaw = Number(row.parent);
      out.push({
        id,
        name: normalizeWordPressCategoryText(
          typeof row.name === "string" ? row.name : `Catégorie ${id}`
        ),
        slug: typeof row.slug === "string" ? row.slug : "",
        count: typeof row.count === "number" ? row.count : 0,
        description: normalizeWordPressCategoryText(
          typeof row.description === "string" ? row.description : ""
        ),
        parent:
          Number.isInteger(parentRaw) && parentRaw > 0 ? parentRaw : null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function parseAllowedCategoryIds(
  raw: string | null | undefined
): number[] {
  if (!raw?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    const ids: number[] = [];
    const seen = new Set<number>();
    for (const value of parsed) {
      const id = Number(value);
      if (!Number.isInteger(id) || id <= 0 || seen.has(id)) {
        continue;
      }
      seen.add(id);
      ids.push(id);
    }
    return ids;
  } catch {
    return [];
  }
}

/**
 * Refuse tout ID absent du snapshot ou provenant d'une autre origin WP.
 */
export function filterCategoryIdsForCurrentSite(input: {
  ids: number[];
  categories: SyncedWpCategory[];
  categoriesOrigin: string | null;
  effectiveWpOrigin: string | null;
}): number[] {
  if (
    !input.categoriesOrigin ||
    !input.effectiveWpOrigin ||
    input.categoriesOrigin !== input.effectiveWpOrigin
  ) {
    return [];
  }
  const known = new Set(input.categories.map((item) => item.id));
  return input.ids.filter((id) => known.has(id));
}

export function assertCategoryIdsBelongToSite(input: {
  ids: number[];
  categories: SyncedWpCategory[];
  categoriesOrigin: string | null;
  effectiveWpOrigin: string | null;
}): void {
  if (input.ids.length === 0) {
    return;
  }
  if (
    !input.categoriesOrigin ||
    !input.effectiveWpOrigin ||
    input.categoriesOrigin !== input.effectiveWpOrigin
  ) {
    throw new Error(
      "Les catégories synchronisées ne correspondent pas au WordPress actuellement configuré. Relancez la synchronisation."
    );
  }
  const known = new Set(input.categories.map((item) => item.id));
  const unknown = input.ids.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new Error(
      `Identifiant(s) de catégorie inconnu(s) pour ce WordPress : ${unknown.join(", ")}.`
    );
  }
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function stemToken(token: string): string {
  if (token.length > 4 && token.endsWith("s")) {
    return token.slice(0, -1);
  }
  return token;
}

function tokenSet(tokens: string[]): Set<string> {
  const set = new Set<string>();
  for (const token of tokens) {
    set.add(token);
    set.add(stemToken(token));
  }
  return set;
}

function isGenericToken(token: string): boolean {
  return GENERIC_TOKENS.has(token) || GENERIC_TOKENS.has(stemToken(token));
}

function distinctiveTokens(tokens: string[]): string[] {
  return tokens.filter((token) => !isGenericToken(token));
}

function tokensLooselyMatch(a: string, b: string): boolean {
  if (a === b || stemToken(a) === stemToken(b)) {
    return true;
  }
  // Préfixe commun uniquement (automatiser ↔ automatisation).
  // Jamais de includes() au milieu du mot (sinon « comment » ⊂ « woocommerce »).
  if (a.length >= 6 && b.length >= 6) {
    return a.slice(0, 6) === b.slice(0, 6);
  }
  return false;
}

/** Sigles / racines techniques assez distinctifs pour un match partiel de libellé composé. */
const STRONG_TECH_HEADS = new Set(["api", "seo", "rag", "erp", "pim", "llm"]);

function subjectHasToken(subjectTokens: Set<string>, token: string): boolean {
  if (subjectTokens.has(token) || subjectTokens.has(stemToken(token))) {
    return true;
  }
  for (const subjectToken of subjectTokens) {
    if (tokensLooselyMatch(subjectToken, token)) {
      return true;
    }
  }
  return false;
}

function subjectHasPhrase(haystack: string, phrase: string): boolean {
  const normalizedPhrase = normalizeText(phrase);
  if (normalizedPhrase.length < 2) {
    return false;
  }
  return ` ${haystack} `.includes(` ${normalizedPhrase} `);
}

/**
 * Score interne déterministe (pas un % SEO).
 * Privilégie expressions exactes / multi-mots ; pénalise les matches partiels
 * sur catégories multi-mots (ex. seul « ia » dans « IA prédictive »).
 */
export function scoreCategoryAgainstSubject(input: {
  subject: string;
  title?: string | null;
  category: SyncedWpCategory;
}): { score: number; specificity: number; matchedTokens: string[] } {
  const subjectNorm = normalizeText(input.subject);
  const titleNorm = input.title ? normalizeText(input.title) : "";
  const haystack = titleNorm ? `${subjectNorm} ${titleNorm}` : subjectNorm;
  const subjectTokens = tokenSet(tokenize(haystack));

  // Décodage avant matching (snapshots legacy encore encodés).
  const categoryName = normalizeWordPressCategoryText(input.category.name);
  const nameTokens = tokenize(categoryName);
  const slugTokens = tokenize(input.category.slug.replace(/-/g, " "));
  const nameDistinctive = distinctiveTokens(
    nameTokens.length > 0 ? nameTokens : slugTokens
  );
  const specificity = nameDistinctive.length;

  if (nameDistinctive.length === 0) {
    return { score: 0, specificity: 0, matchedTokens: [] };
  }

  const matchedTokens = nameDistinctive.filter((token) =>
    subjectHasToken(subjectTokens, token)
  );
  const matchedCount = matchedTokens.length;

  let score = 0;

  // Expression exacte du nom (la plus forte).
  if (subjectHasPhrase(haystack, categoryName)) {
    score = nameDistinctive.length >= 2 ? 100 : 70;
  } else if (
    input.category.slug &&
    subjectHasPhrase(haystack, input.category.slug.replace(/-/g, " "))
  ) {
    score = nameDistinctive.length >= 2 ? 95 : 65;
  } else if (matchedCount === nameDistinctive.length) {
    // Tous les termes distinctifs du nom sont présents.
    score = nameDistinctive.length >= 2 ? 90 : 55;
  } else if (matchedCount >= 2) {
    score = 60;
  } else if (matchedCount === 1 && nameDistinctive.length === 1) {
    // Catégorie mono-terme (ex. « WooCommerce », « RAG », « WordPress »).
    const token = nameDistinctive[0]!;
    // Sigles très courts : exigent présence en mot entier (déjà le cas) mais score modéré.
    score = token.length <= 2 ? 45 : 55;
  } else if (matchedCount === 1 && nameDistinctive.length >= 2) {
    const matched = matchedTokens[0]!;
    const isHeadToken = tokensLooselyMatch(matched, nameDistinctive[0]!);
    // Seuls quelques heads techniques (api, seo, rag…) justifient un match partiel.
    // « wordpress » seul ne doit PAS valider « WordPress headless ».
    // « ia » seul ne doit PAS valider « IA prédictive ».
    if (isHeadToken && STRONG_TECH_HEADS.has(stemToken(matched))) {
      score = 52;
    } else {
      score = 15;
    }
  }

  // Bonus titre : le nom apparaît dans le titre final.
  if (titleNorm && subjectHasPhrase(titleNorm, categoryName) && score > 0) {
    score += 10;
  }

  // Légère priorité aux libellés plus spécifiques (départage).
  score += Math.min(specificity, 4);

  return { score, specificity, matchedTokens };
}

/**
 * Retire une catégorie trop générale si une plus spécifique (nom contenant
 * le général) est déjà retenue avec un score suffisant.
 */
export function preferSpecificCategories(
  matches: ScoredCategoryMatch[]
): ScoredCategoryMatch[] {
  const sorted = [...matches].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (b.specificity !== a.specificity) {
      return b.specificity - a.specificity;
    }
    return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
  });

  const selected: ScoredCategoryMatch[] = [];

  for (const candidate of sorted) {
    const candidateNorm = normalizeText(candidate.name);
    let dominated = false;

    for (let index = 0; index < selected.length; index += 1) {
      const existing = selected[index]!;
      const existingNorm = normalizeText(existing.name);

      const candidateMoreSpecific =
        candidateNorm.includes(existingNorm) &&
        candidateNorm !== existingNorm &&
        candidate.specificity > existing.specificity;
      const existingMoreSpecific =
        existingNorm.includes(candidateNorm) &&
        existingNorm !== candidateNorm &&
        existing.specificity > candidate.specificity;

      // Ne domine que si le spécifique est réellement bien matché (pas un match partiel faible).
      if (candidateMoreSpecific && candidate.score >= 80) {
        selected[index] = candidate;
        dominated = true;
        break;
      }
      if (existingMoreSpecific && existing.score >= 80) {
        dominated = true;
        break;
      }
    }

    if (!dominated) {
      selected.push(candidate);
    }
  }

  return selected;
}

/**
 * Sélection client : scoring sur nom/slug, seuil, max 3, prioritéité.
 * La description WP n'est pas utilisée pour déclencher un match (trop bruyante).
 * Pas d'appel OpenAI. Fallback = catégorie par défaut si configurée et valide.
 */
export function detectCategoriesFromAllowed(input: {
  subject: string;
  title?: string | null;
  contentHints?: string | null;
  categories: SyncedWpCategory[];
  allowedIds: number[];
  defaultCategoryId: number | null;
  categoriesOrigin: string | null;
  effectiveWpOrigin: string | null;
  maxCategories?: number;
  minScore?: number;
}): WordPressCategory[] {
  const allowed = filterCategoryIdsForCurrentSite({
    ids: input.allowedIds,
    categories: input.categories,
    categoriesOrigin: input.categoriesOrigin,
    effectiveWpOrigin: input.effectiveWpOrigin,
  });

  if (allowed.length === 0) {
    return [];
  }

  const byId = new Map(input.categories.map((item) => [item.id, item]));
  const maxCategories = input.maxCategories ?? MAX_DYNAMIC_CATEGORIES;
  const minScore = input.minScore ?? MIN_DYNAMIC_CATEGORY_SCORE;

  // Sujet prioritaire ; titre / hints optionnels (pas le corps complet).
  const subjectBlob = [input.subject, input.title, input.contentHints]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n");

  const scored: ScoredCategoryMatch[] = [];

  for (const id of allowed) {
    const category = byId.get(id);
    if (!category) {
      continue;
    }
    const { score, specificity, matchedTokens } = scoreCategoryAgainstSubject({
      subject: subjectBlob,
      title: input.title,
      category,
    });
    if (score < minScore) {
      continue;
    }
    scored.push({
      categoryId: id,
      name: category.name,
      keywords: matchedTokens,
      score,
      specificity,
    });
  }

  if (scored.length === 0) {
    const defaultId = input.defaultCategoryId;
    if (defaultId && allowed.includes(defaultId) && byId.has(defaultId)) {
      const category = byId.get(defaultId)!;
      return [
        {
          categoryId: category.id,
          name: category.name,
          keywords: tokenize(category.name),
        },
      ];
    }
    return [];
  }

  const preferred = preferSpecificCategories(scored);
  return preferred.slice(0, maxCategories).map((item) => ({
    categoryId: item.categoryId,
    name: item.name,
    keywords: item.keywords,
  }));
}

/**
 * Avant envoi WordPress : unicité, whitelist, origin, plafond dynamique.
 * Ne fusionne jamais avec d'autres listes.
 */
export function sanitizeCategoryIdsForWordPress(input: {
  ids: number[];
  allowedIds: number[];
  categories: SyncedWpCategory[];
  categoriesOrigin: string | null;
  effectiveWpOrigin: string | null;
  dynamicMode: boolean;
  maxCategories?: number;
}): number[] {
  const unique = [...new Set(input.ids.filter((id) => Number.isInteger(id) && id > 0))];
  const allowed = filterCategoryIdsForCurrentSite({
    ids: input.dynamicMode ? input.allowedIds : unique,
    categories: input.categories,
    categoriesOrigin: input.categoriesOrigin,
    effectiveWpOrigin: input.effectiveWpOrigin,
  });

  if (input.dynamicMode) {
    const allowedSet = new Set(allowed);
    const filtered = unique.filter((id) => allowedSet.has(id));
    const max = input.maxCategories ?? MAX_DYNAMIC_CATEGORIES;
    return filtered.slice(0, max);
  }

  // Mode historique Naxialis : pas de plafond dynamique ici (comportement inchangé).
  // On filtre quand même contre le snapshot si disponible + origin compatible.
  if (
    input.categoriesOrigin &&
    input.effectiveWpOrigin &&
    input.categoriesOrigin === input.effectiveWpOrigin &&
    input.categories.length > 0
  ) {
    const known = new Set(input.categories.map((item) => item.id));
    return unique.filter((id) => known.has(id));
  }

  return unique;
}

/**
 * Naxialis : CATEGORY_MAP historique.
 * Client (ou Naxialis avec sélection explicite) : catégories autorisées synchronisées.
 * Jamais de fusion des deux modes.
 */
export function resolveCategoriesForSubject(input: {
  subject: string;
  title?: string | null;
  contentHints?: string | null;
  isNaxialisLegacy: boolean;
  config: WordPressCategoryConfig | null;
  effectiveWpOrigin: string | null;
}): WordPressCategory[] {
  const config = input.config;
  const hasDynamicSelection = Boolean(
    config &&
      config.allowedIds.length > 0 &&
      config.origin &&
      input.effectiveWpOrigin &&
      config.origin === input.effectiveWpOrigin
  );

  // Cas 1 — Aucun mode dynamique : mapping historique Naxialis inchangé.
  if (input.isNaxialisLegacy && !hasDynamicSelection) {
    return detectNaxialisCategories(input.subject);
  }

  if (!config || !hasDynamicSelection) {
    // Client sans catégories autorisées : défaut seul si valide, sinon aucune.
    if (
      config?.defaultCategoryId &&
      config.origin &&
      input.effectiveWpOrigin &&
      config.origin === input.effectiveWpOrigin
    ) {
      return detectCategoriesFromAllowed({
        subject: input.subject,
        title: input.title,
        contentHints: input.contentHints,
        categories: config.categories,
        allowedIds: [config.defaultCategoryId],
        defaultCategoryId: config.defaultCategoryId,
        categoriesOrigin: config.origin,
        effectiveWpOrigin: input.effectiveWpOrigin,
      });
    }
    return [];
  }

  // Cas 2 — Mode dynamique exclusif (pas de CATEGORY_MAP en parallèle).
  return detectCategoriesFromAllowed({
    subject: input.subject,
    title: input.title,
    contentHints: input.contentHints,
    categories: config.categories,
    allowedIds: config.allowedIds,
    defaultCategoryId: config.defaultCategoryId,
    categoriesOrigin: config.origin,
    effectiveWpOrigin: input.effectiveWpOrigin,
  });
}

/**
 * Récupère toutes les catégories WP (pagination X-WP-TotalPages).
 */
export async function fetchAllWordPressCategories(
  credentials?: WordPressConfig
): Promise<SyncedWpCategory[]> {
  const wp = credentials ?? (await resolveWordPressConfig());
  if (!wp) {
    throw new Error("WordPress non configuré.");
  }

  const perPage = 100;
  const collected: SyncedWpCategory[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const url = `${wp.url.replace(/\/$/, "")}/wp-json/wp/v2/categories?per_page=${perPage}&page=${page}&hide_empty=false`;
    const response = await fetchWordPressNoRedirect(url, {
      method: "GET",
      headers: {
        Authorization: authHeader(wp.username, wp.appPassword),
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `WordPress catégories HTTP ${response.status}: ${body.slice(0, 200)}`
      );
    }

    const headerPages = Number(response.headers.get("X-WP-TotalPages"));
    if (Number.isFinite(headerPages) && headerPages > 0) {
      totalPages = headerPages;
    }

    const data = (await response.json()) as WpRestCategory[];
    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    for (const item of data) {
      const id = Number(item.id);
      if (!Number.isInteger(id) || id <= 0) {
        continue;
      }
      const parentRaw = Number(item.parent);
      collected.push({
        id,
        name: normalizeWordPressCategoryText(
          typeof item.name === "string" ? item.name : `Catégorie ${id}`
        ),
        slug: typeof item.slug === "string" ? item.slug : "",
        count: typeof item.count === "number" ? item.count : 0,
        description: normalizeWordPressCategoryText(
          typeof item.description === "string" ? item.description : ""
        ),
        parent:
          Number.isInteger(parentRaw) && parentRaw > 0 ? parentRaw : null,
      });
    }

    if (data.length < perPage && !Number.isFinite(headerPages)) {
      break;
    }
    page += 1;
  }

  const byId = new Map<number, SyncedWpCategory>();
  for (const item of collected) {
    byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "fr", { sensitivity: "base" })
  );
}

export function categoryConfigOriginFromWpUrl(wpUrl: string): string {
  return normalizeWpOrigin(wpUrl);
}

export function isDynamicCategoryMode(
  config: WordPressCategoryConfig | null,
  effectiveWpOrigin: string | null
): boolean {
  return Boolean(
    config &&
      config.allowedIds.length > 0 &&
      config.origin &&
      effectiveWpOrigin &&
      config.origin === effectiveWpOrigin
  );
}
