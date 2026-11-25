/**
 * Validation serveur des références WordPress avant OpenAI / écriture REST.
 */

import { db } from "@/lib/db";
import {
  isWpCategorizationMode,
  normalizeWpCategorizationMode,
  parseWpCategoryIdsJson,
  type WpAuthorCapability,
  type WpCategorizationMode,
} from "@/lib/wordpress/references-types";

export type ValidatedWordPressRefs = {
  mode: WpCategorizationMode;
  categoryIds: number[];
  categoryNames: Array<{ categoryId: number; name: string }>;
  authorId: number | null;
  authorName: string | null;
  /** true si le champ author doit être injecté dans le payload REST. */
  injectAuthor: boolean;
};

export class WordPressReferenceValidationError extends Error {
  readonly code: string;
  constructor(message: string, code = "REFERENCE_INVALID") {
    super(message);
    this.name = "WordPressReferenceValidationError";
    this.code = code;
  }
}

async function loadLiveCategory(
  workspaceId: string,
  siteOrigin: string,
  wpId: number
) {
  return db.wordPressCmsReference.findFirst({
    where: {
      workspaceId,
      kind: "category",
      siteOrigin,
      wpId,
      missingAt: null,
    },
  });
}

async function loadLiveAuthor(
  workspaceId: string,
  siteOrigin: string,
  wpId: number
) {
  return db.wordPressCmsReference.findFirst({
    where: {
      workspaceId,
      kind: "author",
      siteOrigin,
      wpId,
      missingAt: null,
    },
  });
}

export async function loadWordPressReferenceDefaults(workspaceId: string): Promise<{
  mode: WpCategorizationMode;
  manualDefaultCategoryIds: number[];
  defaultAuthorId: number | null;
  authorCapability: WpAuthorCapability | null;
  apiUserId: number | null;
  apiUserName: string | null;
  syncedAt: string | null;
  authorsSyncedAt: string | null;
}> {
  const row = await db.workspaceCmsSettings.findUnique({
    where: { workspaceId },
    select: {
      wpCategorizationMode: true,
      wpManualDefaultCategoryIds: true,
      wpDefaultAuthorId: true,
      wpAuthorCapability: true,
      wpApiUserId: true,
      wpApiUserName: true,
      wpCategoriesSyncedAt: true,
      wpAuthorsSyncedAt: true,
    },
  });
  // Fallback AppSettings si workspace settings absents
  const app = !row
    ? await db.appSettings.findFirst({
        select: {
          wpCategorizationMode: true,
          wpManualDefaultCategoryIds: true,
          wpDefaultAuthorId: true,
          wpAuthorCapability: true,
          wpApiUserId: true,
          wpApiUserName: true,
          wpCategoriesSyncedAt: true,
          wpAuthorsSyncedAt: true,
        },
      })
    : null;
  const source = row ?? app;
  const cap = source?.wpAuthorCapability;
  return {
    mode: normalizeWpCategorizationMode(source?.wpCategorizationMode),
    manualDefaultCategoryIds: parseWpCategoryIdsJson(
      source?.wpManualDefaultCategoryIds
    ),
    defaultAuthorId: source?.wpDefaultAuthorId ?? null,
    authorCapability:
      cap === "self_only" ||
      cap === "can_list_authors" ||
      cap === "can_assign" ||
      cap === "unknown"
        ? cap
        : null,
    apiUserId: source?.wpApiUserId ?? null,
    apiUserName: source?.wpApiUserName ?? null,
    syncedAt: source?.wpCategoriesSyncedAt?.toISOString() ?? null,
    authorsSyncedAt: source?.wpAuthorsSyncedAt?.toISOString() ?? null,
  };
}

/**
 * Valide sélection manuelle / auteur. Mode automatic → categoryIds vides ici
 * (la détection historique s’applique ailleurs).
 */
