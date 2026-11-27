/**
 * Exactitude getUsageDashboardTotals vs getUsageSummary (anti double comptage).
 * Migtest uniquement.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getUsageDashboardTotals,
  getUsageSummary,
} from "../lib/openai-usage-aggregate";
import { WORKSPACE_IDS } from "../lib/workspace/constants";

const url = process.env.DATABASE_URL?.trim();
if (!url?.includes("migtest")) {
  throw new Error("DATABASE_URL migtest requis.");
}

describe("V7.16.2 — getUsageDashboardTotals exactitude", () => {
  it("aligne les totaux connus avec getUsageSummary (même période)", async () => {
    const filters = {
      workspaceId: WORKSPACE_IDS.wordpress,
      from: new Date("2020-01-01T00:00:00.000Z"),
      to: new Date("2035-01-01T00:00:00.000Z"),
      operationType: "all" as const,
      model: "all" as const,
      status: "all" as const,
      completeness: "all" as const,
    };
    const [full, light] = await Promise.all([
      getUsageSummary(filters),
      getUsageDashboardTotals(filters),
    ]);
    assert.equal(light.registryEventCount, full.registryEventCount);
    assert.ok(
      Math.abs(light.registryKnownCostUsd - full.registryKnownCostUsd) < 1e-9
    );
    assert.equal(light.legacyLlmCount, full.legacyLlmCount);
    assert.ok(
      Math.abs(light.legacyLlmCostUsd - full.legacyLlmCostUsd) < 1e-9
    );
    assert.ok(
      Math.abs(light.knownEstimatedCostUsd - full.knownEstimatedCostUsd) < 1e-9
    );
  });
});
