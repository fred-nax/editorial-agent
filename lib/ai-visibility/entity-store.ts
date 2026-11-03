import type { VisibilityEntityCategory } from "@prisma/client";
import { db } from "../db";
import { categoryToLegacyKind, type ExtractedEntity } from "./constants";
import {
  mergeAliases,
  resolveIdentity,
  resolveParentKey,
} from "./resolve";

/**
 * Upsert d’entité avec résolution d’identité GEO 1.1.
 * Ne démarre jamais une classification manuelle verrouillée.
 */
export async function upsertVisibilityEntity(input: {
  brandId: string;
  entity: ExtractedEntity;
}): Promise<string> {
  const identity = resolveIdentity({
    name: input.entity.name,
    domain: input.entity.domain,
  });

  const existing =
    (await db.visibilityEntity.findFirst({
      where: {
        brandId: input.brandId,
        normalizedKey: identity.normalizedKey,
      },
    })) ??
    (await db.visibilityEntity.findFirst({
      where: {
        brandId: input.brandId,
        name: { equals: input.entity.name, mode: "insensitive" },
      },
    })) ??
    (identity.domain
      ? await db.visibilityEntity.findFirst({
          where: {
            brandId: input.brandId,
            domain: identity.domain,
            // Domaine seul : uniquement si pas un produit distinct
            normalizedKey: identity.normalizedKey,
          },
        })
      : null);

  if (existing) {
    const aliases = mergeAliases(existing.aliases, [
      identity.rawName,
      input.entity.rawName ?? identity.rawName,
    ]);

    // Ne pas écraser une correction manuelle
    if (existing.categoryManual) {
      await db.visibilityEntity.update({
        where: { id: existing.id },
        data: {
          aliases,
          domain: existing.domain ?? identity.domain,
          normalizedKey: existing.normalizedKey ?? identity.normalizedKey,
          canonicalName: existing.canonicalName ?? identity.canonicalName,
        },
      });
      return existing.id;
    }

    await db.visibilityEntity.update({
      where: { id: existing.id },
      data: {
        aliases,
        domain: existing.domain ?? identity.domain,
        normalizedKey: identity.normalizedKey,
        canonicalName: identity.canonicalName,
        category: input.entity.category as VisibilityEntityCategory,
        categoryConfidence: input.entity.categoryConfidence ?? null,
        categoryJustification: input.entity.categoryJustification ?? null,
        kind: categoryToLegacyKind(input.entity.category),
      },
    });
    return existing.id;
  }

  const created = await db.visibilityEntity.create({
    data: {
      brandId: input.brandId,
      name: identity.canonicalName,
      canonicalName: identity.canonicalName,
      domain: identity.domain,
      kind: categoryToLegacyKind(input.entity.category),
      category: input.entity.category as VisibilityEntityCategory,
      categoryConfidence: input.entity.categoryConfidence ?? null,
      categoryJustification: input.entity.categoryJustification ?? null,
      categoryManual: false,
      normalizedKey: identity.normalizedKey,
      aliases: [identity.rawName],
    },
  });
  return created.id;
}

export async function linkParentEntities(brandId: string): Promise<void> {
  const entities = await db.visibilityEntity.findMany({
    where: { brandId },
  });
  const byKey = new Map(
    entities
      .filter((item) => item.normalizedKey)
      .map((item) => [item.normalizedKey!, item])
  );

  for (const entity of entities) {
    if (!entity.normalizedKey || entity.parentEntityId) {
      continue;
    }
    const parentKey = resolveParentKey(entity.normalizedKey);
    if (!parentKey) {
      continue;
    }
    const parent = byKey.get(parentKey);
    if (parent && parent.id !== entity.id) {
      await db.visibilityEntity.update({
        where: { id: entity.id },
        data: { parentEntityId: parent.id },
      });
    }
  }
}

export async function updateEntityManualCorrection(input: {
  entityId: string;
  category?: VisibilityEntityCategory;
  aliases?: string[];
  canonicalName?: string;
  domain?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const entity = await db.visibilityEntity.findUnique({
    where: { id: input.entityId },
  });
  if (!entity) {
    return { ok: false, error: "Entité introuvable." };
  }

  const aliases =
    input.aliases !== undefined
      ? mergeAliases([], input.aliases)
      : undefined;

  await db.visibilityEntity.update({
    where: { id: input.entityId },
    data: {
      ...(input.category
        ? {
            category: input.category,
            kind: categoryToLegacyKind(
              input.category as ExtractedEntity["category"]
            ),
            categoryManual: true,
            categoryConfidence: 1,
            categoryJustification: "Correction manuelle (verrouillée).",
          }
        : {}),
      ...(aliases ? { aliases } : {}),
      ...(input.canonicalName
        ? {
            canonicalName: input.canonicalName.trim().slice(0, 120),
            name: input.canonicalName.trim().slice(0, 120),
          }
        : {}),
      ...(input.domain !== undefined
        ? { domain: input.domain ? input.domain.trim().slice(0, 120) : null }
        : {}),
    },
  });

  return { ok: true };
}

export async function createMentionsForResponse(input: {
  responseId: string;
  brandId: string;
  entities: ExtractedEntity[];
  analysisVersion: string;
}): Promise<number> {
  let created = 0;
  for (const entity of input.entities) {
    const entityId = await upsertVisibilityEntity({
      brandId: input.brandId,
      entity,
    });
    await db.visibilityMention.upsert({
      where: {
        responseId_entityId_kind: {
          responseId: input.responseId,
          entityId,
          kind: entity.mentionKind,
        },
      },
      create: {
        responseId: input.responseId,
        entityId,
        kind: entity.mentionKind,
        appearanceOrder: entity.appearanceOrder,
        excerpt: entity.excerpt,
        confidence: entity.confidence ?? entity.categoryConfidence ?? null,
        analysisVersion: input.analysisVersion,
        rawName: entity.rawName ?? entity.name,
      },
      update: {
        appearanceOrder: entity.appearanceOrder,
        excerpt: entity.excerpt,
        confidence: entity.confidence ?? entity.categoryConfidence ?? null,
        analysisVersion: input.analysisVersion,
        rawName: entity.rawName ?? entity.name,
      },
    });
    created += 1;
  }
  return created;
}
