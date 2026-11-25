/**
 * Synchronisation idempotente catégories + auteurs WordPress.
 * Soft-missing uniquement après sync complète réussie.
 * Dual-write AppSettings + WorkspaceCmsSettings (legacy JSON conservé).
 */

import { db } from "@/lib/db";
import {
  fetchAllWordPressCategories,
  parseAllowedCategoryIds,
  categoryConfigOriginFromWpUrl,
} from "@/lib/wordpress-categories";
import { probeWordPressAuthors } from "@/lib/wordpress/authors";
import {
  normalizeWpCategorizationMode,
  parseWpCategoryIdsJson,
  type WordPressReferenceKind,
} from "@/lib/wordpress/references-types";
import {
  resolveWordPressConfig,
  type WordPressConfig,
} from "@/lib/settings/app-settings";
import { APP_SETTINGS_ID } from "@/lib/settings/app-settings-id";
import { normalizeWpOrigin } from "@/lib/settings/wp-url";
import { logError, logInfo } from "@/lib/logger";
import {
  assertModuleAllowedForWorkspace,
  getWorkspaceByIdOrSlug,
  WORKSPACE_IDS,
} from "@/lib/workspace";

export type WordPressReferencesSyncResult = {
  ok: boolean;
  workspaceId: string;
  siteOrigin: string;
  syncedAt: string;
  categoriesUpserted: number;
  authorsUpserted: number;
  markedMissing: number;
  authorCapability: string | null;
  authorMessage: string | null;
  issues: string[];
};

