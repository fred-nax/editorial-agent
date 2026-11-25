/**
 * Synchronisation inventaire Webflow — lecture seule Data API V2.
 * workspaceId + config figés au démarrage du run (pas de cookie).
 */

import { db } from "@/lib/db";
import { logError, logInfo } from "@/lib/logger";
import { createWebflowClient } from "@/lib/webflow/client";
import { WebflowApiError } from "@/lib/webflow/errors";
import {
  resolveWebflowInventoryConfig,
  type WebflowInventoryConfig,
} from "@/lib/webflow/inventory-config";
import { normalizeWebflowInventoryItem } from "@/lib/webflow/inventory-normalize";
import { listAllWebflowCollectionItems } from "@/lib/webflow/items";
import {
  getWorkspaceByIdOrSlug,
  workspaceWhere,
} from "@/lib/workspace";

const STALE_RUNNING_MS = 30 * 60 * 1000;

type PersistInput = {
  id: string;
  status: string;
  fetchedCount?: number;
  upsertedCount?: number;
  createdCount?: number;
  updatedCount?: number;
  unchangedCount?: number;
  missingCount?: number;
  expectedTotal?: number | null;
  storedCount?: number | null;
  pagesFetched?: number | null;
  totalPages?: number | null;
  liveFetchedCount?: number | null;
  statusBreakdown?: Record<string, number> | null;
  diagnosticNote?: string | null;
  error?: string | null;
  siteId?: string | null;
  collectionId?: string | null;
};

async function persistWebflowSyncRun(input: PersistInput): Promise<void> {
  const finished =
    input.status === "completed" || input.status === "failed"
      ? new Date()
      : undefined;
  await db.webflowSyncRun.update({
    where: { id: input.id },
    data: {
      status: input.status,
      fetchedCount: input.fetchedCount,
      upsertedCount: input.upsertedCount,
      createdCount: input.createdCount,
      updatedCount: input.updatedCount,
      unchangedCount: input.unchangedCount,
      missingCount: input.missingCount,
      expectedTotal: input.expectedTotal ?? undefined,
      storedCount: input.storedCount ?? undefined,
      pagesFetched: input.pagesFetched ?? undefined,
      totalPages: input.totalPages ?? undefined,
      liveFetchedCount: input.liveFetchedCount ?? undefined,
      statusBreakdown: input.statusBreakdown ?? undefined,
      diagnosticNote: input.diagnosticNote ?? undefined,
      error: input.error ?? undefined,
      siteId: input.siteId ?? undefined,
      collectionId: input.collectionId ?? undefined,
      finishedAt: finished,
    },
  });
}

export async function recoverStaleWebflowSyncRuns(
  workspaceId?: string
): Promise<number> {
  const where = {
    status: "running" as const,
    startedAt: { lt: new Date(Date.now() - STALE_RUNNING_MS) },
    ...(workspaceId ? { workspaceId } : {}),
  };
  const result = await db.webflowSyncRun.updateMany({
    where,
    data: {
      status: "failed",
      error:
        "Synchronisation interrompue (délai dépassé). L’inventaire précédent est conservé.",
      finishedAt: new Date(),
    },
  });
  return result.count;
}

