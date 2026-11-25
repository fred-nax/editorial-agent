import { db } from "@/lib/db";
import { getGoogleConnection } from "@/lib/google/connection";
import { syncGa4Range } from "@/lib/google/ga4-sync";
import { syncSearchConsoleRange } from "@/lib/google/gsc-sync";
import { toPublicGoogleError } from "@/lib/google/public-errors";
import { logError, logInfo } from "@/lib/logger";
import { WORKSPACE_IDS } from "@/lib/workspace";

export type GoogleSyncMode = "initial" | "daily" | "manual";

function utcToday(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Fenêtre de sync demandée à l’API.
 * Fin = veille (demande) : les jours sans données finales sont omis par GSC
 * (`dataState: final`) — on ne suppose pas que J−1 est toujours consolidé.
 * initial = 90 j ; daily/manual = 7 derniers jours (rafraîchissement).
 * Le backfill propriété 90 j (table vide) est géré dans syncSearchConsoleRange.
 */
export function resolveSyncRange(mode: GoogleSyncMode): {
  start: Date;
  end: Date;
} {
  const end = addDays(utcToday(), -1);
  if (mode === "initial") {
    return { start: addDays(end, -89), end };
  }
  return { start: addDays(end, -6), end };
}

export async function hasRunningGoogleSync(
  workspaceId?: string
): Promise<boolean> {
  const running = await db.googleSyncRun.findFirst({
    where: {
      status: "running",
      ...(workspaceId ? { workspaceId } : {}),
    },
    select: { id: true },
  });
  return Boolean(running);
}

export async function startGoogleSync(
  mode: GoogleSyncMode,
  workspaceId: string = WORKSPACE_IDS.wordpress
): Promise<{
  runId: string;
}> {
  const wsId = workspaceId.trim() || WORKSPACE_IDS.wordpress;
  if (await hasRunningGoogleSync(wsId)) {
    throw new Error("Une synchronisation Google est déjà en cours pour cet espace.");
  }
  const connection = await getGoogleConnection(wsId);
  if (!connection || connection.status !== "connected") {
    throw new Error("Connectez Google avant de synchroniser.");
  }
  const selection = connection.selection;
  // V7.14.1 : GSC et/ou GA4 par espace (WordPress et Webflow).
  if (!selection?.gscPropertyUrl && !selection?.ga4PropertyId) {
    throw new Error(
      "Sélectionnez au moins une propriété Search Console ou Google Analytics pour cet espace."
    );
  }

  const { start, end } = resolveSyncRange(mode);
  const run = await db.googleSyncRun.create({
    data: {
      workspaceId: wsId,
      connectionId: "default",
      status: "running",
      mode,
      rangeStart: start,
      rangeEnd: end,
    },
  });
  return { runId: run.id };
}

export async function processGoogleSync(runId: string): Promise<void> {
  const run = await db.googleSyncRun.findUnique({ where: { id: runId } });
  if (!run || run.status !== "running") {
    return;
  }
  const workspaceId = run.workspaceId?.trim() || WORKSPACE_IDS.wordpress;
  // Figé au lancement : workspace + sélection lus pour ce workspace uniquement.
  const connection = await getGoogleConnection(workspaceId);
  const selection = connection?.selection;
  if (!selection) {
    await db.googleSyncRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        error: "Aucune sélection de propriété.",
        finishedAt: new Date(),
      },
    });
    return;
  }

  const frozenProperty = selection.gscPropertyUrl?.trim() || null;
  const frozenGa4 = selection.ga4PropertyId?.trim() || null;

  const start = run.rangeStart ?? resolveSyncRange(run.mode as GoogleSyncMode).start;
  const end = run.rangeEnd ?? resolveSyncRange(run.mode as GoogleSyncMode).end;

  let gscUpserted = 0;
  let ga4Upserted = 0;

  try {
    if (frozenProperty) {
      gscUpserted = await syncSearchConsoleRange({
        propertyUrl: frozenProperty,
        start,
        end,
        workspaceId,
      });
    }
    if (frozenGa4) {
      ga4Upserted = await syncGa4Range({
        propertyId: frozenGa4,
        start,
        end,
        workspaceId,
      });
    }
    await db.googleSyncRun.update({
      where: { id: runId },
      data: {
        status: "completed",
        gscUpserted,
        ga4Upserted,
        finishedAt: new Date(),
        error: null,
      },
    });
    logInfo("google-sync", "completed", {
      runId,
      workspaceId,
      gscUpserted,
      ga4Upserted,
    });
  } catch (error) {
    const technical =
      error instanceof Error ? error.message : "Erreur sync Google.";
    const kind =
      technical.toLowerCase().includes("analytics") ||
      technical.toLowerCase().includes("ga4")
        ? "ga4_sync"
        : technical.toLowerCase().includes("gsc") ||
            technical.toLowerCase().includes("search console") ||
            technical.toLowerCase().includes("webmaster") ||
            technical.toLowerCase().includes("gscpagedailystat")
          ? "gsc_sync"
          : "google_sync";
    const publicMessage = toPublicGoogleError(error, kind);
    logError("google-sync", "failed", {
      runId,
      workspaceId,
      publicMessage,
      technical: technical.slice(0, 4000),
    });
    await db.googleSyncRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        gscUpserted,
        ga4Upserted,
        // UI / API : message public uniquement (détail technique dans les logs).
        error: publicMessage.slice(0, 500),
        finishedAt: new Date(),
      },
    });
  }
}

export function enqueueGoogleSync(runId: string): void {
  void processGoogleSync(runId).catch(async (error) => {
    const publicMessage = toPublicGoogleError(error, "google_sync");
    logError("google-sync", "enqueue failed", {
      runId,
      publicMessage,
      technical:
        error instanceof Error ? error.message.slice(0, 4000) : String(error),
    });
    await db.googleSyncRun
      .update({
        where: { id: runId },
        data: {
          status: "failed",
          error: publicMessage.slice(0, 500),
          finishedAt: new Date(),
        },
      })
      .catch(() => undefined);
  });
}

export async function getGoogleSyncStatus(
  workspaceId: string = WORKSPACE_IDS.wordpress
) {
  const wsId = workspaceId.trim() || WORKSPACE_IDS.wordpress;
  const [last, lastSuccess, running, connection] = await Promise.all([
    db.googleSyncRun.findFirst({
      where: { workspaceId: wsId },
      orderBy: { startedAt: "desc" },
    }),
    db.googleSyncRun.findFirst({
      where: { workspaceId: wsId, status: "completed" },
      orderBy: { finishedAt: "desc" },
    }),
    db.googleSyncRun.findFirst({
      where: { status: "running", workspaceId: wsId },
      orderBy: { startedAt: "desc" },
    }),
    getGoogleConnection(wsId),
  ]);
  return { last, lastSuccess, running, connection };
}

/** Reprise soft des runs coincés (ex. redémarrage process). */
export async function recoverStaleGoogleSyncs(
  maxAgeMs = 45 * 60 * 1000,
  workspaceId?: string
): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const result = await db.googleSyncRun.updateMany({
    where: {
      status: "running",
      startedAt: { lt: cutoff },
      ...(workspaceId ? { workspaceId } : {}),
    },
    data: {
      status: "failed",
      error: "Synchronisation interrompue (reprise après redémarrage).",
      finishedAt: new Date(),
    },
  });
  return result.count;
}
