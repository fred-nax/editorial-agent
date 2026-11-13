/**
 * Seed idempotent V7.5 — catalogue thématiques historiques.
 *
 * Usage :
 *   npx tsx scripts/seed-editorial-themes.ts
 *
 * Ne réécrit jamais une thématique déjà liée (legacyKey) ni les champs
 * d’une thématique existante homonyme (attache seulement legacyKey).
 */
import { db } from "../lib/db";
import {
  backfillOpportunityThemeIds,
  ensureHistoricalEditorialThemes,
} from "../lib/seo/theme-catalog";

async function main() {
  const result = await ensureHistoricalEditorialThemes();
  const backfilled = await backfillOpportunityThemeIds();
  console.log(
    JSON.stringify(
      {
        ok: true,
        ...result,
        opportunityThemeIdsBackfilled: backfilled,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
