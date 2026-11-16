import type { CustomTheme } from "@prisma/client";
import type { EditorialDomain } from "./domains";

export const MAX_THEME_NAME = 120;
export const MAX_THEME_DESCRIPTION = 500;
export const MAX_THEME_ANGLE = 120;
export const MAX_THEME_ANGLES = 20;
export const MAX_THEME_QUOTA = 20;
export const MIN_THEME_QUOTA = 0;

/** Catalogue DB vide après tentative d’ensure — migration / seed manquant. */
export const SEO_CATALOG_UNINITIALIZED_ERROR =
  "Catalogue de thématiques SEO non initialisé. Créez vos thématiques dans « Gérer les thématiques », ou exécutez le seed historique (seo:seed-themes) uniquement pour une installation Naxialis.";

/** Catalogue présent mais aucune thématique active. */
export const SEO_NO_ACTIVE_THEMES_ERROR =
  "Aucune thématique SEO active. Activez au moins une thématique dans « Gérer les thématiques » avant de lancer une recherche multi-thématiques.";

/** Exige au moins une thématique active (mode multi-thématiques). */
export function requireActiveThemesForDomainsSearch(
  active: EditorialDomain[]
): EditorialDomain[] {
  if (active.length === 0) {
    throw new Error(SEO_NO_ACTIVE_THEMES_ERROR);
  }
  return active;
}

export type ThemeDependencies = {
  researchConfigs: number;
  searchRuns: number;
  opportunities: number;
  domainJsonRefs: number;
  total: number;
  canDelete: boolean;
};

export type EnsureHistoricalThemesResult = {
  created: string[];
  linked: string[];
  skipped: string[];
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function customThemeToDomain(theme: CustomTheme): EditorialDomain {
  return {
    id: theme.id,
    legacyKey: theme.legacyKey,
    label: theme.name,
    description: theme.description,
    defaultQuota: theme.defaultQuota,
    explorationAngles: asStringArray(theme.explorationAngles),
    naxialisServices: asStringArray(theme.naxialisServices),
    active: theme.active,
    sortOrder: theme.sortOrder,
  };
}

export function resolveDomainInCatalog(
  domainId: string,
  catalog: EditorialDomain[]
): EditorialDomain | undefined {
  return catalog.find(
    (domain) => domain.id === domainId || domain.legacyKey === domainId
  );
}

export function validateThemeAngles(input: unknown): {
  ok: true;
  value: string[];
} | {
  ok: false;
  error: string;
} {
  if (input === undefined || input === null) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(input)) {
    return { ok: false, error: "Les angles éditoriaux doivent être une liste." };
  }
  if (input.length > MAX_THEME_ANGLES) {
    return {
      ok: false,
      error: `Maximum ${MAX_THEME_ANGLES} angles éditoriaux.`,
    };
  }
  const angles: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") {
      return { ok: false, error: "Chaque angle doit être un texte." };
    }
    const trimmed = raw.trim().slice(0, MAX_THEME_ANGLE);
    if (!trimmed) {
      continue;
    }
    angles.push(trimmed);
  }
  return { ok: true, value: angles };
}

export function validateThemeQuota(input: unknown): {
  ok: true;
  value: number;
} | {
  ok: false;
  error: string;
} {
  const num = Number(input);
  if (!Number.isFinite(num)) {
    return { ok: false, error: "Quota invalide." };
  }
  const rounded = Math.round(num);
  if (rounded < MIN_THEME_QUOTA || rounded > MAX_THEME_QUOTA) {
    return {
      ok: false,
      error: `Quota entre ${MIN_THEME_QUOTA} et ${MAX_THEME_QUOTA}.`,
    };
  }
  return { ok: true, value: rounded };
}

export function normalizeThemeName(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }
  const name = input.trim().slice(0, MAX_THEME_NAME);
  return name || null;
}

export function normalizeThemeDescription(input: unknown): string | null {
  if (input === undefined || input === null) {
    return null;
  }
  if (typeof input !== "string") {
    return null;
  }
  return input.trim().slice(0, MAX_THEME_DESCRIPTION) || null;
}
