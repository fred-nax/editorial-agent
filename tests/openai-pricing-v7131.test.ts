/**
 * V7.13.1 — Tarification LLM (gpt-5.6-sol) + recalcul dry-run + format.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  classifyLlmCostEstimate,
  estimateLlmCostUsd,
  formatModelLabel,
  getModelRates,
  listPricedModelIds,
  resolvePricingModelId,
} from "../lib/openai-pricing";
import { shouldBackfillEstimatedCost } from "../lib/openai-cost-recalc";
import { formatEstimatedCost, formatEstimatedCostHint } from "../lib/format";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("V7.13.1 — openai pricing gpt-5.6-sol", () => {
  it("enregistre gpt-5.6-sol et conserve gpt-5.6-terra", () => {
    const ids = listPricedModelIds();
    assert.ok(ids.includes("gpt-5.6-sol"));
    assert.ok(ids.includes("gpt-5.6-terra"));
    const sol = getModelRates("gpt-5.6-sol");
    assert.deepEqual(
      {
        u: sol?.uncachedInputPerMillion,
        c: sol?.cachedInputPerMillion,
        o: sol?.outputPerMillion,
      },
      { u: 4, c: 0.4, o: 20 }
    );
    const terra = getModelRates("gpt-5.6-terra");
    assert.deepEqual(
      {
        u: terra?.uncachedInputPerMillion,
        c: terra?.cachedInputPerMillion,
        o: terra?.outputPerMillion,
      },
      { u: 2, c: 0.2, o: 12 }
    );
  });

  it("alias gpt-5.6 → gpt-5.6-sol confirmé", () => {
    assert.equal(resolvePricingModelId("gpt-5.6"), "gpt-5.6-sol");
    assert.ok(getModelRates("gpt-5.6"));
    assert.match(formatModelLabel("gpt-5.6") ?? "", /Sol/);
  });

  it("calcule input / cached / output sans double comptage", () => {
    // Sous le seuil 272k : 90k uncached @4 + 10k cached @0.4 + 5k out @20
    const cost = estimateLlmCostUsd("gpt-5.6-sol", {
      inputTokens: 100_000,
      cachedInputTokens: 10_000,
      outputTokens: 5_000,
    });
    assert.equal(cost, 0.464);
  });

  it("applique le multiplicateur long-context >272k", () => {
    const short = estimateLlmCostUsd("gpt-5.6-sol", {
      inputTokens: 100_000,
      cachedInputTokens: 0,
      outputTokens: 10_000,
    });
    const long = estimateLlmCostUsd("gpt-5.6-sol", {
      inputTokens: 300_000,
      cachedInputTokens: 0,
      outputTokens: 10_000,
    });
    assert.ok(short !== null && long !== null);
    // long : input×2, output×1.5
    assert.equal(
      long,
      (300_000 / 1e6) * 4 * 2 + (10_000 / 1e6) * 20 * 1.5
    );
    assert.notEqual(short, long);
  });

  it("tarif inconnu → null ; zéro tokens → 0", () => {
    assert.equal(
      estimateLlmCostUsd("gpt-unknown-xyz", {
        inputTokens: 100,
        cachedInputTokens: 0,
        outputTokens: 10,
      }),
      null
    );
    assert.equal(
      estimateLlmCostUsd("gpt-5.6-sol", {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
      }),
      0
    );
    assert.equal(
      estimateLlmCostUsd("gpt-5.6-sol", {
        inputTokens: 10,
        cachedInputTokens: 20,
        outputTokens: 1,
      }),
      null
    );
  });

  it("classifie known / zero / unknown", () => {
    assert.equal(
      classifyLlmCostEstimate({ estimatedCost: 0.12, model: "gpt-5.6-sol" }),
      "known"
    );
    assert.equal(
      classifyLlmCostEstimate({ estimatedCost: 0, model: "gpt-5.6-sol" }),
      "zero"
    );
    assert.equal(
      classifyLlmCostEstimate({
        estimatedCost: null,
        model: "gpt-5.6-sol",
        inputTokens: 10,
        outputTokens: 5,
      }),
      "unknown"
    );
    assert.equal(
      classifyLlmCostEstimate({
        estimatedCost: null,
        model: "nope",
        inputTokens: 10,
        outputTokens: 5,
      }),
      "unknown"
    );
  });

  it("format USD + hint inconnu / partiel", () => {
    assert.equal(formatEstimatedCost(0.0024), "$0.0024");
    assert.equal(formatEstimatedCost(0.1751), "$0.1751");
    assert.equal(formatEstimatedCost(1.25), "$1.25");
    assert.equal(formatEstimatedCost(0), "$0.00");
    assert.equal(formatEstimatedCost(null), "Inconnu");
    assert.match(formatEstimatedCostHint({ unknown: true }), /inconnu/i);
    assert.match(formatEstimatedCostHint({ partial: true }), /partielle/i);
  });

  it("backfill ne touche jamais un coût historique valide", () => {
    assert.equal(
      shouldBackfillEstimatedCost({ current: 0.12, next: 0.99 }),
      false
    );
    assert.equal(
      shouldBackfillEstimatedCost({ current: 0, next: 0.01 }),
      false
    );
    assert.equal(
      shouldBackfillEstimatedCost({ current: null, next: 0.42 }),
      true
    );
    assert.equal(
      shouldBackfillEstimatedCost({ current: null, next: null }),
      false
    );
  });

  it("sources officielles documentées dans le module", () => {
    const src = read("lib/openai-pricing.ts");
    assert.match(src, /developers\.openai\.com\/api\/docs\/pricing/);
    assert.match(src, /gpt-5\.6-sol/);
    assert.match(src, /2026-11-30/);
    assert.match(src, /ne pas les recompter/);
  });

  it("dry-run module sans écriture Prisma update", () => {
    const src = read("lib/openai-cost-recalc.ts");
    assert.match(src, /dryRunHistoricalLlmCostRecalc/);
    assert.doesNotMatch(src, /\.update\(|\.updateMany\(/);
    assert.match(src, /skip_valid/);
  });
});
