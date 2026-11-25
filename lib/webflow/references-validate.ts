/**
 * Validation serveur des références category/author avant OpenAI / écriture CMS.
 */

import { db } from "@/lib/db";
import type { WebflowFieldMapping } from "@/lib/webflow/types";
import type { WebflowReferenceKind } from "@/lib/webflow/references-discover";

export type ValidatedWebflowRefs = {
  categoryItemId: string | null;
  authorItemId: string | null;
  categoryName: string | null;
  authorName: string | null;
};

export class WebflowReferenceValidationError extends Error {
  readonly code: string;
  constructor(message: string, code = "REFERENCE_INVALID") {
    super(message);
    this.name = "WebflowReferenceValidationError";
    this.code = code;
  }
}

async function loadLiveRef(
  workspaceId: string,
  kind: WebflowReferenceKind,
  itemId: string
) {
  return db.webflowCmsReference.findFirst({
    where: {
      workspaceId,
      kind,
      webflowItemId: itemId,
      missingAt: null,
      isArchived: false,
    },
  });
}

/**
 * Valide les IDs fournis (jamais d’acceptation aveugle du navigateur).
 */
export async function validateWebflowReferenceSelection(input: {
  workspaceId: string;
  mapping: WebflowFieldMapping;
  categoryItemId?: string | null;
  authorItemId?: string | null;
  /** Champs CMS Required (issus de la découverte schéma). */
  categoryRequired?: boolean;
  authorRequired?: boolean;
}): Promise<ValidatedWebflowRefs> {
  let categoryItemId =
    typeof input.categoryItemId === "string" && input.categoryItemId.trim()
      ? input.categoryItemId.trim()
      : null;
  let authorItemId =
    typeof input.authorItemId === "string" && input.authorItemId.trim()
      ? input.authorItemId.trim()
      : null;

  const categoryMapped = Boolean(input.mapping.category?.fieldId);
  const authorMapped = Boolean(input.mapping.author?.fieldId);

  let categoryName: string | null = null;
  let authorName: string | null = null;

  if (categoryItemId) {
    if (!categoryMapped) {
      throw new WebflowReferenceValidationError(
        "Catégorie fournie mais le mapping CMS « category » est absent.",
        "MAPPING_MISSING"
      );
    }
    const row = await loadLiveRef(input.workspaceId, "category", categoryItemId);
    if (!row) {
      throw new WebflowReferenceValidationError(
        "Catégorie introuvable, archivée ou absente de la synchronisation.",
        "CATEGORY_MISSING"
      );
    }
    categoryName = row.name;
  } else if (input.categoryRequired && categoryMapped) {
    throw new WebflowReferenceValidationError(
      "Le champ catégorie Webflow est obligatoire : sélectionnez une catégorie.",
      "CATEGORY_REQUIRED"
    );
  }

  if (authorItemId) {
    if (!authorMapped) {
      throw new WebflowReferenceValidationError(
        "Auteur fourni mais le mapping CMS « author » est absent.",
        "MAPPING_MISSING"
      );
    }
    const row = await loadLiveRef(input.workspaceId, "author", authorItemId);
    if (!row) {
      throw new WebflowReferenceValidationError(
        "Auteur introuvable, archivé ou absent de la synchronisation.",
        "AUTHOR_MISSING"
      );
    }
    authorName = row.name;
  } else if (input.authorRequired && authorMapped) {
    throw new WebflowReferenceValidationError(
      "Le champ auteur Webflow est obligatoire : sélectionnez un auteur.",
      "AUTHOR_REQUIRED"
    );
  }

  return {
    categoryItemId,
    authorItemId,
    categoryName,
    authorName,
  };
}

/**
 * Applique les défauts workspace si aucune sélection.
 */
export async function resolveWebflowRefsWithDefaults(input: {
  workspaceId: string;
  mapping: WebflowFieldMapping;
  categoryItemId?: string | null;
  authorItemId?: string | null;
  defaultCategoryItemId?: string | null;
  defaultAuthorItemId?: string | null;
  categoryRequired?: boolean;
  authorRequired?: boolean;
}): Promise<ValidatedWebflowRefs> {
  const categoryItemId =
    input.categoryItemId?.trim() ||
    input.defaultCategoryItemId?.trim() ||
    null;
  const authorItemId =
    input.authorItemId?.trim() || input.defaultAuthorItemId?.trim() || null;

  return validateWebflowReferenceSelection({
    workspaceId: input.workspaceId,
    mapping: input.mapping,
    categoryItemId,
    authorItemId,
    categoryRequired: input.categoryRequired,
    authorRequired: input.authorRequired,
  });
}

/** Charge les défauts workspace (IDs bruts — à valider ensuite). */
export async function loadWebflowReferenceDefaults(
  workspaceId: string
): Promise<{
  categoryItemId: string | null;
  authorItemId: string | null;
  syncedAt: string | null;
}> {
  const row = await db.workspaceCmsSettings.findUnique({
    where: { workspaceId },
    select: {
      webflowDefaultCategoryItemId: true,
      webflowDefaultAuthorItemId: true,
      webflowReferencesSyncedAt: true,
    },
  });
  return {
    categoryItemId: row?.webflowDefaultCategoryItemId ?? null,
    authorItemId: row?.webflowDefaultAuthorItemId ?? null,
    syncedAt: row?.webflowReferencesSyncedAt?.toISOString() ?? null,
  };
}

/**
 * Résout les noms connus (y compris missing) pour affichage historique.
 */
export async function resolveWebflowReferenceLabels(input: {
  workspaceId: string;
  categoryItemId?: string | null;
  authorItemId?: string | null;
}): Promise<{
  category: { id: string; name: string; unavailable: boolean } | null;
  author: { id: string; name: string; unavailable: boolean } | null;
}> {
  const resolveOne = async (
    kind: WebflowReferenceKind,
    itemId: string | null | undefined
  ) => {
    if (!itemId?.trim()) {
      return null;
    }
    const row = await db.webflowCmsReference.findFirst({
      where: {
        workspaceId: input.workspaceId,
        kind,
        webflowItemId: itemId.trim(),
      },
      select: { name: true, missingAt: true, isArchived: true },
    });
    if (!row) {
      return {
        id: itemId.trim(),
        name: itemId.trim(),
        unavailable: true,
      };
    }
    return {
      id: itemId.trim(),
      name: row.name,
      unavailable: Boolean(row.missingAt) || row.isArchived,
    };
  };

  return {
    category: await resolveOne("category", input.categoryItemId),
    author: await resolveOne("author", input.authorItemId),
  };
}
