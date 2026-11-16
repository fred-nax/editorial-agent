import { db } from "./db";
import { assertRequiredEnv } from "./env-check";
import { enqueueArticleGeneration } from "./generation";
import { recoverStaleGenerations } from "./generation-recovery";
import { recoverFeaturedImageJobs } from "./images/pipeline";
import { logError, logInfo } from "./logger";
import { ensureHistoricalEditorialThemes } from "./seo/theme-catalog";
import { shouldSeedHistoricalEditorialThemes } from "./seo/theme-seed-policy";

export async function bootServer(): Promise<void> {
  assertRequiredEnv();
  logInfo("boot", "starting");

  // V7.5 / V7.8 — seed des 5 domaines historiques uniquement si installation Naxialis
  // ou thématiques legacy déjà présentes (jamais imposé aux nouveaux clients).
  try {
    if (await shouldSeedHistoricalEditorialThemes()) {
      const themes = await ensureHistoricalEditorialThemes();
      logInfo("boot", "editorial themes ensure", themes);
    } else {
      logInfo("boot", "editorial themes ensure skipped (neutral client install)");
    }
  } catch (error) {
    logError("boot", "editorial themes ensure failed", {
      message: error instanceof Error ? error.message : "Erreur seed thèmes.",
    });
  }

  const recovered = await recoverStaleGenerations({ fromBoot: true });
  logInfo("boot", "recovery complete", { count: recovered });

  const featuredRecovery = await recoverFeaturedImageJobs({ fromBoot: true });
  logInfo("boot", "featured image recovery complete", featuredRecovery);

  const queued = await db.articleGeneration.findMany({
    where: { status: "queued" },
    select: { id: true },
  });

  for (const item of queued) {
    enqueueArticleGeneration(item.id);
  }

  if (queued.length > 0) {
    logInfo("boot", "requeued generations", { count: queued.length });
  }

  logInfo("boot", "ready");
}

export async function registerServerBoot(): Promise<void> {
  try {
    await bootServer();
  } catch (error) {
    logError("boot", "failed", {
      message: error instanceof Error ? error.message : "Erreur de démarrage.",
    });
  }
}
