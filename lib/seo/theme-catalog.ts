import type { CustomTheme } from "@prisma/client";
import { db } from "../db";
import { WORKSPACE_IDS } from "../workspace/constants";
import { EDITORIAL_DOMAINS, type EditorialDomain } from "./domains";
import {
  customThemeToDomain,
  SEO_CATALOG_UNINITIALIZED_ERROR,
  type EnsureHistoricalThemesResult,
  type ThemeDependencies,
} from "./theme-catalog-shared";
import { shouldSeedHistoricalEditorialThemes } from "./theme-seed-policy";

export * from "./theme-catalog-shared";

export type ThemeCatalogRecord = CustomTheme;

export async function listThemeCatalog(options?: {
  activeOnly?: boolean;
  /** Défaut transitoire V7.11.1 : espace WordPress. */
  workspaceId?: string;
}): Promise<CustomTheme[]> {
  const workspaceId = options?.workspaceId ?? WORKSPACE_IDS.wordpress;
  return db.customTheme.findMany({
    where: {
      workspaceId,
      ...(options?.activeOnly ? { active: true } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function listActiveEditorialDomains(workspaceId?: string) {
  const themes = await listThemeCatalog({ activeOnly: true, workspaceId });
  return themes.map(customThemeToDomain);
}

export async function listAllEditorialDomains(workspaceId?: string) {
  const themes = await listThemeCatalog({ workspaceId });
  return themes.map(customThemeToDomain);
}

/**
 * Charge le catalogue PostgreSQL pour une recherche.
 * Si aucune ligne : tente `ensureHistoricalEditorialThemes` une fois (sauf si `ensureIfEmpty: false`)
 * et uniquement si la politique V7.8 autorise le seed Naxialis (jamais pour un client neutre).
 * Ne retombe jamais silencieusement sur `EDITORIAL_DOMAINS`.
 */
export async function loadEditorialCatalogForSearch(options?: {
  ensureIfEmpty?: boolean;
  workspaceId?: string;
}): Promise<{ all: EditorialDomain[]; active: EditorialDomain[] }> {
  const ensureIfEmpty = options?.ensureIfEmpty !== false;
  const workspaceId = options?.workspaceId ?? WORKSPACE_IDS.wordpress;
  let all = await listAllEditorialDomains(workspaceId);
  if (
    all.length === 0 &&
    ensureIfEmpty &&
    (await shouldSeedHistoricalEditorialThemes(workspaceId))
  ) {
    await ensureHistoricalEditorialThemes(workspaceId);
    all = await listAllEditorialDomains(workspaceId);
  }
  if (all.length === 0) {
    throw new Error(SEO_CATALOG_UNINITIALIZED_ERROR);
  }
  const active = await listActiveEditorialDomains(workspaceId);
  return { all, active };
}

/**
 * Seed idempotent des 5 domaines historiques.
 *
 * Règles de rapprochement :
 * 1. `legacyKey` déjà présent → skip (aucune écrasement).
 * 2. Nom existant (insensible à la casse) sans legacyKey → attache `legacyKey`
 *    uniquement, sans modifier name/description/angles/quota/active/sortOrder.
 * 3. Sinon → création avec les valeurs historiques.
 */
export async function ensureHistoricalEditorialThemes(
  workspaceId: string = WORKSPACE_IDS.wordpress
): Promise<EnsureHistoricalThemesResult> {
  const result: EnsureHistoricalThemesResult = {
    created: [],
    linked: [],
    skipped: [],
  };

  // Seed historique Naxialis : réservé à l’espace WordPress (jamais Webflow).
  if (workspaceId !== WORKSPACE_IDS.wordpress) {
    return result;
  }

  const existing = await db.customTheme.findMany({ where: { workspaceId } });
  const byLegacy = new Map(
    existing
      .filter((theme) => theme.legacyKey)
      .map((theme) => [theme.legacyKey as string, theme])
  );
  const byName = new Map(
    existing.map((theme) => [theme.name.trim().toLowerCase(), theme])
  );

  let nextOrder =
    existing.reduce((max, theme) => Math.max(max, theme.sortOrder), -1) + 1;

  for (const domain of EDITORIAL_DOMAINS) {
    const legacyKey = domain.legacyKey ?? domain.id;
    const already = byLegacy.get(legacyKey);
    if (already) {
      result.skipped.push(legacyKey);
      continue;
    }

    const nameMatch = byName.get(domain.label.toLowerCase());
    if (nameMatch) {
      if (!nameMatch.legacyKey) {
        await db.customTheme.update({
          where: { id: nameMatch.id },
          data: { legacyKey },
        });
        result.linked.push(legacyKey);
      } else {
        result.skipped.push(legacyKey);
      }
      continue;
    }

    const created = await db.customTheme.create({
      data: {
        workspaceId,
        name: domain.label,
        description: null,
        active: true,
        legacyKey,
        explorationAngles: domain.explorationAngles,
        defaultQuota: domain.defaultQuota,
        sortOrder:
          typeof domain.sortOrder === "number" ? domain.sortOrder : nextOrder,
        naxialisServices: domain.naxialisServices,
      },
    });
    byLegacy.set(legacyKey, created);
    byName.set(created.name.toLowerCase(), created);
    nextOrder += 1;
    result.created.push(legacyKey);
  }

  return result;
}

/**
 * Rattache `themeId` aux opportunités historiques dont le label correspond,
 * sans modifier le champ `theme`.
 */
export async function backfillOpportunityThemeIds(
  workspaceId: string = WORKSPACE_IDS.wordpress
): Promise<number> {
  const themes = await db.customTheme.findMany({ where: { workspaceId } });
  let updated = 0;
  for (const theme of themes) {
    const labels = new Set<string>([theme.name]);
    const historical = EDITORIAL_DOMAINS.find(
      (domain) =>
        domain.legacyKey === theme.legacyKey || domain.id === theme.legacyKey
    );
    if (historical) {
      labels.add(historical.label);
    }
    for (const label of labels) {
      const result = await db.seoOpportunity.updateMany({
        where: {
          workspaceId,
          themeId: null,
          theme: label,
        },
        data: { themeId: theme.id },
      });
      updated += result.count;
    }
  }
  return updated;
}

export async function getThemeDependencies(
  themeId: string,
  workspaceId: string = WORKSPACE_IDS.wordpress
): Promise<ThemeDependencies> {
  const theme = await db.customTheme.findFirst({
    where: { id: themeId, workspaceId },
  });
  const [researchConfigs, searchRuns, opportunities, configsWithDomains] =
    await Promise.all([
      db.researchConfig.count({
        where: { workspaceId, customThemeId: themeId },
      }),
      db.opportunitySearchRun.count({
        where: { workspaceId, customThemeId: themeId },
      }),
      db.seoOpportunity.count({ where: { workspaceId, themeId } }),
      db.researchConfig.findMany({
        where: { workspaceId },
        select: { id: true, domains: true },
      }),
    ]);

  let domainJsonRefs = 0;
  const keys = new Set<string>([themeId]);
  if (theme?.legacyKey) {
    keys.add(theme.legacyKey);
  }
  for (const config of configsWithDomains) {
    if (!Array.isArray(config.domains)) {
      continue;
    }
    const hit = config.domains.some((row) => {
      if (!row || typeof row !== "object") {
        return false;
      }
      const domainId = (row as { domainId?: unknown }).domainId;
      return typeof domainId === "string" && keys.has(domainId);
    });
    if (hit) {
      domainJsonRefs += 1;
    }
  }

  const total =
    researchConfigs + searchRuns + opportunities + domainJsonRefs;
  return {
    researchConfigs,
    searchRuns,
    opportunities,
    domainJsonRefs,
    total,
    canDelete: total === 0,
  };
}

export async function reorderThemes(
  orderedIds: string[],
  workspaceId: string = WORKSPACE_IDS.wordpress
): Promise<CustomTheme[]> {
  const unique = [...new Set(orderedIds.filter((id) => typeof id === "string"))];
  if (unique.length === 0) {
    throw new Error("Liste d’ordre vide.");
  }

  const existing = await db.customTheme.findMany({
    where: { workspaceId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((item) => item.id));
  for (const id of unique) {
    if (!existingIds.has(id)) {
      throw new Error(`Thématique inconnue : ${id}`);
    }
  }

  await db.$transaction(
    unique.map((id, index) =>
      db.customTheme.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );

  return listThemeCatalog({ workspaceId });
}

export async function syncOpportunityThemeLabel(
  themeId: string,
  name: string,
  workspaceId: string = WORKSPACE_IDS.wordpress
): Promise<number> {
  const result = await db.seoOpportunity.updateMany({
    where: { workspaceId, themeId },
    data: { theme: name },
  });
  return result.count;
}
