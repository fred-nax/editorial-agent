/**
 * V7.15.0 — Tarification étendue, parsing usage, CSV, labels (sans OpenAI / sans DB).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OPENAI_PRICING_VERSION,
  estimateImageTokenCostUsd,
  estimateLlmCostUsd,
  estimateWebSearchToolCostUsd,
  getImageModelRates,
  getModelRates,
  getWebSearchToolRates,
  listPricedImageModelIds,
  listPricedModelIds,
  pricingCatalogMeta,
} from "../lib/openai-pricing";
import { buildUsageCsv, csvSafeCell } from "../lib/openai-usage-csv";
import { resolveUsagePeriod } from "../lib/openai-usage-period";
import {
  countWebSearchCallsFromTraceIds,
  countWebSearchCallsInResponse,
  parseChatCompletionUsage,
  parseImagesUsage,
  parseResponsesUsage,
} from "../lib/openai-usage-parse";
import { operationTypeLabel } from "../lib/openai-usage-labels";

describe("V7.15.0 — openai pricing extended", () => {
  it("conserve les tarifs Sol/Terra et ajoute gpt-4.1-mini", () => {
    assert.ok(listPricedModelIds().includes("gpt-5.6-sol"));
    assert.ok(listPricedModelIds().includes("gpt-5.6-terra"));
    assert.ok(listPricedModelIds().includes("gpt-4.1-mini"));
    const mini = getModelRates("gpt-4.1-mini");
    assert.deepEqual(
      {
        u: mini?.uncachedInputPerMillion,
        c: mini?.cachedInputPerMillion,
        o: mini?.outputPerMillion,
      },
      { u: 0.4, c: 0.1, o: 1.6 }
    );
  });

  it("ne invente pas de tarif pour un modèle inconnu", () => {
    assert.equal(getModelRates("gpt-unknown-xyz"), null);
    assert.equal(
      estimateLlmCostUsd("gpt-unknown-xyz", {
        inputTokens: 1000,
        cachedInputTokens: 0,
        outputTokens: 100,
      }),
      null
    );
  });

  it("calcule les coûts sous le centime avec précision micros", () => {
    const cost = estimateLlmCostUsd("gpt-4.1-mini", {
      inputTokens: 100,
      cachedInputTokens: 0,
      outputTokens: 50,
    });
    // 100/1e6*0.4 + 50/1e6*1.6 = 0.00004 + 0.00008 = 0.00012
    assert.equal(cost, 0.00012);
  });

  it("ne double-compte pas cached ni reasoning (reasoning ⊆ output)", () => {
    const cost = estimateLlmCostUsd("gpt-5.6-terra", {
      inputTokens: 10_000,
      cachedInputTokens: 2_000,
      outputTokens: 1_000,
    });
    // uncached 8k @2 + cached 2k @0.2 + out 1k @12
    assert.equal(cost, 0.0284);
  });

  it("tarife gpt-image-2.5-flare au token sans forfait fixe cumulé", () => {
    assert.ok(listPricedImageModelIds().includes("gpt-image-2.5-flare"));
    const rates = getImageModelRates("gpt-image-2.5-flare");
    assert.equal(rates?.imageOutputPerMillion, 30);
    const cost = estimateImageTokenCostUsd("gpt-image-2.5-flare", {
      textInputTokens: 1000,
      imageInputTokens: 0,
      imageOutputTokens: 1000,
    });
    // 1000/1e6*5 + 1000/1e6*30 = 0.005 + 0.03 = 0.035
    assert.equal(cost, 0.035);
  });

  it("tarife web_search selon la famille de modèle", () => {
    assert.equal(getWebSearchToolRates("gpt-5.6-terra")?.usdPerThousandCalls, 10);
    assert.equal(getWebSearchToolRates("gpt-4.1-mini")?.usdPerThousandCalls, 25);
    assert.equal(estimateWebSearchToolCostUsd("gpt-5.6-terra", 2), 0.02);
    assert.equal(estimateWebSearchToolCostUsd("gpt-4.1", 1), 0.025);
    assert.equal(estimateWebSearchToolCostUsd("gpt-unknown", 1), null);
    assert.equal(estimateWebSearchToolCostUsd("gpt-5.6-terra", 0), 0);
  });

  it("expose une version tarifaire figée et des sources", () => {
    assert.equal(OPENAI_PRICING_VERSION, "v7150-2026-11-25");
    const meta = pricingCatalogMeta();
    assert.ok(meta.sources.some((s) => s.includes("pricing")));
  });
});

describe("V7.15.0 — usage parsing", () => {
  it("parse Responses usage", () => {
    const parsed = parseResponsesUsage({
      id: "resp_1",
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        total_tokens: 120,
        input_tokens_details: { cached_tokens: 10 },
        output_tokens_details: { reasoning_tokens: 5 },
      },
    });
    assert.deepEqual(
      {
        i: parsed?.inputTokens,
        c: parsed?.cachedInputTokens,
        o: parsed?.outputTokens,
        r: parsed?.reasoningTokens,
        id: parsed?.responseId,
      },
      { i: 100, c: 10, o: 20, r: 5, id: "resp_1" }
    );
  });

  it("retourne null si usage Responses absent (pas zéro inventé)", () => {
    assert.equal(parseResponsesUsage({ id: "resp_x" }), null);
  });

  it("parse chat.completions usage", () => {
    const parsed = parseChatCompletionUsage({
      id: "chat_1",
      usage: {
        prompt_tokens: 50,
        completion_tokens: 10,
        total_tokens: 60,
        prompt_tokens_details: { cached_tokens: 5 },
      },
    });
    assert.equal(parsed?.inputTokens, 50);
    assert.equal(parsed?.cachedInputTokens, 5);
    assert.equal(parsed?.outputTokens, 10);
  });

  it("parse images usage tokenisé", () => {
    const parsed = parseImagesUsage({
      created: 1,
      usage: {
        input_tokens: 120,
        output_tokens: 1050,
        total_tokens: 1170,
        input_tokens_details: { text_tokens: 120, image_tokens: 0 },
      },
    });
    assert.equal(parsed?.textInputTokens, 120);
    assert.equal(parsed?.imageOutputTokens, 1050);
  });

  it("compte les web_search_call distincts", () => {
    assert.equal(
      countWebSearchCallsInResponse({
        output: [
          { type: "web_search_call", id: "ws_1" },
          { type: "message" },
          { type: "web_search_call", id: "ws_1" },
          { type: "web_search_call", id: "ws_2" },
        ],
      }),
      2
    );
    assert.equal(
      countWebSearchCallsFromTraceIds(["a", "a", "b", ""]),
      2
    );
  });
});

describe("V7.15.0 — CSV et labels", () => {
  it("protège contre l’injection de formules CSV", () => {
    assert.equal(csvSafeCell("=CMD()"), `"'=CMD()"`);
    assert.equal(csvSafeCell("+1"), `"'+1"`);
    assert.equal(csvSafeCell("ok"), `"ok"`);
  });

  it("construit un CSV sans secrets", () => {
    const csv = buildUsageCsv([
      {
        id: "1",
        consumedAt: "2026-11-25T10:00:00.000Z",
        workspaceId: "wordpress",
        operationType: "article_generation",
        model: "gpt-5.6-terra",
        operationKey: "gen1",
        generationId: "gen1",
        inputTokens: 10,
        cachedInputTokens: 1,
        outputTokens: 2,
        toolCallCount: null,
        estimatedCostUsd: 0.01234567,
        estimatedCostLabel: "$0.0123",
        completeness: "partial",
        pricingVersion: OPENAI_PRICING_VERSION,
        costSource: "local_estimate",
        status: "succeeded",
        isLegacy: false,
      },
    ]);
    assert.match(csv, /Date,Workspace/);
    assert.match(csv, /0\.01234567/);
    assert.doesNotMatch(csv, /sk-/);
    assert.doesNotMatch(csv, /prompt/i);
  });

  it("libellés d’opération métier", () => {
    assert.equal(operationTypeLabel("web_search"), "Recherche web");
    assert.equal(operationTypeLabel("image_generation"), "Génération d’image");
  });

  it("résout les périodes 7/30/90", () => {
    const now = new Date("2026-11-25T12:00:00.000Z");
    const p7 = resolveUsagePeriod({ preset: "7d", now });
    assert.equal(p7.preset, "7d");
    assert.ok(p7.to.getTime() - p7.from.getTime() >= 6 * 86400000);
  });
});
