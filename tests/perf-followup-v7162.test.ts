import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

function read(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("V7.16.2 follow-up — perf / isolation dashboard", () => {
  it("dashboard SEO top pages via groupBy + inventaire WP scopé", () => {
    const metrics = read("lib/google/metrics.ts");
    assert.match(metrics, /gscPageDailyStat\.groupBy/);
    assert.match(metrics, /orderBy:\s*\{\s*_sum:\s*\{\s*clicks:\s*"desc"/);
    assert.match(metrics, /take:\s*5/);
    assert.match(metrics, /wordPressPost\.findMany/);
    assert.match(metrics, /workspaceId/);
    assert.doesNotMatch(
      metrics,
      /wordPressPost\.findMany\(\{\s*where:\s*\{\s*status:\s*"publish"\s*\}\s*,/
    );
  });

  it("recovery featured-image n’énumère plus tous les failed", () => {
    const pipeline = read("lib/images/pipeline.ts");
    assert.match(pipeline, /generation:\s*\{\s*status:\s*"failed"/);
    assert.doesNotMatch(
      pipeline,
      /articleGeneration\.findMany\(\{\s*where:\s*\{\s*status:\s*"failed"/
    );
  });

  it("recoverStaleGenerations est throttlé hors boot", () => {
    const recovery = read("lib/generation-recovery.ts");
    assert.match(recovery, /PAGE_RECOVERY_MIN_INTERVAL_MS/);
    assert.match(recovery, /lastPageRecoveryAt/);
  });

  it("dashboard utilise getUsageDashboardTotals", () => {
    const dash = read("app/(protected)/dashboard/page.tsx");
    assert.match(dash, /getUsageDashboardTotals/);
    assert.doesNotMatch(dash, /getUsageSummary/);
  });

  it("resolveActiveWorkspace est mémoïsé React cache", () => {
    const ctx = read("lib/workspace/context.ts");
    assert.match(ctx, /from "react"/);
    assert.match(ctx, /export const resolveActiveWorkspace = cache\(/);
  });
});
