/**
 * V7.15.1 — Persistance réelle OpenAiUsageEvent sur migtest.
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
} from "../lib/openai-usage-aggregate";
import {
  recordArticleGenerationLlmUsage,
  recordArticleGenerationWebSearchUsage,
  recordImageGenerationUsage,
  recordOpenAiUsageEvent,
} from "../lib/openai-usage-tracker";
import { OPENAI_PRICING_VERSION } from "../lib/openai-pricing";

const PREFIX = "v7151_usage_";

function createDb() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL requis (migtest uniquement).");
  }
  if (!url.includes("v7113_migtest") && !url.includes("migtest")) {
    throw new Error(
      `Refus d’écrire hors base de test (URL=${url.replace(/:[^:@/]+@/, ":***@")}).`
    );
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
}

describe("V7.15.1 — persistance Prisma migtest OpenAiUsageEvent", () => {
  const db = createDb();
  const ids = {
    gen: `${PREFIX}gen`,
    img: `${PREFIX}img`,
    genOther: `${PREFIX}gen_wf`,
  };

  before(async () => {
    process.env.ALLOW_MIGTEST_DATABASE = "1";
    await db.openAiUsageEvent.deleteMany({
      where: {
        OR: [
          { generationId: { startsWith: PREFIX } },
          { featuredImageId: { startsWith: PREFIX } },
          { idempotencyKey: { startsWith: `${PREFIX}` } },
          { idempotencyKey: { startsWith: `gen:${PREFIX}` } },
          { idempotencyKey: { startsWith: `img:${PREFIX}` } },
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
        id: ids.gen,
        workspaceId: WORKSPACE_IDS.wordpress,
        subject: "V7151 persistence WP",
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
        id: ids.genOther,
        workspaceId: WORKSPACE_IDS.webflow,
        subject: "V7151 isolation WF",
        status: "completed",
        cmsDestination: "webflow",
        model: "gpt-5.6-sol",
        estimatedCost: 0.312712,
      },
    });
    await db.articleFeaturedImage.create({
      data: {
        id: ids.img,
        workspaceId: WORKSPACE_IDS.wordpress,
        generationId: ids.gen,
        relativePath: "pending",
        mimeType: "image/webp",
        byteSize: 10,
        prompt: "prompt",
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
          { idempotencyKey: { startsWith: `gen:${PREFIX}` } },
          { idempotencyKey: { startsWith: `img:${PREFIX}` } },
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

  it("crée un OpenAiUsageEvent LLM et le relit après coup", async () => {
    const result = await recordArticleGenerationLlmUsage({
      workspaceId: WORKSPACE_IDS.wordpress,
      generationId: ids.gen,
      sessionId: "sess_v7151",
      model: "gpt-5.6-terra",
      status: "succeeded",
      inputTokens: 1000,
      cachedInputTokens: 100,
      outputTokens: 200,
      reasoningTokens: 40,
      totalTokens: 1200,
      estimatedCostUsd: 0.0044,
    });
    assert.equal(result.recorded, true);
    assert.ok(result.eventId);

    const row = await db.openAiUsageEvent.findUnique({
      where: { id: result.eventId! },
    });
    assert.ok(row);
    assert.equal(row.workspaceId, WORKSPACE_IDS.wordpress);
    assert.equal(row.operationType, "article_generation");
    assert.equal(row.generationId, ids.gen);
    assert.equal(row.pricingVersion, OPENAI_PRICING_VERSION);
    assert.equal(Number(row.estimatedCostUsd), 0.0044);
  });

  it("persiste web_search observable et image (usage connu / inconnu)", async () => {
    const ws = await recordArticleGenerationWebSearchUsage({
      workspaceId: WORKSPACE_IDS.wordpress,
      generationId: ids.gen,
      sessionId: "sess_v7151",
      model: "gpt-5.6-terra",
      billableCallCount: 1,
    });
    assert.equal(ws.recorded, true);

    const img = await recordImageGenerationUsage({
      workspaceId: WORKSPACE_IDS.wordpress,
      generationId: ids.gen,
      featuredImageId: ids.img,
      model: "gpt-image-2.5-flare",
      size: "1536x1024",
      quality: "medium",
      status: "succeeded",
      usage: {
        textInputTokens: 50,
        imageInputTokens: 0,
        imageOutputTokens: 1000,
        inputTokens: 50,
        outputTokens: 1000,
        totalTokens: 1050,
        responseId: "img_resp_v7151",
      },
    });
    assert.equal(img.recorded, true);

    const count = await db.openAiUsageEvent.count({
      where: { generationId: ids.gen },
    });
    assert.ok(count >= 3);
  });

  it("idempotence + isolation workspace dans agrégats", async () => {
    const dup = await recordArticleGenerationLlmUsage({
      workspaceId: WORKSPACE_IDS.wordpress,
      generationId: ids.gen,
      sessionId: "sess_v7151",
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

    const from = new Date("2020-01-01");
    const to = new Date("2030-01-01");
    const wp = await getUsageSummary({
      workspaceId: WORKSPACE_IDS.wordpress,
      from,
      to,
    });
    const wf = await getUsageSummary({
      workspaceId: WORKSPACE_IDS.webflow,
      from,
      to,
    });
    assert.ok(wp.registryEventCount >= 3);
    assert.equal(
      wp.byOperation.some((r) => r.operationType === "article_generation"),
      true
    );
    // Le legacy WF 0.312712 de la fixture reste côté Webflow uniquement.
    assert.ok(wf.legacyLlmCostUsd >= 0.312712 - 1e-9);
    assert.equal(
      (await db.openAiUsageEvent.count({
        where: {
          workspaceId: WORKSPACE_IDS.webflow,
          generationId: ids.gen,
        },
      })),
      0
    );
  });

  it("ventilation article préfère le registre au legacy", async () => {
    const breakdown = await getArticleCostBreakdown({
      workspaceId: WORKSPACE_IDS.wordpress,
      generationId: ids.gen,
      historicalEstimatedCost: 0.0044,
    });
    assert.equal(breakdown.llmHistorical, null);
    assert.ok(typeof breakdown.llmEvents === "number");
    assert.ok((breakdown.webSearch ?? 0) > 0);
    assert.ok((breakdown.imageGeneration ?? 0) > 0);
  });

  it("signale une erreur de persistance sans inventer un event", async () => {
    const bad = await recordOpenAiUsageEvent({
      workspaceId: "",
      operationType: "title_suggestion",
      idempotencyKey: `${PREFIX}bad`,
      endpoint: "responses",
      completeness: "unknown",
    });
    assert.equal(bad.recorded, false);
    assert.match(bad.error ?? "", /workspaceId/);
    const phantom = await db.openAiUsageEvent.count({
      where: { idempotencyKey: `${PREFIX}bad` },
    });
    assert.equal(phantom, 0);
  });
});
