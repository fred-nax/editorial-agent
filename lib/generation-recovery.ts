import { db } from "./db";
import { INTERRUPTED_ERROR, STALE_GENERATION_MS } from "./generation-errors";
import { recoverFeaturedImageJobs } from "./images/pipeline";
import { logInfo } from "./logger";

/** Évite de rejouer recovery + featured-image sur chaque navigation RSC. */
const PAGE_RECOVERY_MIN_INTERVAL_MS = 60_000;
let lastPageRecoveryAt = 0;

export async function recoverStaleGenerations(
  options: { fromBoot?: boolean } = {}
): Promise<number> {
  const fromBoot = options.fromBoot === true;
  if (!fromBoot) {
    const now = Date.now();
    if (now - lastPageRecoveryAt < PAGE_RECOVERY_MIN_INTERVAL_MS) {
      return 0;
    }
    lastPageRecoveryAt = now;
  }

  const cutoff = new Date(Date.now() - STALE_GENERATION_MS);

  const stale = await db.articleGeneration.findMany({
    where: fromBoot
      ? { status: "running" }
      : { status: "running", updatedAt: { lt: cutoff } },
    select: { id: true, topicId: true },
  });

  if (stale.length > 0) {
    await db.articleGeneration.updateMany({
      where: {
        id: { in: stale.map((item) => item.id) },
      },
      data: {
        status: "failed",
        error: INTERRUPTED_ERROR,
        progressStage: "failed",
        progressMessage: "Génération interrompue.",
        progressUpdatedAt: new Date(),
      },
    });

    const topicIds = stale
      .map((item) => item.topicId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    if (topicIds.length > 0) {
      await db.topic.updateMany({
        where: {
          id: { in: topicIds },
          status: "generating",
        },
        data: { status: "pending" },
      });
    }
  }

  if (fromBoot) {
    const activeTopicIds = (
      await db.articleGeneration.findMany({
        where: {
          status: { in: ["queued", "running"] },
          topicId: { not: null },
        },
        select: { topicId: true },
      })
    )
      .map((item) => item.topicId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    await db.topic.updateMany({
      where: {
        status: "generating",
        ...(activeTopicIds.length > 0 ? { id: { notIn: activeTopicIds } } : {}),
      },
      data: { status: "pending" },
    });
  } else {
    await db.topic.updateMany({
      where: {
        status: "generating",
        updatedAt: { lt: cutoff },
      },
      data: { status: "pending" },
    });
  }

  if (stale.length > 0) {
    logInfo(
      fromBoot ? "boot" : "generation",
      fromBoot
        ? "interrupted generations recovered"
        : "stale generations recovered",
      { count: stale.length }
    );
  }

  if (!fromBoot) {
    await recoverFeaturedImageJobs();
  }

  return stale.length;
}