async function upsertRef(input: {
  workspaceId: string;
  kind: WordPressReferenceKind;
  siteOrigin: string;
  wpId: number;
  name: string;
  slug: string | null;
  parentWpId: number | null;
  description: string | null;
  count: number | null;
  syncedAt: Date;
}): Promise<void> {
  await db.wordPressCmsReference.upsert({
    where: {
      workspaceId_kind_siteOrigin_wpId: {
        workspaceId: input.workspaceId,
        kind: input.kind,
        siteOrigin: input.siteOrigin,
        wpId: input.wpId,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      kind: input.kind,
      siteOrigin: input.siteOrigin,
      wpId: input.wpId,
      name: input.name,
      slug: input.slug,
      parentWpId: input.parentWpId,
      description: input.description,
      count: input.count,
      missingAt: null,
      syncedAt: input.syncedAt,
    },
    update: {
      name: input.name,
      slug: input.slug,
      parentWpId: input.parentWpId,
      description: input.description,
      count: input.count,
      missingAt: null,
      syncedAt: input.syncedAt,
    },
  });
}

/**
 * Sync catégories + auteurs pour un workspace WordPress.
 * Ne vide jamais le catalogue en cas d’échec partiel.
 */
export async function syncWordPressCmsReferences(input: {
  workspaceId: string;
  credentials?: WordPressConfig | null;
}): Promise<WordPressReferencesSyncResult> {
  const workspaceId = input.workspaceId.trim();
  const syncedAt = new Date();
  const empty = (issues: string[]): WordPressReferencesSyncResult => ({
    ok: false,
    workspaceId,
    siteOrigin: "",
    syncedAt: syncedAt.toISOString(),
    categoriesUpserted: 0,
    authorsUpserted: 0,
    markedMissing: 0,
    authorCapability: null,
    authorMessage: null,
    issues,
  });

  const workspace = await getWorkspaceByIdOrSlug(workspaceId);
  if (!workspace) {
    return empty(["Espace éditorial introuvable."]);
  }
  if (workspace.cmsProvider !== "wordpress") {
    return empty(["Cet espace n’est pas un espace WordPress."]);
  }
  assertModuleAllowedForWorkspace(workspace, "inventory");

  const credentials =
    input.credentials ?? (await resolveWordPressConfig());
  if (!credentials) {
    return empty(["WordPress non configuré."]);
  }

  const siteOrigin = categoryConfigOriginFromWpUrl(credentials.url);
  const issues: string[] = [];
  let categoriesUpserted = 0;
  let authorsUpserted = 0;
  let markedMissing = 0;
  let authorCapability: string | null = null;
  let authorMessage: string | null = null;
  let categoriesOk = false;
  let authorsOk = false;

  let categories: Awaited<ReturnType<typeof fetchAllWordPressCategories>> = [];
  try {
    categories = await fetchAllWordPressCategories(credentials);
    categoriesOk = true;
    for (const cat of categories) {
      await upsertRef({
        workspaceId,
        kind: "category",
        siteOrigin,
        wpId: cat.id,
        name: cat.name,
        slug: cat.slug || null,
        parentWpId: cat.parent && cat.parent > 0 ? cat.parent : null,
        description: cat.description || null,
        count: typeof cat.count === "number" ? cat.count : null,
        syncedAt,
      });
      categoriesUpserted += 1;
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Échec synchronisation catégories WordPress.";
    issues.push(message);
    logError("wordpress-refs", "categories sync failed", { error: message });
  }

  let probe: Awaited<ReturnType<typeof probeWordPressAuthors>> | null = null;
  try {
    probe = await probeWordPressAuthors(credentials);
    authorsOk = true;
    authorCapability = probe.capability;
    authorMessage = probe.message;
    // Persiste le catalogue listé (y compris non assignables) pour historique / inventaire.
    for (const author of probe.listedAuthors) {
      await upsertRef({
        workspaceId,
        kind: "author",
        siteOrigin,
        wpId: author.id,
        name: author.name,
        slug: author.slug || null,
        parentWpId: null,
        description: null,
        count: null,
        syncedAt,
      });
      authorsUpserted += 1;
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Échec synchronisation auteurs WordPress.";
    issues.push(message);
    logError("wordpress-refs", "authors sync failed", { error: message });
  }

  // Soft-missing uniquement si la sync de chaque kind a réussi.
  if (categoriesOk) {
    const seenIds = new Set(categories.map((c) => c.id));
    const existing = await db.wordPressCmsReference.findMany({
      where: {
        workspaceId,
        kind: "category",
        siteOrigin,
        missingAt: null,
      },
      select: { id: true, wpId: true },
    });
    for (const row of existing) {
      if (!seenIds.has(row.wpId)) {
        await db.wordPressCmsReference.update({
          where: { id: row.id },
          data: { missingAt: syncedAt },
        });
        markedMissing += 1;
      }
    }
  }

  if (authorsOk && probe) {
    const seenIds = new Set(probe.listedAuthors.map((a) => a.id));
    const existing = await db.wordPressCmsReference.findMany({
      where: {
        workspaceId,
        kind: "author",
        siteOrigin,
        missingAt: null,
      },
      select: { id: true, wpId: true },
    });
    for (const row of existing) {
      if (!seenIds.has(row.wpId)) {
        await db.wordPressCmsReference.update({
          where: { id: row.id },
          data: { missingAt: syncedAt },
        });
        markedMissing += 1;
      }
    }
  }

  const ok = categoriesOk; // catégories = cœur ; auteurs optionnels
  if (!ok) {
    return {
      ok: false,
      workspaceId,
      siteOrigin,
      syncedAt: syncedAt.toISOString(),
      categoriesUpserted,
      authorsUpserted,
      markedMissing: 0,
      authorCapability,
      authorMessage,
      issues:
        issues.length > 0
          ? issues
          : ["Synchronisation catégories WordPress incomplète."],
    };
  }

  // Dual-write legacy JSON + métadonnées mode / auteur
  const categoriesJson = JSON.stringify(
    categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      count: c.count,
      description: c.description,
      parent: c.parent ?? null,
    }))
  );

  const appRow = await db.appSettings.findUnique({
    where: { id: APP_SETTINGS_ID },
    select: {
      wpAllowedCategoryIds: true,
      wpDefaultCategoryId: true,
      wpManualDefaultCategoryIds: true,
      wpCategorizationMode: true,
      wpDefaultAuthorId: true,
    },
  });
  const previousAllowed = parseAllowedCategoryIds(
    appRow?.wpAllowedCategoryIds
  );
  const known = new Set(categories.map((c) => c.id));
  const retainedAllowed = previousAllowed.filter((id) => known.has(id));
  let defaultId = appRow?.wpDefaultCategoryId ?? null;
  if (defaultId && !known.has(defaultId)) {
    defaultId = null;
  }
  if (
    defaultId &&
    retainedAllowed.length > 0 &&
    !retainedAllowed.includes(defaultId)
  ) {
    defaultId = null;
  }

  let manualDefaults = parseWpCategoryIdsJson(
    appRow?.wpManualDefaultCategoryIds
  ).filter((id) => known.has(id));
  let defaultAuthorId = appRow?.wpDefaultAuthorId ?? null;
  if (
    defaultAuthorId &&
    probe &&
    !probe.authors.some((a) => a.id === defaultAuthorId)
  ) {
    // Conservé s’il est encore dans le catalogue listé (même non assignable).
    if (!probe.listedAuthors.some((a) => a.id === defaultAuthorId)) {
      defaultAuthorId = null;
    }
  }

  const mode = normalizeWpCategorizationMode(appRow?.wpCategorizationMode);

  await db.appSettings.upsert({
    where: { id: APP_SETTINGS_ID },
    create: {
      id: APP_SETTINGS_ID,
      wpCategoriesJson: categoriesJson,
      wpAllowedCategoryIds:
        retainedAllowed.length > 0 ? JSON.stringify(retainedAllowed) : null,
      wpDefaultCategoryId: defaultId,
      wpCategoriesSyncedAt: syncedAt,
      wpCategoriesOrigin: siteOrigin,
      wpCategorizationMode: mode,
      wpManualDefaultCategoryIds:
        manualDefaults.length > 0 ? JSON.stringify(manualDefaults) : null,
      wpDefaultAuthorId: defaultAuthorId,
      wpAuthorsSyncedAt: authorsOk ? syncedAt : null,
      wpAuthorCapability: authorCapability,
      wpApiUserId: probe?.apiUser?.id ?? null,
      wpApiUserName: probe?.apiUser?.name ?? null,
      wpApiUserSlug: probe?.apiUser?.slug ?? null,
    },
    update: {
      wpCategoriesJson: categoriesJson,
      wpAllowedCategoryIds:
        retainedAllowed.length > 0 ? JSON.stringify(retainedAllowed) : null,
      wpDefaultCategoryId: defaultId,
      wpCategoriesSyncedAt: syncedAt,
      wpCategoriesOrigin: siteOrigin,
      wpManualDefaultCategoryIds:
        manualDefaults.length > 0 ? JSON.stringify(manualDefaults) : null,
      wpDefaultAuthorId: defaultAuthorId,
      wpAuthorsSyncedAt: authorsOk ? syncedAt : undefined,
      wpAuthorCapability: authorCapability ?? undefined,
      wpApiUserId: probe?.apiUser?.id ?? undefined,
      wpApiUserName: probe?.apiUser?.name ?? undefined,
      wpApiUserSlug: probe?.apiUser?.slug ?? undefined,
    },
  });

  // WorkspaceCmsSettings pour l’espace WP connu
  if (workspaceId === WORKSPACE_IDS.wordpress || workspace.cmsProvider === "wordpress") {
    await db.workspaceCmsSettings.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        wpCategoriesJson: categoriesJson,
        wpAllowedCategoryIds:
          retainedAllowed.length > 0 ? JSON.stringify(retainedAllowed) : null,
        wpDefaultCategoryId: defaultId,
        wpCategoriesSyncedAt: syncedAt,
        wpCategoriesOrigin: siteOrigin,
        wpCategorizationMode: mode,
        wpManualDefaultCategoryIds:
          manualDefaults.length > 0 ? JSON.stringify(manualDefaults) : null,
        wpDefaultAuthorId: defaultAuthorId,
        wpAuthorsSyncedAt: authorsOk ? syncedAt : null,
        wpAuthorCapability: authorCapability,
        wpApiUserId: probe?.apiUser?.id ?? null,
        wpApiUserName: probe?.apiUser?.name ?? null,
        wpApiUserSlug: probe?.apiUser?.slug ?? null,
      },
      update: {
        wpCategoriesJson: categoriesJson,
        wpAllowedCategoryIds:
          retainedAllowed.length > 0 ? JSON.stringify(retainedAllowed) : null,
        wpDefaultCategoryId: defaultId,
        wpCategoriesSyncedAt: syncedAt,
        wpCategoriesOrigin: siteOrigin,
        wpManualDefaultCategoryIds:
          manualDefaults.length > 0 ? JSON.stringify(manualDefaults) : null,
        wpDefaultAuthorId: defaultAuthorId,
        wpAuthorsSyncedAt: authorsOk ? syncedAt : undefined,
        wpAuthorCapability: authorCapability ?? undefined,
        wpApiUserId: probe?.apiUser?.id ?? undefined,
        wpApiUserName: probe?.apiUser?.name ?? undefined,
        wpApiUserSlug: probe?.apiUser?.slug ?? undefined,
      },
    });
  }

  logInfo("wordpress-refs", "sync ok", {
    workspaceId,
    categoriesUpserted,
    authorsUpserted,
    markedMissing,
  });

  return {
    ok: true,
    workspaceId,
    siteOrigin,
    syncedAt: syncedAt.toISOString(),
    categoriesUpserted,
    authorsUpserted,
    markedMissing,
    authorCapability,
    authorMessage,
    issues,
  };
}

export async function listSelectableWordPressReferences(input: {
  workspaceId: string;
  kind: WordPressReferenceKind;
  siteOrigin?: string | null;
  includeMissing?: boolean;
}) {
  const origin = input.siteOrigin?.trim() || null;
  return db.wordPressCmsReference.findMany({
    where: {
      workspaceId: input.workspaceId,
      kind: input.kind,
      ...(origin ? { siteOrigin: origin } : {}),
      ...(input.includeMissing ? {} : { missingAt: null }),
    },
    orderBy: [{ name: "asc" }],
  });
}

export function buildCategoryHierarchyLabel(
  categories: Array<{ wpId: number; name: string; parentWpId: number | null }>,
  wpId: number
): string {
  const byId = new Map(categories.map((c) => [c.wpId, c]));
  const parts: string[] = [];
  let current = byId.get(wpId);
  const guard = new Set<number>();
  while (current && !guard.has(current.wpId)) {
    guard.add(current.wpId);
    parts.unshift(current.name);
    current =
      current.parentWpId != null ? byId.get(current.parentWpId) : undefined;
  }
  return parts.join(" › ");
}

export { normalizeWpOrigin };
