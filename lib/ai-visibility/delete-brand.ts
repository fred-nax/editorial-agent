import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { logError } from "../logger";

/** Plafond d’identifiants acceptés par une suppression groupée. */
export const MAX_BRAND_IDS_PER_DELETE = 50;

export type DeletedBrandInfo = {
  id: string;
  name: string;
  primaryDomain: string;
  campaignCount: number;
};

export type DeleteBrandFailure = {
  ok: false;
  status: 400 | 404 | 409 | 500;
  error: string;
};

export type DeleteBrandSuccess = {
  ok: true;
  brand: DeletedBrandInfo;
};

export type DeleteBrandResult = DeleteBrandSuccess | DeleteBrandFailure;

export type DeleteBrandsBatchResult = {
  deleted: DeletedBrandInfo[];
  failed: Array<{ id: string; status: number; error: string }>;
  requestedCount: number;
};

class DeleteBrandConflictError extends Error {
  readonly status: 404 | 409;

  constructor(status: 404 | 409, message: string) {
    super(message);
    this.name = "DeleteBrandConflictError";
    this.status = status;
  }
}

/**
 * Normalise une liste d’identifiants : chaînes non vides, dédoublonnées,
 * plafonnées. « Tout sélectionner » côté UI ne doit jamais élargir ce set.
 */
export function normalizeBrandIds(input: unknown): {
  ok: true;
  ids: string[];
} | {
  ok: false;
  error: string;
  status: 400;
} {
  if (!Array.isArray(input)) {
    return {
      ok: false,
      status: 400,
      error: "Le corps doit contenir un tableau ids.",
    };
  }

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of input) {
    if (typeof item !== "string") {
      return {
        ok: false,
        status: 400,
        error: "Chaque identifiant doit être une chaîne.",
      };
    }
    const id = item.trim();
    if (!id) {
      return {
        ok: false,
        status: 400,
        error: "Identifiant de marque vide refusé.",
      };
    }
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }

  if (ids.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "Aucun identifiant de marque fourni.",
    };
  }

  if (ids.length > MAX_BRAND_IDS_PER_DELETE) {
    return {
      ok: false,
      status: 400,
      error: `Maximum ${MAX_BRAND_IDS_PER_DELETE} marques par requête.`,
    };
  }

  return { ok: true, ids };
}

async function deleteBrandExclusiveData(
  tx: Prisma.TransactionClient,
  brandId: string
): Promise<void> {
  const campaigns = await tx.visibilityCampaign.findMany({
    where: { brandId },
    select: { id: true, status: true },
  });

  if (campaigns.some((item) => item.status === "running")) {
    throw new DeleteBrandConflictError(
      409,
      "Impossible de supprimer une marque dont une campagne est encore en cours d’analyse."
    );
  }

  const campaignIds = campaigns.map((item) => item.id);
  if (campaignIds.length > 0) {
    const responses = await tx.visibilityResponse.findMany({
      where: { campaignId: { in: campaignIds } },
      select: { id: true },
    });
    const responseIds = responses.map((item) => item.id);
    if (responseIds.length > 0) {
      // VisibilityCitation n’a pas de relation Prisma / onDelete.
      await tx.visibilityCitation.deleteMany({
        where: { responseId: { in: responseIds } },
      });
    }
    await tx.visibilityCampaign.deleteMany({
      where: { id: { in: campaignIds } },
    });
  }

  // Entités rattachées exclusivement via brandId (propriété démontrable).
  await tx.visibilityEntity.deleteMany({ where: { brandId } });

  await tx.visibilityBrand.delete({ where: { id: brandId } });
}

/**
 * Supprime une marque et ses données exclusives (campagnes → questions /
 * réponses / mentions ; citations ; entités brandId).
 *
 * Verrou async : statut campagne `running` (même mécanisme que
 * processVisibilityCampaign / deleteVisibilityCampaign). Aucun verrou
 * distribué séparé n’existe dans le module.
 */
export async function deleteVisibilityBrand(
  brandId: string
): Promise<DeleteBrandResult> {
  const trimmed = brandId.trim();
  if (!trimmed) {
    return { ok: false, status: 400, error: "Identifiant de marque invalide." };
  }

  try {
    const brand = await db.visibilityBrand.findUnique({
      where: { id: trimmed },
      select: {
        id: true,
        name: true,
        primaryDomain: true,
        _count: { select: { campaigns: true } },
      },
    });

    if (!brand) {
      return { ok: false, status: 404, error: "Marque introuvable." };
    }

    const running = await db.visibilityCampaign.findFirst({
      where: { brandId: brand.id, status: "running" },
      select: { id: true },
    });
    if (running) {
      return {
        ok: false,
        status: 409,
        error:
          "Impossible de supprimer une marque dont une campagne est encore en cours d’analyse.",
      };
    }

    await db.$transaction(async (tx) => {
      const fresh = await tx.visibilityBrand.findUnique({
        where: { id: brand.id },
        select: { id: true },
      });
      if (!fresh) {
        throw new DeleteBrandConflictError(404, "Marque introuvable.");
      }
      await deleteBrandExclusiveData(tx, brand.id);
    });

    return {
      ok: true,
      brand: {
        id: brand.id,
        name: brand.name,
        primaryDomain: brand.primaryDomain,
        campaignCount: brand._count.campaigns,
      },
    };
  } catch (error) {
    if (error instanceof DeleteBrandConflictError) {
      return { ok: false, status: error.status, error: error.message };
    }
    logError("ai-visibility", "delete brand failed", {
      brandId: trimmed,
      message: error instanceof Error ? error.message : "unknown",
    });
    return {
      ok: false,
      status: 500,
      error: "Impossible de supprimer la marque.",
    };
  }
}

/**
 * Suppression groupée : une transaction par marque. Les succès et échecs
 * sont rapportés séparément (pas de « tout OK » si un id échoue).
 */
export async function deleteVisibilityBrands(
  rawIds: unknown
): Promise<
  | { ok: true; result: DeleteBrandsBatchResult }
  | { ok: false; status: 400; error: string }
> {
  const normalized = normalizeBrandIds(rawIds);
  if (!normalized.ok) {
    return normalized;
  }

  const deleted: DeletedBrandInfo[] = [];
  const failed: DeleteBrandsBatchResult["failed"] = [];

  for (const id of normalized.ids) {
    const outcome = await deleteVisibilityBrand(id);
    if (outcome.ok) {
      deleted.push(outcome.brand);
    } else {
      failed.push({ id, status: outcome.status, error: outcome.error });
    }
  }

  return {
    ok: true,
    result: {
      deleted,
      failed,
      requestedCount: normalized.ids.length,
    },
  };
}
