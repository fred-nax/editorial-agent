/**
 * Dry-run recalcul coûts LLM historiques (lecture seule).
 * Usage: npx tsx releases/dry-run-cost-recalc-v7131.mts
 */
import "dotenv/config";
import { dryRunHistoricalLlmCostRecalc } from "../lib/openai-cost-recalc";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  console.log(
    "DB=",
    url.replace(/:[^:@/]+@/, ":***@"),
    url.includes("migtest") ? "(migtest)" : ""
  );

  const result = await dryRunHistoricalLlmCostRecalc({ limit: 10_000 });
  console.log(
    JSON.stringify(
      {
        scanned: result.scanned,
        recalculable: result.recalculable,
        skipValid: result.skipValid,
        skipInsufficient: result.skipInsufficient,
        skipUnknownRate: result.skipUnknownRate,
        byModel: result.byModel,
        byWorkspace: result.byWorkspace,
        sample: result.sample.slice(0, 12),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
