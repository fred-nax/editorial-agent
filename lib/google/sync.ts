import { db } from "@/lib/db";
import { getGoogleConnection } from "@/lib/google/connection";
import { syncGa4Range } from "@/lib/google/ga4-sync";
import { syncSearchConsoleRange } from "@/lib/google/gsc-sync";
import { logError, logInfo } from "@/lib/logger";
import { WORKSPACE_IDS } from "@/lib/workspace/constants";

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

export async function hasRunningGoogleSync(): Promise<boolean> {
  const running = await db.googleSyncRun.findFirst({
    where: { status: "running" },
    select: { id: true },
  });
  return Boolean(running);
}

export async function startGoogleSync(mode: GoogleSyncMode): Promise<{
  runId: string;
}> {
  if (await hasRunningGoogleSync()) {
    throw new Error("Une synchronisation Google est déjà en cours.");
  }
  const connection = await getGoogleConnection();
  if (!connection || connection.status !== "connected") {
    throw new Error("Connectez Google avant de synchroniser.");
  }
  const selection = connection.selection;
  if (!selection?.gscPropertyUrl && !selection?.ga4PropertyId) {
    throw new Error("Sélectionnez au moins une propriété GSC ou GA4.");
  }

  const { start, end } = resolveSyncRange(mode);
  const run = await db.googleSyncRun.create({
    data: {
      // Phase A V7.11.1 : Google reste rattaché à l’espace WordPress.
      workspaceId: WORKSPACE_IDS.wordpress,
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
  const connection = await getGoogleConnection();
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

  const start = run.rangeStart ?? resolveSyncRange(run.mode as GoogleSyncMode).start;
  const end = run.rangeEnd ?? resolveSyncRange(run.mode as GoogleSyncMode).end;

  let gscUpserted = 0;
  let ga4Upserted = 0;

  try {
    if (selection.gscPropertyUrl) {
      gscUpserted = await syncSearchConsoleRange({
        propertyUrl: selection.gscPropertyUrl,
        start,
        end,
      });
    }
    if (selection.ga4PropertyId) {
      ga4Upserted = await syncGa4Range({
        propertyId: selection.ga4PropertyId,
        start,
        end,
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
    logInfo("google-sync", "completed", { runId, gscUpserted, ga4Upserted });
  } catch (error) {
    const message =
      error instanceof Error ? error.message.slice(0, 500) : "Erreur sync Google.";
    logError("google-sync", "failed", { runId, message });
    await db.googleSyncRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        gscUpserted,
        ga4Upserted,
        error: message,
        finishedAt: new Date(),
      },
    });
  }
}

export function enqueueGoogleSync(runId: string): void {
  void processGoogleSync(runId).catch(async (error) => {
    const message =
      error instanceof Error ? error.message.slice(0, 500) : "Erreur inattendue.";
    await db.googleSyncRun
      .update({
        where: { id: runId },
        data: { status: "failed", error: message, finishedAt: new Date() },
      })
      .catch(() => undefined);
  });
}

export async function getGoogleSyncStatus() {
  const [last, running, connection] = await Promise.all([
    db.googleSyncRun.findFirst({ orderBy: { startedAt: "desc" } }),
    db.googleSyncRun.findFirst({
      where: { status: "running" },
      orderBy: { startedAt: "desc" },
    }),
    getGoogleConnection(),
  ]);
  return { last, running, connection };
}

/** Reprise soft des runs coincés (ex. redémarrage process). */
export async function recoverStaleGoogleSyncs(maxAgeMs = 45 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const result = await db.googleSyncRun.updateMany({
    where: { status: "running", startedAt: { lt: cutoff } },
    data: {
      status: "failed",
      error: "Synchronisation interrompue (reprise après redémarrage).",
      finishedAt: new Date(),
    },
  });
  return result.count;
}