export async function validateWordPressReferenceSelection(input: {
  workspaceId: string;
  siteOrigin: string;
  mode?: string | null;
  categoryIds?: number[] | null;
  authorId?: number | null;
  /** Capacité figée au moment de la sync / settings. */
  authorCapability?: WpAuthorCapability | null;
  apiUserId?: number | null;
  /** Si true, une sélection manuelle vide est acceptée (WP Uncategorized). */
  allowEmptyManualCategories?: boolean;
}): Promise<ValidatedWordPressRefs> {
  const mode = isWpCategorizationMode(input.mode)
    ? input.mode
    : normalizeWpCategorizationMode(input.mode);

  const rawIds = Array.isArray(input.categoryIds)
    ? input.categoryIds.filter((id) => Number.isInteger(id) && id > 0)
    : [];
  const uniqueIds = [...new Set(rawIds)];

  const categoryNames: Array<{ categoryId: number; name: string }> = [];

  if (mode === "manual") {
    if (uniqueIds.length === 0 && !input.allowEmptyManualCategories) {
      // Sélection vide explicite autorisée par défaut (comportement WP).
    }
    for (const id of uniqueIds) {
      const row = await loadLiveCategory(
        input.workspaceId,
        input.siteOrigin,
        id
      );
      if (!row) {
        throw new WordPressReferenceValidationError(
          `Catégorie WordPress ${id} introuvable, absente ou d’un autre site.`,
          "CATEGORY_MISSING"
        );
      }
      categoryNames.push({ categoryId: id, name: row.name });
    }
  }

  let authorId: number | null =
    typeof input.authorId === "number" &&
    Number.isInteger(input.authorId) &&
    input.authorId > 0
      ? input.authorId
      : null;
  let authorName: string | null = null;
  let injectAuthor = false;

  const capability = input.authorCapability ?? "unknown";
  const apiUserId =
    typeof input.apiUserId === "number" && input.apiUserId > 0
      ? input.apiUserId
      : null;

  if (authorId != null) {
    const row = await loadLiveAuthor(
      input.workspaceId,
      input.siteOrigin,
      authorId
    );
    if (!row) {
      throw new WordPressReferenceValidationError(
        `Auteur WordPress ${authorId} introuvable ou absent de la synchronisation.`,
        "AUTHOR_MISSING"
      );
    }
    authorName = row.name;

    // Compte API = comportement historique → ne pas envoyer author.
    if (apiUserId != null && authorId === apiUserId) {
      injectAuthor = false;
      authorId = null;
      authorName = row.name; // affichage éventuel
    } else if (capability !== "can_assign") {
      throw new WordPressReferenceValidationError(
        "Permissions insuffisantes pour attribuer un autre auteur WordPress. Conservez le compte API.",
        "AUTHOR_FORBIDDEN"
      );
    } else {
      injectAuthor = true;
    }
  }

  return {
    mode,
    categoryIds: mode === "manual" ? uniqueIds : [],
    categoryNames,
    authorId: injectAuthor ? authorId : null,
    authorName,
    injectAuthor,
  };
}

export async function resolveWordPressReferenceLabels(input: {
  workspaceId: string;
  categoryIds?: number[] | null;
  authorId?: number | null;
}): Promise<{
  categories: Array<{ id: number; name: string; missing: boolean }>;
  author: { id: number; name: string; missing: boolean } | null;
}> {
  const categories: Array<{ id: number; name: string; missing: boolean }> = [];
  for (const id of input.categoryIds ?? []) {
    const row = await db.wordPressCmsReference.findFirst({
      where: {
        workspaceId: input.workspaceId,
        kind: "category",
        wpId: id,
      },
      orderBy: [{ missingAt: "asc" }],
    });
    categories.push({
      id,
      name: row?.name ?? `Catégorie ${id}`,
      missing: !row || row.missingAt != null,
    });
  }

  let author: { id: number; name: string; missing: boolean } | null = null;
  if (input.authorId != null && input.authorId > 0) {
    const row = await db.wordPressCmsReference.findFirst({
      where: {
        workspaceId: input.workspaceId,
        kind: "author",
        wpId: input.authorId,
      },
      orderBy: [{ missingAt: "asc" }],
    });
    author = {
      id: input.authorId,
      name: row?.name ?? `Auteur ${input.authorId}`,
      missing: !row || row.missingAt != null,
    };
  }

  return { categories, author };
}
