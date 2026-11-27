/**
 * Seed synthétique V7.16.2 — UNIQUEMENT base isolée `*bench*`.
 * Aucun appel OpenAI / Google / CMS. N’écrit jamais dans naxialis_agent.
 *
 * Usage :
 *   $env:DATABASE_URL="postgresql://.../naxialis_agent_bench_v7162"
 *   $env:BENCH_SCALE="1000"   # 100 | 1000 | 5000
 *   npm run bench:seed
 */

import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { databaseNameFromUrl } from "../lib/db";

const MARKER = "SYNTHETIC_V7162";
const SCALES = new Set([100, 1000, 5000]);

function requireBenchDatabase(url: string | undefined): string {
  const name = databaseNameFromUrl(url)?.toLowerCase() ?? "";
  if (!name.includes("bench")) {
    throw new Error(
      `Refus : DATABASE_URL doit cibler une base *bench* (reçu: ${name || "unknown"}).`
    );
  }
  if (name === "naxialis_agent") {
    throw new Error("Refus : base principale naxialis_agent interdite.");
  }
  return name;
}

function parseScale(): number {
  const raw = Number(process.env.BENCH_SCALE ?? "1000");
  if (!SCALES.has(raw)) {
    throw new Error(`BENCH_SCALE invalide (${raw}). Attendu : 100 | 1000 | 5000.`);
  }
  return raw;
}

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  const dbName = requireBenchDatabase(url);
  const scale = parseScale();
  const adapter = new PrismaPg({ connectionString: url! });
  const db = new PrismaClient({ adapter });

  console.log(`[bench-seed] database=${dbName} scale=${scale} marker=${MARKER}`);

  const wpWs =
    (await db.editorialWorkspace.findFirst({
      where: { cmsProvider: "wordpress", name: { startsWith: MARKER } },
    })) ??
    (await db.editorialWorkspace.create({
      data: {
        id: `bench_ws_wp_${scale}`,
        name: `${MARKER} WordPress`,
        slug: `bench-wp-${scale}`,
        cmsProvider: "wordpress",
        enabled: true,
        siteLabel: "bench-wp.example",
        siteUrl: "https://bench-wp.example",
      },
    }));

  const wfWs =
    (await db.editorialWorkspace.findFirst({
      where: { cmsProvider: "webflow", name: { startsWith: MARKER } },
    })) ??
    (await db.editorialWorkspace.create({
      data: {
        id: `bench_ws_wf_${scale}`,
        name: `${MARKER} Webflow`,
        slug: `bench-wf-${scale}`,
        cmsProvider: "webflow",
        enabled: true,
        siteLabel: "bench-wf.example",
        siteUrl: "https://bench-wf.example",
      },
    }));

  const wpCount = Math.floor(scale * 0.7);
  const wfCount = scale - wpCount;
  const now = Date.now();

  console.log(`[bench-seed] generations wp=${wpCount} wf=${wfCount}`);

  const genBatch: Prisma.ArticleGenerationCreateManyInput[] = [];
  for (let i = 0; i < wpCount; i++) {
    const createdAt = new Date(now - i * 3_600_000);
    genBatch.push({
      id: `bench_wp_${scale}_${i}`,
      workspaceId: wpWs.id,
      subject: `${MARKER} WP sujet ${i}`,
      title: `${MARKER} WP titre ${i}`,
      status: i % 17 === 0 ? "failed" : "completed",
      cmsDestination: "wordpress",
      cmsExternalId: i % 5 === 0 ? String(10_000 + i) : null,
      wpPostId: i % 5 === 0 ? 10_000 + i : null,
      estimatedCost: i % 11 === 0 ? null : 0.05 + (i % 50) * 0.001,
      model: "gpt-bench",
      createdAt,
      updatedAt: createdAt,
      progressStage: null,
      error: i % 17 === 0 ? "synthetic failure" : null,
    });
  }
  for (let i = 0; i < wfCount; i++) {
    const createdAt = new Date(now - i * 3_600_000 - 1_000);
    genBatch.push({
      id: `bench_wf_${scale}_${i}`,
      workspaceId: wfWs.id,
      subject: `${MARKER} WF sujet ${i}`,
      title: `${MARKER} WF titre ${i}`,
      status: "completed",
      cmsDestination: "webflow",
      cmsExternalId: `wf_item_${i}`,
      estimatedCost: 0.1 + (i % 30) * 0.002,
      model: "gpt-bench",
      createdAt,
      updatedAt: createdAt,
    });
  }

  await db.openAiUsageEvent.deleteMany({
    where: {
      OR: [
        { generationId: { startsWith: `bench_wp_${scale}_` } },
        { generationId: { startsWith: `bench_wf_${scale}_` } },
        { operationKey: { startsWith: `${MARKER}:${scale}:` } },
      ],
    },
  });
  await db.articleFeaturedImage.deleteMany({
    where: {
      OR: [
        { generationId: { startsWith: `bench_wp_${scale}_` } },
        { generationId: { startsWith: `bench_wf_${scale}_` } },
      ],
    },
  });
  await db.articleGeneration.deleteMany({
    where: {
      OR: [
        { id: { startsWith: `bench_wp_${scale}_` } },
        { id: { startsWith: `bench_wf_${scale}_` } },
      ],
    },
  });

  const CHUNK = 250;
  for (let offset = 0; offset < genBatch.length; offset += CHUNK) {
    await db.articleGeneration.createMany({
      data: genBatch.slice(offset, offset + CHUNK),
      skipDuplicates: true,
    });
  }

  const eventBatch: Prisma.OpenAiUsageEventCreateManyInput[] = [];
  const eventGens = genBatch.filter((_, idx) => idx % 3 !== 0).slice(0, Math.min(scale, 2000));
  for (const gen of eventGens) {
    const base = Number(gen.estimatedCost ?? 0.08);
    const consumedAt = gen.createdAt instanceof Date ? gen.createdAt : new Date();
    const ops = [
      { type: "article_generation", cost: base * 0.85 },
      { type: "web_search", cost: 0.01 },
      { type: "image_generation", cost: 0.012 },
      { type: "image_alt", cost: 0.001 },
    ] as const;
    for (const [opIdx, op] of ops.entries()) {
      eventBatch.push({
        workspaceId: gen.workspaceId!,
        generationId: gen.id!,
        operationType: op.type,
        operationKey: `${MARKER}:${scale}:${gen.id}:${op.type}`,
        idempotencyKey: `${MARKER}:${scale}:${gen.id}:${op.type}`,
        endpoint: "bench.synthetic",
        requestedModel: "gpt-bench",
        usedModel: "gpt-bench",
        estimatedCostUsd: new Prisma.Decimal(op.cost.toFixed(8)),
        completeness: "complete",
        pricingVersion: "bench-synthetic",
        costSource: "synthetic",
        status: "succeeded",
        inputTokens: 1000 + opIdx * 10,
        outputTokens: 400 + opIdx,
        cachedInputTokens: 0,
        consumedAt,
      });
    }
  }
  for (let offset = 0; offset < eventBatch.length; offset += CHUNK) {
    await db.openAiUsageEvent.createMany({
      data: eventBatch.slice(offset, offset + CHUNK),
      skipDuplicates: true,
    });
  }

  const wpItems = Math.min(500, Math.floor(scale / 2));
  await db.wordPressPost.deleteMany({
    where: { workspaceId: wpWs.id, title: { startsWith: MARKER } },
  });
  const wpRows: Prisma.WordPressPostCreateManyInput[] = [];
  for (let i = 0; i < wpItems; i++) {
    wpRows.push({
      workspaceId: wpWs.id,
      wpPostId: 50_000 + i,
      title: `${MARKER} WP inventaire ${i}`,
      slug: `bench-wp-${scale}-${i}`,
      url: `https://bench-wp.example/posts/bench-${i}`,
      status: i % 4 === 0 ? "draft" : "publish",
      contentType: i % 7 === 0 ? "page" : "post",
      excerpt: `${MARKER} excerpt`,
      categories: [1, 2],
      publishedAt: new Date(now - i * 86_400_000),
      modifiedAt: new Date(now - i * 43_200_000),
      syncedAt: new Date(),
    });
  }
  for (let offset = 0; offset < wpRows.length; offset += CHUNK) {
    await db.wordPressPost.createMany({
      data: wpRows.slice(offset, offset + CHUNK),
      skipDuplicates: true,
    });
  }

  const wfItems = Math.min(200, Math.floor(scale / 5));
  await db.webflowCmsItem.deleteMany({
    where: { workspaceId: wfWs.id, title: { startsWith: MARKER } },
  });
  const wfRows: Prisma.WebflowCmsItemCreateManyInput[] = [];
  for (let i = 0; i < wfItems; i++) {
    wfRows.push({
      workspaceId: wfWs.id,
      siteId: "bench_site",
      collectionId: "bench_collection",
      webflowItemId: `bench_wf_item_${scale}_${i}`,
      title: `${MARKER} WF item ${i}`,
      slug: `bench-wf-${scale}-${i}`,
      status: i % 3 === 0 ? "draft" : "published",
      isDraft: i % 3 === 0,
      isArchived: false,
      isLive: i % 3 !== 0,
      lastUpdatedAt: new Date(now - i * 86_400_000),
      syncedAt: new Date(),
    });
  }
  for (let offset = 0; offset < wfRows.length; offset += CHUNK) {
    await db.webflowCmsItem.createMany({
      data: wfRows.slice(offset, offset + CHUNK),
      skipDuplicates: true,
    });
  }

  const days = Math.min(90, Math.max(14, Math.floor(scale / 20)));
  const propertyUrl = "sc-domain:bench-wp.example";
  const propertyId = "bench-ga4-999";
  await db.gscPropertyDailyStat.deleteMany({
    where: { workspaceId: wpWs.id, propertyUrl },
  });
  await db.gscPageDailyStat.deleteMany({
    where: { workspaceId: wpWs.id, propertyUrl },
  });
  await db.ga4PageDailyStat.deleteMany({
    where: { workspaceId: wpWs.id, propertyId },
  });

  const gscProp: Prisma.GscPropertyDailyStatCreateManyInput[] = [];
  const gscPage: Prisma.GscPageDailyStatCreateManyInput[] = [];
  const ga4Page: Prisma.Ga4PageDailyStatCreateManyInput[] = [];
  for (let d = 0; d < days; d++) {
    const date = new Date(Date.UTC(2026, 0, 1 + d));
    gscProp.push({
      workspaceId: wpWs.id,
      propertyUrl,
      date,
      clicks: 10 + d,
      impressions: 100 + d * 3,
      ctr: 0.05,
      position: 12.5,
    });
    for (let p = 0; p < 5; p++) {
      const pageUrl = `https://bench-wp.example/posts/bench-${p}`;
      const pagePath = `/posts/bench-${p}`;
      gscPage.push({
        workspaceId: wpWs.id,
        propertyUrl,
        pageUrl,
        pageUrlNorm: pageUrl,
        date,
        clicks: 2 + p,
        impressions: 20 + p * 2,
        ctr: 0.04,
        position: 8 + p,
      });
      ga4Page.push({
        workspaceId: wpWs.id,
        propertyId,
        pagePath,
        pageUrlNorm: pageUrl,
        date,
        sessions: 5 + p,
        totalUsers: 4 + p,
        engagedSessions: 3 + p,
        aiSessions: p === 0 ? 1 : 0,
      });
    }
  }
  await db.gscPropertyDailyStat.createMany({ data: gscProp, skipDuplicates: true });
  for (let offset = 0; offset < gscPage.length; offset += CHUNK) {
    await db.gscPageDailyStat.createMany({
      data: gscPage.slice(offset, offset + CHUNK),
      skipDuplicates: true,
    });
  }
  for (let offset = 0; offset < ga4Page.length; offset += CHUNK) {
    await db.ga4PageDailyStat.createMany({
      data: ga4Page.slice(offset, offset + CHUNK),
      skipDuplicates: true,
    });
  }

  const counts = {
    generations: await db.articleGeneration.count({
      where: { subject: { startsWith: MARKER } },
    }),
    events: await db.openAiUsageEvent.count({
      where: { operationKey: { startsWith: `${MARKER}:` } },
    }),
    wpPosts: await db.wordPressPost.count({
      where: { title: { startsWith: MARKER } },
    }),
    wfItems: await db.webflowCmsItem.count({
      where: { title: { startsWith: MARKER } },
    }),
    gscPages: await db.gscPageDailyStat.count({
      where: { workspaceId: wpWs.id, propertyUrl },
    }),
  };

  console.log("[bench-seed] done", counts);
  await db.$disconnect();
}

main().catch((error) => {
  console.error("[bench-seed] failed", error);
  process.exit(1);
});
