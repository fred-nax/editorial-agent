/**
 * Synchronisation idempotente des catalogues category / author Webflow.
 * Soft-missing uniquement après une sync complète réussie.
 */

import { db } from "@/lib/db";
import { createWebflowClient } from "@/lib/webflow/client";
import { listAllWebflowCollectionItems } from "@/lib/webflow/items";
import {
  discoverWebflowReferenceTargets,
  type WebflowReferenceKind,
} from "@/lib/webflow/references-discover";
import type { WebflowFieldMapping } from "@/lib/webflow/types";
import { resolveWebflowInventoryConfig } from "@/lib/webflow/inventory-config";
import { logError, logInfo } from "@/lib/logger";
import {
  assertModuleAllowedForWorkspace,
  getWorkspaceByIdOrSlug,
} from "@/lib/workspace";

export type WebflowReferencesSyncResult = {
  ok: boolean;
  workspaceId: string;
  siteId: string;
  syncedAt: string;
  categoriesUpserted: number;
  authorsUpserted: number;
  markedMissing: number;
  issues: string[];
  targets: Array<{
    kind: WebflowReferenceKind;
    collectionId: string;
    collectionName: string | null;
    count: number;
  }>;
};

function itemName(fieldData: Record<string, unknown>): string {
  for (const key of ["name", "title", " Nom"]) {
    const value = fieldData[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim().slice(0, 300);
    }
  }
  // Premier PlainText non vide
  for (const value of Object.values(fieldData)) {
    if (typeof value === "string" && value.trim() && value.length < 200) {
      return value.trim();
    }
  }
  return "Sans nom";
}

function itemSlug(fieldData: Record<string, unknown>): string | null {
  const slug = fieldData.slug;
  return typeof slug === "string" && slug.trim() ? slug.trim().slice(0, 200) : null;
}

/**
 * Sync catégories + auteurs pour un workspace Webflow.
 * Ne vide jamais le catalogue en cas d’échec partiel.
 */
