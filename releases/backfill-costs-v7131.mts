/**
 * Backfill sécurisé estimatedCost — uniquement lignes null avec tarif identifiable.
 * Cible : naxialis_agent (refuse migtest).
 *
 * Usage: npx tsx releases/backfill-costs-v7131.mts
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { db } from "../lib/db";
import {
  estimateLlmCostUsd,
  getModelRates,
  resolvePricingModelId,
} from "../lib/openai-pricing";
import { shouldBackfillEstimatedCost } from "../lib/openai-cost-recalc";

const TARGET_IDS = [
  "cmwwetzet000b5waxg3obu8vi",
  "cmww9i3xs0000qgaxeoh0h854",
  "cmwv4t56y0000rkaxgcczfxah",
];

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  console.log("DB=", url.replace(/:[^:@/]+@/, ":***@"));
  if (!url.includes("naxialis_agent") || url.includes("migtest")) {
    throw new Error("REFUSE: DATABASE_URL doit cibler naxialis_agent (pas migtest).");
  }

  const before = await db.articleGeneration.findMany({
    where: { id: { in: TARGET_IDS } },
    select: {
      id: true,
      workspaceId: true,
      cmsDestination: true,
      model: true,
      createdAt: true,
      inputTokens: true,
      cachedInputTokens: true,
      outputTokens: true,
      estimatedCost: true,
      status: true,
    },
  });

  mkdirSync(join(process.cwd(), "backups"), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = join(
    process.cwd(),
    "backups",
    `v7131-cost-backfill-${stamp}.json`
  );
  writeFileSync(backupPath, JSON.stringify({ before }, null, 2), "utf8");
  console.log("backup=", backupPath);

  const plan: Array<{
    id: string;
    old: number | null;
    next: number;
    model: string;
  }> = [];

  for (const row of before) {
    if (!shouldBackfillEstimatedCost({ current: row.estimatedCost, next: 1 })) {
      console.log("SKIP_VALID", row.id, row.estimatedCost);
      continue;
    }
    if (
      !row.model ||
      row.inputTokens === null ||
      row.outputTokens === null ||
      !getModelRates(row.model)
    ) {
      console.log("SKIP_INSUFFICIENT", row.id);
      continue;
    }
    const next = estimateLlmCostUsd(row.model, {
      inputTokens: row.inputTokens,
      cachedInputTokens: row.cachedInputTokens ?? 0,
      outputTokens: row.outputTokens,
    });
    if (next === null || !shouldBackfillEstimatedCost({ current: row.estimatedCost, next })) {
      console.log("SKIP_NO_NEXT", row.id);
      continue;
    }
    plan.push({
      id: row.id,
      old: row.estimatedCost,
      next,
      model: resolvePricingModelId(row.model) ?? row.model,
    });
  }

  console.log("DRY_RUN_PLAN", JSON.stringify(plan, null, 2));
  if (plan.length === 0) {
    console.log("Nothing to update.");
    return;
  }

  const updated = await db.$transaction(async (tx) => {
    let count = 0;
    for (const item of plan) {
      const result = await tx.articleGeneration.updateMany({
        where: {
          id: item.id,
          estimatedCost: null,
          model: { not: null },
          inputTokens: { not: null },
          outputTokens: { not: null },
        },
        data: { estimatedCost: item.next },
      });
      count += result.count;
    }
    return count;
  });

  console.log("UPDATED_ROWS", updated);

  const after = await db.articleGeneration.findMany({
    where: { id: { in: TARGET_IDS } },
    select: {
      id: true,
      estimatedCost: true,
      model: true,
      inputTokens: true,
      cachedInputTokens: true,
      outputTokens: true,
      workspaceId: true,
      cmsDestination: true,
    },
  });
  writeFileSync(
    backupPath.replace(/\.json$/, "-after.json"),
    JSON.stringify({ after, plan, updated }, null, 2),
    "utf8"
  );
  console.log("AFTER", JSON.stringify(after, null, 2));

  const sum = after.reduce((acc, row) => acc + (row.estimatedCost ?? 0), 0);
  console.log("SUM_THREE", Math.round(sum * 1e6) / 1e6);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
