/**
 * V7.15.0 — Persistance / idempotence / isolation / agrégation sur migtest.
 * Aucun appel OpenAI payant.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { WORKSPACE_IDS } from "../lib/workspace/constants";
import {
  getArticleCostBreakdown,
  getUsageSummary,
  listUsageHistory,
} from "../lib/openai-usage-aggregate";
import {
  recordArticleGenerationLlmUsage,
  recordArticleGenerationWebSearchUsage,
  recordImageGenerationUsage,
  recordOpenAiUsageEvent,
} from "../lib/openai-usage-tracker";
import { OPENAI_PRICING_VERSION } from "../lib/openai-pricing";
import { csvSafeCell, buildUsageCsv } from "../lib/openai-usage-aggregate";

const PREFIX = "v7150_usage_";

function createDb() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL requis — utiliser naxialis_agent_v7113_migtest uniquement."
    );
  }
  if (!url.includes("v7113_migtest") && !url.includes("migtest")) {
    throw new Error(
      `Refus d’écrire hors base de test (URL=${url.replace(/:[^:@/]+@/, ":***@")}).`
    );
  }
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

describe("V7.15.0 — intégration Prisma migtest (OpenAiUsageEvent)", () => {
  const db = createDb();
  const ids = {
    genWp: `${PREFIX}gen_wp`,
    genWf: `${PREFIX}gen_wf`,
    imgWp: `${PREFIX}img_wp`,
    legacyGen: `${PREFIX}legacy`,
  };

  before(async () => {
    await db.openAiUsageEvent.deleteMany({
      where: {
        OR: [
          { id: { startsWith: PREFIX } },
          { idempotencyKey: { startsWith: "gen:v7150_" } },
          { idempotencyKey: { startsWith: "img:v7150_" } },
          { generationId: { startsWith: PREFIX } },
        ],
      },
    });
    await db.articleFeaturedImage.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });
    await db.articleGeneration.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });

    await db.articleGeneration.create({
      data: {
        id: ids.genWp,
        workspaceId: WORKSPACE_IDS.wordpress,
        subject: "WP usage isolation",
        status: "completed",
        cmsDestination: "wordpress",
        model: "gpt-5.6-terra",
        inputTokens: 1000,
        cachedInputTokens: 100,
        outputTokens: 200,
        estimatedCost: 0.0044,
      },
    });
    await db.articleGeneration.create({
      data: {
        id: ids.genWf,
        workspaceId: WORKSPACE_IDS.webflow,
        subject: "WF usage isolation",
        status: "completed",
        cmsDestination: "webflow",
        model: "gpt-5.6-sol",
        inputTokens: 2000,
        outputTokens: 300,
        estimatedCost: 0.014,
      },
    });
    await db.articleGeneration.create({
      data: {
        id: ids.legacyGen,
        workspaceId: WORKSPACE_IDS.webflow,
        subject: "Legacy cost only",
        status: "completed",
        cmsDestination: "webflow",
        model: "gpt-5.6-sol",
        inputTokens: 500,
        outputTokens: 100,
        estimatedCost: 0.312712,
      },
    });
    await db.articleFeaturedImage.create({
      data: {
        id: ids.imgWp,
        workspaceId: WORKSPACE_IDS.wordpress,
        generationId: ids.genWp,
        relativePath: "pending",
        mimeType: "image/webp",
        byteSize: 12,
        prompt: "wp prompt",
        style: "photographic",
        aspectRatio: "3:2",
        size: "1536x1024",
        model: "gpt-image-2.5-flare",
        status: "ready",
      },
    });
  });

  after(async () => {
    await db.openAiUsageEvent.deleteMany({
      where: {
        OR: [
          { generationId: { startsWith: PREFIX } },
          { featuredImageId: { startsWith: PREFIX } },
          { idempotencyKey: { startsWith: "gen:v7150_" } },
          { idempotencyKey: { startsWith: "img:v7150_" } },
        ],
      },
    });
    await db.articleFeaturedImage.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });
    await db.articleGeneration.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });
    await db.$disconnect();
  });

  it("enregistre LLM + web_search avec idempotence", async () => {
    const first = await recordArticleGenerationLlmUsage({
      workspaceId: WORKSPACE_IDS.wordpress,
      generationId: ids.genWp,
      sessionId: "sess_wp_1",
      model: "gpt-5.6-terra",
      status: "succeeded",
      inputTokens: 1000,
      cachedInputTokens: 100,
      outputTokens: 200,
      reasoningTokens: 40,
      totalTokens: 1200,
      estimatedCostUsd: 0.0044,
    });
    assert.equal(first.recorded, true);
    const dup = await recordArticleGenerationLlmUsage({
      workspaceId: WORKSPACE_IDS.wordpress,
      generationId: ids.genWp,
      sessionId: "sess_wp_1",
      model: "gpt-5.6-terra",
      status: "succeeded",
      inputTokens: 1000,
      cachedInputTokens: 100,
      outputTokens: 200,
      reasoningTokens: 40,
      totalTokens: 1200,
      estimatedCostUsd: 0.0044,
    });
    assert.equal(dup.duplicate, true);

    const ws = await recordArticleGenerationWebSearchUsage({
      workspaceId: WORKSPACE_IDS.wordpress,
      generationId: ids.genWp,
      sessionId: "sess_wp_1",
      model: "gpt-5.6-terra",
      billableCallCount: 2,
    });
    assert.equal(ws.recorded, true);

    const count = await db.openAiUsageEvent.count({
      where: { generationId: ids.genWp },
    });
    assert.equal(count, 2);
  });

  it("enregistre image même si usage token absent (unknown)", async () => {
    const result = await recordImageGenerationUsage({
      workspaceId: WORKSPACE_IDS.wordpress,
      generationId: ids.genWp,
      featuredImageId: ids.imgWp,
      model: "gpt-image-2.5-flare",
      size: "1536x1024",
      quality: "medium",
      status: "succeeded",
      usage: null,
    });
    assert.equal(result.recorded, true);
    const row = await db.openAiUsageEvent.findFirst({
      where: { featuredImageId: ids.imgWp, operationType: "image_generation" },
    });
    assert.equal(row?.completeness, "unknown");
    assert.equal(row?.estimatedCostUsd, null);
  });

  it("préserve le coût après soft-delete logique image (SetNull FK)", async () => {
    const before = await db.openAiUsageEvent.count({
      where: { featuredImageId: ids.imgWp },
    });
    assert.ok(before >= 1);
    await db.articleFeaturedImage.delete({ where: { id: ids.imgWp } });
    const after = await db.openAiUsageEvent.findMany({
      where: {
        operationType: "image_generation",
        idempotencyKey: `img:${ids.imgWp}:generate`,
      },
    });
    assert.equal(after.length, 1);
    assert.equal(after[0]?.featuredImageId, null);
  });

  it("isole les agrégations par workspace", async () => {
    await recordArticleGenerationLlmUsage({
      workspaceId: WORKSPACE_IDS.webflow,
      generationId: ids.genWf,
      sessionId: "sess_wf_1",
      model: "gpt-5.6-sol",
      status: "succeeded",
      inputTokens: 2000,
      cachedInputTokens: 0,
      outputTokens: 300,
      reasoningTokens: 0,
      totalTokens: 2300,
      estimatedCostUsd: 0.014,
    });

    const from = new Date("2020-01-01T00:00:00.000Z");
    const to = new Date("2030-01-01T00:00:00.000Z");
    const wp = await getUsageSummary({
      workspaceId: WORKSPACE_IDS.wordpress,
      from,
      to,
      operationType: "all",
    });
    const wf = await getUsageSummary({
      workspaceId: WORKSPACE_IDS.webflow,
      from,
      to,
      operationType: "all",
    });

    assert.ok(wp.operationCount >= 1);
    assert.ok(wf.operationCount >= 1);
    // Legacy Webflow 0.312712 inclus côté WF uniquement (pas dans WP).
    assert.ok(wf.legacyLlmCostUsd >= 0.312712 - 0.000001);
    const wpHistory = await listUsageHistory({
      workspaceId: WORKSPACE_IDS.wordpress,
      from,
      to,
      page: 1,
      pageSize: 200,
    });
    assert.equal(
      wpHistory.rows.some((row) => row.generationId === ids.legacyGen),
      false
    );
  });

  it("évite le double comptage historique + event LLM", async () => {
    const breakdown = await getArticleCostBreakdown({
      workspaceId: WORKSPACE_IDS.wordpress,
      generationId: ids.genWp,
      historicalEstimatedCost: 0.0044,
    });
    // Event LLM présent → pas de ligne legacy en plus.
    assert.equal(breakdown.llmHistorical, null);
    assert.ok(typeof breakdown.llmEvents === "number");
  });

  it("expose le legacy seul comme couverture partielle", async () => {
    const breakdown = await getArticleCostBreakdown({
      workspaceId: WORKSPACE_IDS.webflow,
      generationId: ids.legacyGen,
      historicalEstimatedCost: 0.312712,
    });
    assert.equal(breakdown.coverage, "legacy_partial");
    assert.equal(breakdown.llmHistorical, 0.312712);
    assert.equal(breakdown.knownTotal, 0.312712);
  });

  it("pagine l’historique serveur", async () => {
    const history = await listUsageHistory({
      workspaceId: WORKSPACE_IDS.wordpress,
      from: new Date("2020-01-01"),
      to: new Date("2030-01-01"),
      page: 1,
      pageSize: 1,
    });
    assert.equal(history.rows.length, 1);
    assert.ok(history.total >= 1);
  });

  it("refuse un enregistrement sans workspaceId (pas de throw métier)", async () => {
    const result = await recordOpenAiUsageEvent({
      workspaceId: "  ",
      operationType: "title_suggestion",
      idempotencyKey: `${PREFIX}bad`,
      endpoint: "responses",
      completeness: "unknown",
    });
    assert.equal(result.recorded, false);
    assert.match(result.error ?? "", /workspaceId/);
  });

  it("CSV safe + pricing version figée", async () => {
    assert.match(csvSafeCell("=1+1"), /'/);
    const history = await listUsageHistory({
      workspaceId: WORKSPACE_IDS.wordpress,
      from: new Date("2020-01-01"),
      to: new Date("2030-01-01"),
      page: 1,
      pageSize: 50,
    });
    const csv = buildUsageCsv(history.rows);
    assert.match(csv, new RegExp(OPENAI_PRICING_VERSION));
  });
});