export async function processWebflowInventorySync(options: {
  runId: string;
}): Promise<void> {
  const run = await db.webflowSyncRun.findUnique({
    where: { id: options.runId },
  });
  if (!run || run.status !== "running") {
    return;
  }

  // Config figée au démarrage — jamais re-lue depuis le cookie.
  const workspace = await getWorkspaceByIdOrSlug(run.workspaceId);
  if (!workspace || workspace.cmsProvider !== "webflow") {
    await persistWebflowSyncRun({
      id: run.id,
      status: "failed",
      error: "Espace Webflow introuvable pour ce run.",
    });
    return;
  }

  let config: WebflowInventoryConfig;
  try {
    config = await resolveWebflowInventoryConfig(workspace);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, 500)
        : "Configuration Webflow invalide.";
    await persistWebflowSyncRun({
      id: run.id,
      status: "failed",
      error: message,
    });
    return;
  }

  // Verrouille site/collection sur le run immédiatement.
  await persistWebflowSyncRun({
    id: run.id,
    status: "running",
    siteId: config.siteId,
    collectionId: config.collectionId,
  });

  const frozen = {
    workspaceId: config.workspaceId,
    siteId: config.siteId,
    collectionId: config.collectionId,
    fieldMapping: config.fieldMapping,
  };

  const client = createWebflowClient({
    apiToken: config.apiToken,
    timeoutMs: 30_000,
  });

  const notes: string[] = [];
  let pagesFetched = 0;
  let expectedTotal: number | null = null;
  let liveFetchedCount = 0;

  try {
    const staged = await listAllWebflowCollectionItems(
      client,
      frozen.collectionId,
      {
        live: false,
        onPage: (_page, index) => {
          if (index === 0) {
            // no-op hook for future progress
          }
        },
      }
    );
    pagesFetched += staged.pagesFetched;
    expectedTotal = staged.expectedTotal;

    let liveIds = new Set<string>();
    try {
      const live = await listAllWebflowCollectionItems(
        client,
        frozen.collectionId,
        { live: true }
      );
      pagesFetched += live.pagesFetched;
      liveFetchedCount = live.items.length;
      liveIds = new Set(live.items.map((item) => item.id));
    } catch (error) {
      // Site non publié / live indisponible : on poursuit en staged-only.
      if (
        error instanceof WebflowApiError &&
        (error.code === "forbidden" ||
          error.code === "not_found" ||
          error.code === "bad_request")
      ) {
        notes.push(
          "Liste live indisponible (site non publié ou endpoint live refusé) — statuts dérivés des flags staged (isDraft / lastPublished)."
        );
        liveFetchedCount = 0;
      } else {
        throw error;
      }
    }

    let createdCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;
    let upsertedCount = 0;
    const statusBreakdown: Record<string, number> = {};
    const seenIds = new Set<string>();

    for (const remote of staged.items) {
      seenIds.add(remote.id);
      const normalized = normalizeWebflowInventoryItem(
        remote,
        frozen.fieldMapping,
        { isLive: liveIds.has(remote.id) }
      );
      statusBreakdown[normalized.status] =
        (statusBreakdown[normalized.status] ?? 0) + 1;

      const existing = await db.webflowCmsItem.findUnique({
        where: {
          workspaceId_collectionId_webflowItemId: {
            workspaceId: frozen.workspaceId,
            collectionId: frozen.collectionId,
            webflowItemId: remote.id,
          },
        },
      });

      const data = {
        siteId: frozen.siteId,
        title: normalized.title,
        slug: normalized.slug,
        url: normalized.url,
        status: normalized.status,
        isDraft: normalized.isDraft,
        isArchived: normalized.isArchived,
        isLive: normalized.isLive,
        excerpt: normalized.excerpt,
        contentHtml: normalized.contentHtml,
        contentText: normalized.contentText,
        metaTitle: normalized.metaTitle,
        metaDescription: normalized.metaDescription,
        featuredImageUrl: normalized.featuredImageUrl,
        featuredImageAlt: normalized.featuredImageAlt,
        categoryRef: normalized.categoryRef,
        authorRef: normalized.authorRef,
        createdOnAt: normalized.createdOnAt,
        lastUpdatedAt: normalized.lastUpdatedAt,
        lastPublishedAt: normalized.lastPublishedAt,
        missingAt: null as Date | null,
        syncedAt: new Date(),
      };

      if (!existing) {
        await db.webflowCmsItem.create({
          data: {
            workspaceId: frozen.workspaceId,
            webflowItemId: remote.id,
            collectionId: frozen.collectionId,
            ...data,
          },
        });
        createdCount += 1;
        upsertedCount += 1;
        continue;
      }

      const sameUpdated =
        (existing.lastUpdatedAt?.getTime() ?? null) ===
          (normalized.lastUpdatedAt?.getTime() ?? null) &&
        existing.status === normalized.status &&
        existing.isLive === normalized.isLive &&
        existing.title === normalized.title &&
        existing.slug === normalized.slug;

      if (sameUpdated && existing.missingAt === null) {
        unchangedCount += 1;
        await db.webflowCmsItem.update({
          where: { id: existing.id },
          data: { syncedAt: new Date(), missingAt: null },
        });
        continue;
      }

      await db.webflowCmsItem.update({
        where: { id: existing.id },
        data,
      });
      updatedCount += 1;
      upsertedCount += 1;
    }

    // Marquage missing uniquement après sync complète réussie (pas de hard-delete).
    const markedMissing = await db.webflowCmsItem.updateMany({
      where: {
        workspaceId: frozen.workspaceId,
        collectionId: frozen.collectionId,
        webflowItemId: { notIn: [...seenIds] },
        missingAt: null,
      },
      data: {
        status: "missing",
        missingAt: new Date(),
        syncedAt: new Date(),
      },
    });

    const storedCount = await db.webflowCmsItem.count({
      where: {
        workspaceId: frozen.workspaceId,
        collectionId: frozen.collectionId,
      },
    });

    if (staged.items.length === 0) {
      notes.push("Collection Webflow vide.");
    }

    await persistWebflowSyncRun({
      id: run.id,
      status: "completed",
      siteId: frozen.siteId,
      collectionId: frozen.collectionId,
      fetchedCount: staged.items.length,
      upsertedCount,
      createdCount,
      updatedCount,
      unchangedCount,
      missingCount: markedMissing.count,
      expectedTotal,
      storedCount,
      pagesFetched,
      totalPages:
        expectedTotal !== null
          ? Math.max(1, Math.ceil(expectedTotal / 100))
          : pagesFetched,
      liveFetchedCount,
      statusBreakdown,
      diagnosticNote: notes.length > 0 ? notes.join(" ") : null,
      error: null,
    });

    logInfo("webflow-inventory", "sync completed", {
      runId: run.id,
      workspaceId: frozen.workspaceId,
      fetched: staged.items.length,
      created: createdCount,
      updated: updatedCount,
      unchanged: unchangedCount,
      missing: markedMissing.count,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, 500)
        : "Synchronisation Webflow impossible.";
    // Échec : conserver l’inventaire précédent (aucun marquage missing).
    await persistWebflowSyncRun({
      id: run.id,
      status: "failed",
      siteId: frozen.siteId,
      collectionId: frozen.collectionId,
      error: message,
      diagnosticNote:
        "Échec sync — inventaire local précédent conservé intact.",
    });
    logError("webflow-inventory", "sync failed", {
      runId: run.id,
      message,
    });
  }
}

