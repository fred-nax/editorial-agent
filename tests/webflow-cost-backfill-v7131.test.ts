/**
 * Non-régression V7.13.1 — coûts Webflow gpt-5.6-sol absents tant que
 * estimatedCost null malgré tokens présents (cause réelle de la recette 3/6).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { estimateLlmCostUsd, getModelRates } from "../lib/openai-pricing";
import { shouldBackfillEstimatedCost } from "../lib/openai-cost-recalc";
import { formatEstimatedCost } from "../lib/format";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("V7.13.1 — non-régression coûts Webflow Sol", () => {
  it("reproduit l’anomalie : Sol sans tarif → null ; avec tarif → montants attendus", () => {
    const samples = [
      {
        id: "cmwwetzet000b5waxg3obu8vi",
        inputTokens: 134238,
        cachedInputTokens: 98134,
        outputTokens: 6077,
        expected: 0.30521,
      },
      {
        id: "cmww9i3xs0000qgaxeoh0h854",
        inputTokens: 207180,
        cachedInputTokens: 154257,
        outputTokens: 6597,
        expected: 0.405335,
      },
      {
        id: "cmwv4t56y0000rkaxgcczfxah",
        inputTokens: 147220,
        cachedInputTokens: 108330,
        outputTokens: 5691,
        expected: 0.312712,
      },
    ];

    assert.ok(getModelRates("gpt-5.6-sol"), "tarif Sol requis");

    let sum = 0;
    for (const sample of samples) {
      const cost = estimateLlmCostUsd("gpt-5.6-sol", {
        inputTokens: sample.inputTokens,
        cachedInputTokens: sample.cachedInputTokens,
        outputTokens: sample.outputTokens,
      });
      assert.equal(cost, sample.expected);
      assert.equal(formatEstimatedCost(cost), `$${sample.expected.toFixed(4)}`);
      assert.equal(
        shouldBackfillEstimatedCost({ current: null, next: cost }),
        true
      );
      assert.equal(
        shouldBackfillEstimatedCost({ current: cost, next: cost + 1 }),
        false,
        "ne jamais écraser un coût valide"
      );
      sum += cost!;
    }
    assert.equal(Math.round(sum * 1e6) / 1e6, 1.023257);
  });

  it("dashboard / historique / détail sélectionnent estimatedCost sans filtre WordPress-only", () => {
    const dashboard = read("app/(protected)/dashboard/page.tsx");
    assert.match(dashboard, /estimatedCost:\s*true/);
    assert.match(dashboard, /_sum:\s*\{\s*estimatedCost:\s*true/);
    assert.doesNotMatch(
      dashboard,
      /cmsDestination:\s*[\"']wordpress[\"'].*estimatedCost|estimatedCost.*cmsDestination:\s*[\"']wordpress[\"']/s
    );

    const history = read("app/(protected)/articles/page.tsx");
    assert.match(history, /listArticleHistory/);
    assert.doesNotMatch(history, /cmsDestination:\s*[\"']wordpress[\"']/);
    const historyQuery = read("lib/articles/history-query.ts");
    assert.match(historyQuery, /findMany/);
    assert.match(historyQuery, /estimatedCost:\s*true/);

    const detail = read("app/(protected)/articles/[id]/page.tsx");
    assert.match(detail, /formatEstimatedCost\(article\.estimatedCost\)/);

    const recent = read("components/dashboard/recent-generations.tsx");
    assert.match(recent, /formatEstimatedCost\(article\.estimatedCost\)/);
  });

  it("script backfill refuse migtest et n’update que estimatedCost null", () => {
    const script = read("releases/backfill-costs-v7131.mts");
    assert.match(script, /REFUSE.*migtest|pas migtest/);
    assert.match(script, /estimatedCost:\s*null/);
    assert.match(script, /\$transaction/);
    assert.match(script, /shouldBackfillEstimatedCost/);
  });
});
