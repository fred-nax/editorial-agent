import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { WORKSPACE_IDS } from "../lib/workspace/constants";
import { opportunityFingerprint } from "../lib/seo/fingerprint";
import { scoreOpportunity } from "../lib/seo/scoring";

const root = process.cwd();
const PREFIX = "v7122_opp_";

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function createDb() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL requis — utiliser naxialis_agent_v7113_migtest uniquement."
    );
  }
  if (!url.includes("v7113_migtest") && !url.includes("migtest")) {
    throw new Error(
      `Refus d’écrire des données fictives hors base de test (URL=${url.replace(/:[^:@/]+@/, ":***@")}).`
    );
  }
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

describe("V7.12.2 — Prisma ArticleGeneration (source)", () => {
  it("ne sélectionne plus angle sur ArticleGeneration dans duplicates", () => {
    const duplicates = read("lib/seo/duplicates.ts");
    assert.match(duplicates, /editorialContext:\s*true/);
    assert.match(duplicates, /angleFromGenerationContext|parseStoredEditorialContext/);
    const generationSelect = duplicates.match(
      /articleGeneration\.findMany\(\{[\s\S]*?select:\s*\{([^}]+)\}/
    );
    assert.ok(generationSelect);
    assert.doesNotMatch(generationSelect[1] ?? "", /\bangle\s*:/);
  });

  it("sanitise les erreurs Prisma pour l’UI", () => {
    const publicError = read("lib/seo/public-error.ts");
    assert.match(publicError, /toPublicOpportunitySearchError/);
    assert.match(publicError, /erreur technique interne/i);
    const search = read("lib/seo/opportunity-search.ts");
    assert.match(search, /toPublicOpportunitySearchError/);
    assert.match(search, /technical/);
  });
});

describe("V7.12.2 — intégration Prisma migtest (Webflow SEO)", () => {
  const db = createDb();
  const ids = {
    item: `${PREFIX}item`,
    genWithAngle: `${PREFIX}gen_angle`,
    genNoAngle: `${PREFIX}gen_plain`,
    opp: `${PREFIX}opp`,
    run: `${PREFIX}run`,
  };

  before(async () => {
    // Nettoyage résiduel éventuel
    await db.seoOpportunity.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });
    await db.opportunitySearchRun.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });
    await db.articleGeneration.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });
    await db.webflowCmsItem.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });
    await db.topic.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });

    await db.webflowCmsItem.create({
      data: {
        id: ids.item,
        workspaceId: WORKSPACE_IDS.webflow,
        webflowItemId: `${PREFIX}wf_item`,
        siteId: `${PREFIX}site`,
        collectionId: `${PREFIX}collection`,
        title: "How to build an AI-ready business",
        slug: "how-to-build-an-ai-ready-business",
        status: "draft",
        isLive: false,
        url: null,
        excerpt: "Draft inventory item for similarity.",
      },
    });

    await db.articleGeneration.create({
      data: {
        id: ids.genWithAngle,
        workspaceId: WORKSPACE_IDS.webflow,
        subject: "Operational AI governance for studios",
        title: "Operational AI governance for studios",
        status: "completed",
        cmsDestination: "webflow",
        editorialContext: {
          angle: "Focus on practical governance checklists",
          audience: null,
          objective: null,
          seoKeywords: null,
          notes: null,
          language: "en-US",
          preferredTitle: null,
        },
      },
    });

    await db.articleGeneration.create({
      data: {
        id: ids.genNoAngle,
        workspaceId: WORKSPACE_IDS.webflow,
        subject: "Plain Webflow generation without angle",
        title: "Plain Webflow generation without angle",
        status: "completed",
        cmsDestination: "webflow",
        editorialContext: null,
      },
    });
  });

  after(async () => {
    const testOpps = await db.seoOpportunity.findMany({
      where: {
        OR: [
          { id: { startsWith: PREFIX } },
          { searchRunId: ids.run },
          { subject: "Complementary AI studio playbook" },
        ],
        workspaceId: WORKSPACE_IDS.webflow,
      },
      select: { id: true, topicId: true },
    });
    const topicIds = testOpps
      .map((row) => row.topicId)
      .filter((id): id is string => Boolean(id));

    await db.seoOpportunity.deleteMany({
      where: { id: { in: testOpps.map((row) => row.id) } },
    });
    if (topicIds.length > 0) {
      await db.topic.deleteMany({
        where: { id: { in: topicIds }, workspaceId: WORKSPACE_IDS.webflow },
      });
    }
    await db.opportunitySearchRun.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });
    await db.articleGeneration.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });
    await db.webflowCmsItem.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });
    await db.$disconnect();
  });

  it("exécute réellement articleGeneration.findMany sans champ angle", async () => {
    const rows = await db.articleGeneration.findMany({
      where: {
        workspaceId: WORKSPACE_IDS.webflow,
        cmsDestination: "webflow",
        status: { in: ["completed", "running", "pending"] },
        id: { startsWith: PREFIX },
      },
      select: {
        id: true,
        subject: true,
        title: true,
        editorialContext: true,
        cmsExternalId: true,
      },
    });
    assert.equal(rows.length, 2);
    const withAngle = rows.find((row) => row.id === ids.genWithAngle);
    const without = rows.find((row) => row.id === ids.genNoAngle);
    assert.ok(withAngle);
    assert.ok(without);
    assert.equal(
      (withAngle?.editorialContext as { angle?: string } | null)?.angle,
      "Focus on practical governance checklists"
    );
    assert.equal(without?.editorialContext, null);
  });

  it("findSimilarContent Webflow : inventaire + générations, sans WordPress", async () => {
    const { findSimilarContent } = await import("../lib/seo/duplicates");
    const result = await findSimilarContent(
      {
        title: "How to build an AI-ready business",
        subject: "How to build an AI-ready business",
      },
      WORKSPACE_IDS.webflow
    );

    assert.ok(result.similarPosts.length >= 1);
    assert.ok(
      result.similarPosts.some(
        (post) =>
          post.cmsProvider === "webflow" &&
          /AI-ready business/i.test(post.title)
      )
    );
    assert.ok(
      result.similarPosts.every(
        (post) => post.cmsProvider !== "wordpress" && post.wpPostId == null
      )
    );

    const withAngleMatch = await findSimilarContent(
      {
        title: "Operational AI governance for studios",
        subject: "Operational AI governance for studios",
        angle: "Focus on practical governance checklists",
      },
      WORKSPACE_IDS.webflow
    );
    assert.ok(withAngleMatch.similarPosts.length >= 1);

    const plain = await findSimilarContent(
      {
        title: "Plain Webflow generation without angle",
        subject: "Plain Webflow generation without angle",
      },
      WORKSPACE_IDS.webflow
    );
    assert.ok(plain.similarPosts.length >= 1);
  });

  it("workflow post-OpenAI simulé : doublons + persistance + conversion file", async () => {
    // Pas d’appel OpenAI réel : on rejoue l’étape qui plantait (findSimilarContent)
    // puis la persistance + mise en file, comme processOpportunitySearch après web_search.
    const { findSimilarContent } = await import("../lib/seo/duplicates");
    const { addOpportunityToTopicQueue } = await import("../lib/seo/queue");
    const { toPublicOpportunitySearchError } = await import(
      "../lib/seo/public-error"
    );

    const candidate = {
      title: "Complementary AI studio playbook",
      subject: "Complementary AI studio playbook",
      angle: "Practical steps for small studios",
      searchIntent: "how to structure an AI studio workflow",
      theme: "AI studio",
      contentType: "evergreen" as const,
      rationale: "Documented editorial gap for Webflow space.",
      naxialisService: null,
      sources: [
        {
          title: "Example source",
          url: "https://example.com/ai-studio",
          date: "2026-11-01",
        },
      ],
    };

    const run = await db.opportunitySearchRun.create({
      data: {
        id: ids.run,
        workspaceId: WORKSPACE_IDS.webflow,
        status: "running",
        mode: "free",
        researchGoal: "seo",
        customTopic: "AI studio editorial gaps",
        requestedCount: 1,
        themes: {},
      },
    });

    const { similarPosts, similarTopics, duplicateRisk } =
      await findSimilarContent(
        {
          title: candidate.title,
          subject: candidate.subject,
          angle: candidate.angle,
          searchIntent: candidate.searchIntent,
        },
        WORKSPACE_IDS.webflow
      );

    assert.ok(duplicateRisk !== undefined);
    assert.ok(
      similarPosts.every(
        (post) => post.cmsProvider !== "wordpress" && post.wpPostId == null
      )
    );

    const scores = scoreOpportunity(candidate, {
      duplicateRisk,
      similarMaxScore: Math.max(
        similarPosts[0]?.score ?? 0,
        similarTopics[0]?.score ?? 0
      ),
      similarPostCount: similarPosts.length,
      freeTopic: true,
      researchGoal: "seo",
    });

    const fingerprint = opportunityFingerprint(
      candidate.title,
      candidate.subject
    );

    const created = await db.seoOpportunity.create({
      data: {
        id: ids.opp,
        workspaceId: WORKSPACE_IDS.webflow,
        title: candidate.title,
        subject: candidate.subject,
        angle: candidate.angle,
        searchIntent: candidate.searchIntent,
        theme: candidate.theme,
        contentType: candidate.contentType,
        rationale: candidate.rationale,
        sources: candidate.sources,
        status: "new",
        fingerprint,
        scoreTotal: scores.total,
        scoreRelevance: scores.relevance,
        scoreCommercial: scores.commercial,
        scoreIntent: scores.intent,
        scoreTimeliness: scores.timeliness,
        scoreOriginality: scores.originality,
        scoreRationale: scores.rationale,
        similarPosts,
        similarTopics,
        duplicateRisk,
        searchRunId: run.id,
      },
    });

    await db.opportunitySearchRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        foundCount: 1,
        finishedAt: new Date(),
        error: null,
      },
    });

    const finished = await db.opportunitySearchRun.findUnique({
      where: { id: run.id },
    });
    assert.equal(finished?.status, "completed");
    assert.equal(finished?.foundCount, 1);
    assert.equal(created.workspaceId, WORKSPACE_IDS.webflow);

    const queued = await addOpportunityToTopicQueue(created.id);
    assert.equal(queued.topic.workspaceId, WORKSPACE_IDS.webflow);
    assert.equal(queued.topic.origin, "seo_opportunity");
    assert.match(queued.topic.notes ?? "", /opportunité SEO/);

    const prismaLike =
      "Invalid `prisma.articleGeneration.findMany()` invocation:\n{\n  select: { angle: true }\n}";
    assert.match(
      toPublicOpportunitySearchError(prismaLike),
      /erreur technique interne/i
    );
    assert.doesNotMatch(
      toPublicOpportunitySearchError(prismaLike),
      /prisma\.articleGeneration/
    );
  });
});