export function enqueueWebflowInventorySync(runId: string): void {
  void processWebflowInventorySync({ runId }).catch(async (error) => {
    const message =
      error instanceof Error ? error.message.slice(0, 500) : "unknown";
    await persistWebflowSyncRun({
      id: runId,
      status: "failed",
      error: message,
      diagnosticNote:
        "Échec sync (enqueue) — inventaire local précédent conservé.",
    }).catch(() => undefined);
  });
}

export async function getWebflowInventoryDiagnostic(workspaceId: string): Promise<{
  count: number;
  byStatus: Record<string, number>;
  lastSync: Awaited<ReturnType<typeof db.webflowSyncRun.findFirst>>;
  running: Awaited<ReturnType<typeof db.webflowSyncRun.findFirst>>;
}> {
  const [count, grouped, lastSync, running] = await Promise.all([
    db.webflowCmsItem.count({
      where: { ...workspaceWhere(workspaceId), missingAt: null },
    }),
    db.webflowCmsItem.groupBy({
      by: ["status"],
      where: { ...workspaceWhere(workspaceId), missingAt: null },
      _count: { _all: true },
    }),
    db.webflowSyncRun.findFirst({
      where: workspaceWhere(workspaceId),
      orderBy: { startedAt: "desc" },
    }),
    db.webflowSyncRun.findFirst({
      where: { ...workspaceWhere(workspaceId), status: "running" },
      orderBy: { startedAt: "desc" },
    }),
  ]);

  const byStatus: Record<string, number> = {};
  for (const row of grouped) {
    byStatus[row.status] = row._count._all;
  }

  return { count, byStatus, lastSync, running };
}