export async function syncWebflowCmsReferences(input: {
  workspaceId: string;
  fetchImpl?: typeof fetch;
}): Promise<WebflowReferencesSyncResult> {
  const workspaceId = input.workspaceId.trim();
  const workspace = await getWorkspaceByIdOrSlug(workspaceId);
  if (!workspace) {
    return {
      ok: false,
      workspaceId,
      siteId: "",
      syncedAt: new Date().toISOString(),
      categoriesUpserted: 0,
      authorsUpserted: 0,
      markedMissing: 0,
      issues: ["Espace éditorial introuvable."],
      targets: [],
    };
  }
  assertModuleAllowedForWorkspace(workspace, "inventory");

  let config;
  try {
    config = await resolveWebflowInventoryConfig(workspace);
  } catch (error) {
    return {
      ok: false,
      workspaceId,
      siteId: "",
      syncedAt: new Date().toISOString(),
      categoriesUpserted: 0,
      authorsUpserted: 0,
      markedMissing: 0,
      issues: [
        error instanceof Error
          ? error.message
          : "Configuration Webflow incomplète.",
      ],
      targets: [],
    };
  }

  const mapping = (config.fieldMapping ?? {}) as WebflowFieldMapping;
  const client = createWebflowClient({
    apiToken: config.apiToken,
    fetchImpl: input.fetchImpl,
  });

  const discovery = await discoverWebflowReferenceTargets({
    client,
    siteId: config.siteId,
    blogCollectionId: config.collectionId,
    mapping,
  });

  if (discovery.targets.length === 0) {
    return {
      ok: false,
      workspaceId,
      siteId: config.siteId,
      syncedAt: new Date().toISOString(),
      categoriesUpserted: 0,
      authorsUpserted: 0,
      markedMissing: 0,
      issues:
        discovery.issues.length > 0
          ? discovery.issues
          : [
              "Aucun champ Reference category/author mappé. Complétez le mapping CMS.",
            ],
      targets: [],
    };
  }

  let categoriesUpserted = 0;
  let authorsUpserted = 0;
  let markedMissing = 0;
  const issues = [...discovery.issues];
  const targetSummaries: WebflowReferencesSyncResult["targets"] = [];
  const seenIdsByKind = new Map<WebflowReferenceKind, Set<string>>();

  try {
    for (const target of discovery.targets) {
      const listed = await listAllWebflowCollectionItems(
        client,
        target.referencedCollectionId,
        { live: false }
      );
      const seen = new Set<string>();
      seenIdsByKind.set(target.kind, seen);

      for (const item of listed.items) {
        if (item.isArchived) {
          continue;
        }
        seen.add(item.id);
        const name = itemName(item.fieldData);
        const slug = itemSlug(item.fieldData);
        const lastModifiedAt = item.lastUpdated
          ? new Date(item.lastUpdated)
          : null;

        await db.webflowCmsReference.upsert({
          where: {
            workspaceId_kind_collectionId_webflowItemId_cmsLocaleId: {
              workspaceId,
              kind: target.kind,
              collectionId: target.referencedCollectionId,
              webflowItemId: item.id,
              cmsLocaleId: "",
            },
          },
          create: {
            workspaceId,
            kind: target.kind,
            siteId: config.siteId,
            collectionId: target.referencedCollectionId,
            webflowItemId: item.id,
            cmsLocaleId: "",
            name,
            slug,
            isDraft: item.isDraft,
            isArchived: item.isArchived,
            missingAt: null,
            lastModifiedAt:
              lastModifiedAt && !Number.isNaN(lastModifiedAt.getTime())
                ? lastModifiedAt
                : null,
            syncedAt: new Date(),
          },
          update: {
            siteId: config.siteId,
            name,
            slug,
            isDraft: item.isDraft,
            isArchived: item.isArchived,
            missingAt: null,
            lastModifiedAt:
              lastModifiedAt && !Number.isNaN(lastModifiedAt.getTime())
                ? lastModifiedAt
                : null,
            syncedAt: new Date(),
          },
        });

        if (target.kind === "category") {
          categoriesUpserted += 1;
        } else {
          authorsUpserted += 1;
        }
      }

      targetSummaries.push({
        kind: target.kind,
        collectionId: target.referencedCollectionId,
        collectionName: target.referencedCollectionName,
        count: seen.size,
      });
    }

    // Soft-missing uniquement après succès complet de toutes les collections.
    const now = new Date();
    for (const [kind, seen] of seenIdsByKind) {
      const existing = await db.webflowCmsReference.findMany({
        where: {
          workspaceId,
          kind,
          missingAt: null,
        },
        select: { id: true, webflowItemId: true, collectionId: true },
      });
      const target = discovery.targets.find((t) => t.kind === kind);
      if (!target) {
        continue;
      }
      for (const row of existing) {
        if (
          row.collectionId === target.referencedCollectionId &&
          !seen.has(row.webflowItemId)
        ) {
          await db.webflowCmsReference.update({
            where: { id: row.id },
            data: { missingAt: now },
          });
          markedMissing += 1;
        }
      }
    }

    await db.workspaceCmsSettings.updateMany({
      where: { workspaceId },
      data: { webflowReferencesSyncedAt: now },
    });

    logInfo("webflow-references", "sync completed", {
      workspaceId,
      categoriesUpserted,
      authorsUpserted,
      markedMissing,
    });

    return {
      ok: issues.length === 0,
      workspaceId,
      siteId: config.siteId,
      syncedAt: now.toISOString(),
      categoriesUpserted,
      authorsUpserted,
      markedMissing,
      issues,
      targets: targetSummaries,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Échec de synchronisation.";
    logError("webflow-references", "sync failed — catalogue préservé", {
      workspaceId,
      message,
    });
    return {
      ok: false,
      workspaceId,
      siteId: config.siteId,
      syncedAt: new Date().toISOString(),
      categoriesUpserted,
      authorsUpserted,
      markedMissing: 0,
      issues: [...issues, message],
      targets: targetSummaries,
    };
  }
}

export async function listSelectableWebflowReferences(input: {
  workspaceId: string;
  kind: WebflowReferenceKind;
}): Promise<
  Array<{
    id: string;
    webflowItemId: string;
    name: string;
    slug: string | null;
    isDraft: boolean;
    collectionId: string;
  }>
> {
  const rows = await db.webflowCmsReference.findMany({
    where: {
      workspaceId: input.workspaceId,
      kind: input.kind,
      missingAt: null,
      isArchived: false,
    },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      webflowItemId: true,
      name: true,
      slug: true,
      isDraft: true,
      collectionId: true,
    },
  });
  return rows;
}
