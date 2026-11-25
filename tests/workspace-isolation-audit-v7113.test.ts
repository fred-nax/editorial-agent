import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  previewSeoSearchReset,
  resetSeoSearches,
} from "../lib/seo/reset-searches";
import {
  WORKSPACE_COOKIE_NAME,
  WORKSPACE_IDS,
  WORKSPACE_REQUEST_HEADER,
  assertModuleAllowedForWorkspace,
  assertRequestWorkspaceMatchesActive,
  assertSameWorkspace,
  assertWordPressOnlyModule,
  resolveActiveWorkspaceIdFromCookie,
  workspaceWhere,
  WorkspaceContextError,
} from "../lib/workspace";

const root = process.cwd();
const PREFIX = "v7113_iso_";

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

describe("V7.11.3 — audit isolation (source)", () => {
  it("reset SEO, reorder, analyze-similarity et Google sont scopés / gardés", () => {
    const resetLib = read("lib/seo/reset-searches.ts");
    assert.match(resetLib, /assertWorkspaceId\(workspaceId\)/);
    assert.match(resetLib, /deleteMany\(\{\s*where: scope/);
    assert.doesNotMatch(resetLib, /deleteMany\(\{\}\)/);

    const resetRoute = read("app/api/opportunities/reset/route.ts");
    assert.match(resetRoute, /resolveActiveWorkspace/);
    assert.match(resetRoute, /assertModuleAllowedForWorkspace/);
    assert.match(resetRoute, /resetSeoSearches\(workspace\.id\)/);

    const reorder = read("app/api/custom-themes/reorder/route.ts");
    assert.match(reorder, /resolveActiveWorkspace/);
    assert.match(reorder, /reorderThemes\(orderedIds, workspaceId\)/);

    const analyze = read("app/api/topics/analyze-similarity/route.ts");
    assert.match(analyze, /assertWordPressOnlyModule/);
    assert.match(analyze, /workspaceId:\s*workspace\.id/);

    const researchPost = read("app/api/research-configs/route.ts");
    assert.match(researchPost, /Thématique introuvable/);
    assert.match(researchPost, /customTheme\.findFirst/);

    const opp = read("app/api/opportunities/route.ts");
    assert.match(opp, /Configuration de recherche introuvable/);
    assert.match(opp, /ownedTheme/);

    for (const file of [
      "app/api/google/status/route.ts",
      "app/api/google/sync/route.ts",
      "app/api/google/disconnect/route.ts",
      "app/api/google/properties/select/route.ts",
      "app/api/google/properties/route.ts",
      "app/api/google/metrics/page/route.ts",
    ]) {
      assert.match(
        read(file),
        /requireWordPressGoogleWorkspace/,
        `${file} doit refuser Webflow`
      );
    }

    assert.match(
      read("lib/google/workspace-guard.ts"),
      /assertModuleAllowedForWorkspace\(workspace, "analytics"\)/
    );
  });

  it("pas de DROP GEO dans les migrations suivies ; drop historique gitignoré", () => {
    const dropSql = path.join(
      root,
      "prisma/migrations/20261103173400_drop_ai_visibility_monitor/migration.sql"
    );
    // Présence disque tolérée si gitignorée — ne jamais la réintroduire dans Git.
    const gitignore = read(".gitignore");
    assert.match(
      gitignore,
      /20261103173400_drop_ai_visibility_monitor/
    );

    const v7111 = read(
      "prisma/migrations/20261124220000_editorial_workspaces_v7111/migration.sql"
    );
    assert.doesNotMatch(v7111, /DROP TABLE.*"Visibility/i);
    assert.doesNotMatch(v7111, /TRUNCATE.*"Visibility/i);

    const v7112 = read(
      "prisma/migrations/20261125101500_workspace_default_languages_v7112/migration.sql"
    );
    assert.doesNotMatch(v7112, /DROP|TRUNCATE|DELETE FROM/i);
    assert.match(v7112, /UPDATE.*"EditorialWorkspace"/i);

    // Fichier drop local : s’il existe, documenter qu’il est destructif.
    try {
      const drop = readFileSync(dropSql, "utf8");
      assert.match(drop, /DROP TABLE.*"VisibilityBrand"/);
    } catch {
      // Absent du working tree = OK.
    }
  });

  it("modules critiques utilisent workspaceWhere ou resolveActiveWorkspace", () => {
    const files = [
      "app/(protected)/dashboard/page.tsx",
      "app/(protected)/articles/page.tsx",
      "app/(protected)/topics/page.tsx",
      "app/api/generate/route.ts",
      "app/api/topics/route.ts",
      "app/api/opportunities/route.ts",
      "app/api/veille/search/route.ts",
      "app/api/wordpress-inventory/sync/route.ts",
    ];
    for (const file of files) {
      const src = read(file);
      assert.match(
        src,
        /resolveActiveWorkspace|workspaceWhere/,
        `${file} non scopé`
      );
    }
  });
});

describe("V7.11.3 — binding cookie / header / modules", () => {
  it("cookie absent → WordPress ; cookie invalide → erreur", async () => {
    const absent = await resolveActiveWorkspaceIdFromCookie(null);
    assert.equal(absent.workspaceId, WORKSPACE_IDS.wordpress);
    assert.equal(absent.fromCookie, false);

    await assert.rejects(
      () =>
        resolveActiveWorkspaceIdFromCookie(
          `${WORKSPACE_COOKIE_NAME}=workspace-fantome`
        ),
      (error: unknown) =>
        error instanceof WorkspaceContextError &&
        error.code === "WORKSPACE_NOT_FOUND"
    );
  });

  it("header incohérent → 409 ; header absent → OK", () => {
    const active = {
      id: WORKSPACE_IDS.webflow,
      slug: "webflow-ai-studio-01",
      name: "Webflow",
      cmsProvider: "webflow" as const,
      siteUrl: "https://example.com",
      siteLabel: "AI Studio",
      defaultLanguage: "en-US",
      enabled: true,
    };
    assert.doesNotThrow(() =>
      assertRequestWorkspaceMatchesActive(
        new Request("http://localhost/api/x"),
        active
      )
    );
    assert.throws(
      () =>
        assertRequestWorkspaceMatchesActive(
          new Request("http://localhost/api/x", {
            headers: { [WORKSPACE_REQUEST_HEADER]: WORKSPACE_IDS.wordpress },
          }),
          active
        ),
      (error: unknown) =>
        error instanceof WorkspaceContextError && error.status === 409
    );
  });

  it("modules Webflow : opportunities + rapprochements autorisés ; analytics refusé", () => {
    const wf = {
      id: WORKSPACE_IDS.webflow,
      slug: "webflow-ai-studio-01",
      name: "Webflow",
      cmsProvider: "webflow",
      siteUrl: "https://example.com",
      siteLabel: "AI Studio",
      defaultLanguage: "en-US",
      enabled: true,
    };
    assert.doesNotThrow(() =>
      assertModuleAllowedForWorkspace(wf, "opportunities")
    );
    assert.throws(
      () => assertModuleAllowedForWorkspace(wf, "analytics"),
      (e: unknown) => e instanceof WorkspaceContextError && e.status === 501
    );
    assert.doesNotThrow(() =>
      assertModuleAllowedForWorkspace(wf, "rapprochements")
    );
    assert.throws(
      () => assertWordPressOnlyModule("webflow"),
      (e: unknown) => e instanceof WorkspaceContextError && e.status === 403
    );
  });
});

describe("V7.11.3 — isolation DB (migtest, deux espaces similaires)", () => {
  const db = createDb();
  const ids = {
    themeWp: `${PREFIX}theme_wp`,
    themeWf: `${PREFIX}theme_wf`,
    topicWp: `${PREFIX}topic_wp`,
    topicWf: `${PREFIX}topic_wf`,
    genWp: `${PREFIX}gen_wp`,
    genWf: `${PREFIX}gen_wf`,
    oppWp: `${PREFIX}opp_wp`,
    oppWf: `${PREFIX}opp_wf`,
    runWp: `${PREFIX}run_wp`,
    runWf: `${PREFIX}run_wf`,
    cfgWp: `${PREFIX}cfg_wp`,
    cfgWf: `${PREFIX}cfg_wf`,
    watchWp: `${PREFIX}watch_wp`,
    watchWf: `${PREFIX}watch_wf`,
    postWp: 711301,
    postWf: 711302,
  };

  before(async () => {
    await cleanup();
    await db.customTheme.createMany({
      data: [
        {
          id: ids.themeWp,
          workspaceId: WORKSPACE_IDS.wordpress,
          name: "Isolation Theme Shared Name",
          description: "WP",
          explorationAngles: ["a"],
          defaultQuota: 3,
          sortOrder: 9001,
          active: true,
        },
        {
          id: ids.themeWf,
          workspaceId: WORKSPACE_IDS.webflow,
          name: "Isolation Theme Shared Name",
          description: "WF",
          explorationAngles: ["a"],
          defaultQuota: 3,
          sortOrder: 9001,
          active: true,
        },
      ],
    });
    await db.topic.createMany({
      data: [
        {
          id: ids.topicWp,
          workspaceId: WORKSPACE_IDS.wordpress,
          subject: "Sujet isolation identique",
          status: "pending",
        },
        {
          id: ids.topicWf,
          workspaceId: WORKSPACE_IDS.webflow,
          subject: "Sujet isolation identique",
          status: "pending",
        },
      ],
    });
    await db.articleGeneration.createMany({
      data: [
        {
          id: ids.genWp,
          workspaceId: WORKSPACE_IDS.wordpress,
          topicId: ids.topicWp,
          subject: "Sujet isolation identique",
          title: "Titre WP secret",
          status: "completed",
          cmsDestination: "wordpress",
        },
        {
          id: ids.genWf,
          workspaceId: WORKSPACE_IDS.webflow,
          topicId: ids.topicWf,
          subject: "Sujet isolation identique",
          title: "Titre WF secret",
          status: "completed",
          cmsDestination: "webflow",
        },
      ],
    });
    await db.opportunitySearchRun.createMany({
      data: [
        {
          id: ids.runWp,
          workspaceId: WORKSPACE_IDS.wordpress,
          status: "completed",
          themes: {},
        },
        {
          id: ids.runWf,
          workspaceId: WORKSPACE_IDS.webflow,
          status: "completed",
          themes: {},
        },
      ],
    });
    const opportunityScores = {
      scoreTotal: 80,
      scoreRelevance: 80,
      scoreCommercial: 70,
      scoreIntent: 70,
      scoreTimeliness: 60,
      scoreOriginality: 60,
    };
    await db.seoOpportunity.createMany({
      data: [
        {
          id: ids.oppWp,
          workspaceId: WORKSPACE_IDS.wordpress,
          searchRunId: ids.runWp,
          themeId: ids.themeWp,
          theme: "Isolation Theme Shared Name",
          title: "Opportunité isolation",
          subject: "Sujet isolation identique",
          angle: "angle",
          status: "new",
          ...opportunityScores,
        },
        {
          id: ids.oppWf,
          workspaceId: WORKSPACE_IDS.webflow,
          searchRunId: ids.runWf,
          themeId: ids.themeWf,
          theme: "Isolation Theme Shared Name",
          title: "Opportunité isolation",
          subject: "Sujet isolation identique",
          angle: "angle",
          status: "new",
          ...opportunityScores,
        },
      ],
    });
    await db.researchConfig.createMany({
      data: [
        {
          id: ids.cfgWp,
          workspaceId: WORKSPACE_IDS.wordpress,
          name: "Config isolation",
          mode: "free",
          researchGoal: "seo",
          customThemeId: ids.themeWp,
          customTopic: "topic wp",
          requestedCount: 5,
        },
        {
          id: ids.cfgWf,
          workspaceId: WORKSPACE_IDS.webflow,
          name: "Config isolation",
          mode: "free",
          researchGoal: "seo",
          customThemeId: ids.themeWf,
          customTopic: "topic wf",
          requestedCount: 5,
        },
      ],
    });
    await db.editorialWatchSearch.createMany({
      data: [
        {
          id: ids.watchWp,
          workspaceId: WORKSPACE_IDS.wordpress,
          theme: "veille isolation",
          periodDays: 7,
          country: "FR",
          articleCount: 1,
          results: [{ title: "WP veille" }],
          status: "completed",
        },
        {
          id: ids.watchWf,
          workspaceId: WORKSPACE_IDS.webflow,
          theme: "veille isolation",
          periodDays: 7,
          country: "US",
          articleCount: 1,
          results: [{ title: "WF veille" }],
          status: "completed",
        },
      ],
    });
    await db.wordPressPost.create({
      data: {
        workspaceId: WORKSPACE_IDS.wordpress,
        wpPostId: ids.postWp,
        title: "Post inventaire isolation",
        slug: "post-inventaire-isolation",
        url: "https://naxialis.com/post-inventaire-isolation/",
        status: "publish",
        contentType: "post",
        categories: [],
        syncedAt: new Date(),
      },
    });
    // Post « similaire » côté Webflow workspace (même titre) — ne doit jamais
    // apparaître dans les lectures WP (inventaire Webflow non productif).
    await db.wordPressPost.create({
      data: {
        workspaceId: WORKSPACE_IDS.webflow,
        wpPostId: ids.postWf,
        title: "Post inventaire isolation",
        slug: "post-inventaire-isolation-wf",
        url: "https://example.com/wf/post-inventaire-isolation/",
        status: "publish",
        contentType: "post",
        categories: [],
        syncedAt: new Date(),
      },
    });
  });

  after(async () => {
    await cleanup();
    await db.$disconnect();
  });

  async function cleanup() {
    await db.seoOpportunity.deleteMany({
      where: { id: { in: [ids.oppWp, ids.oppWf] } },
    });
    await db.opportunitySearchRun.deleteMany({
      where: { id: { in: [ids.runWp, ids.runWf] } },
    });
    await db.researchConfig.deleteMany({
      where: { id: { in: [ids.cfgWp, ids.cfgWf] } },
    });
    await db.editorialWatchSearch.deleteMany({
      where: { id: { in: [ids.watchWp, ids.watchWf] } },
    });
    await db.articleGeneration.deleteMany({
      where: { id: { in: [ids.genWp, ids.genWf] } },
    });
    await db.topic.deleteMany({
      where: { id: { in: [ids.topicWp, ids.topicWf] } },
    });
    await db.customTheme.deleteMany({
      where: { id: { in: [ids.themeWp, ids.themeWf] } },
    });
    await db.wordPressPost.deleteMany({
      where: {
        workspaceId: { in: [WORKSPACE_IDS.wordpress, WORKSPACE_IDS.webflow] },
        wpPostId: { in: [ids.postWp, ids.postWf] },
      },
    });
  }

  it("lecture croisée générations / topics / opportunités / veille = null", async () => {
    assert.equal(
      await db.articleGeneration.findFirst({
        where: { id: ids.genWf, ...workspaceWhere(WORKSPACE_IDS.wordpress) },
      }),
      null
    );
    assert.equal(
      await db.topic.findFirst({
        where: { id: ids.topicWp, ...workspaceWhere(WORKSPACE_IDS.webflow) },
      }),
      null
    );
    assert.equal(
      await db.seoOpportunity.findFirst({
        where: { id: ids.oppWf, ...workspaceWhere(WORKSPACE_IDS.wordpress) },
      }),
      null
    );
    assert.equal(
      await db.editorialWatchSearch.findFirst({
        where: { id: ids.watchWp, ...workspaceWhere(WORKSPACE_IDS.webflow) },
      }),
      null
    );
  });

  it("listes par espace n’incluent pas les jumeaux de l’autre espace", async () => {
    const wpGens = await db.articleGeneration.findMany({
      where: {
        ...workspaceWhere(WORKSPACE_IDS.wordpress),
        id: { in: [ids.genWp, ids.genWf] },
      },
    });
    assert.deepEqual(
      wpGens.map((g) => g.id),
      [ids.genWp]
    );

    const wfThemes = await db.customTheme.findMany({
      where: {
        ...workspaceWhere(WORKSPACE_IDS.webflow),
        name: "Isolation Theme Shared Name",
      },
    });
    assert.equal(wfThemes.length, 1);
    assert.equal(wfThemes[0]?.id, ids.themeWf);
  });

  it("update/delete croisés = 0 ligne ; données conservées", async () => {
    const updated = await db.topic.updateMany({
      where: { id: ids.topicWp, workspaceId: WORKSPACE_IDS.webflow },
      data: { subject: "HACKED" },
    });
    assert.equal(updated.count, 0);

    const deleted = await db.seoOpportunity.deleteMany({
      where: { id: ids.oppWf, workspaceId: WORKSPACE_IDS.wordpress },
    });
    assert.equal(deleted.count, 0);

    const still = await db.seoOpportunity.findUnique({ where: { id: ids.oppWf } });
    assert.ok(still);
    assert.equal(still.title, "Opportunité isolation");
    assert.equal(still.workspaceId, WORKSPACE_IDS.webflow);

    const topic = await db.topic.findUnique({ where: { id: ids.topicWp } });
    assert.equal(topic?.subject, "Sujet isolation identique");
  });

  it("reset SEO d’un espace préserve l’autre", async () => {
    const previewWp = await previewSeoSearchReset(WORKSPACE_IDS.wordpress, db);
    assert.ok(previewWp.opportunityCount >= 1);
    assert.equal(previewWp.canReset, true);

    const beforeWf = await db.seoOpportunity.count({
      where: workspaceWhere(WORKSPACE_IDS.webflow),
    });
    assert.ok(beforeWf >= 1);

    await resetSeoSearches(WORKSPACE_IDS.wordpress, db);

    assert.equal(
      await db.seoOpportunity.count({
        where: {
          id: ids.oppWp,
          ...workspaceWhere(WORKSPACE_IDS.wordpress),
        },
      }),
      0
    );
    assert.equal(
      await db.opportunitySearchRun.count({
        where: {
          id: ids.runWp,
          ...workspaceWhere(WORKSPACE_IDS.wordpress),
        },
      }),
      0
    );

    const afterWfOpp = await db.seoOpportunity.findUnique({
      where: { id: ids.oppWf },
    });
    const afterWfRun = await db.opportunitySearchRun.findUnique({
      where: { id: ids.runWf },
    });
    assert.ok(afterWfOpp);
    assert.ok(afterWfRun);
    assert.equal(
      await db.seoOpportunity.count({
        where: workspaceWhere(WORKSPACE_IDS.webflow),
      }),
      beforeWf
    );

    // Recréer les fixtures WP pour ne pas casser d’autres assertions / cleanup.
    await db.opportunitySearchRun.create({
      data: {
        id: ids.runWp,
        workspaceId: WORKSPACE_IDS.wordpress,
        status: "completed",
        themes: {},
      },
    });
    await db.seoOpportunity.create({
      data: {
        id: ids.oppWp,
        workspaceId: WORKSPACE_IDS.wordpress,
        searchRunId: ids.runWp,
        themeId: ids.themeWp,
        theme: "Isolation Theme Shared Name",
        title: "Opportunité isolation",
        subject: "Sujet isolation identique",
        angle: "angle",
        status: "new",
        scoreTotal: 80,
        scoreRelevance: 80,
        scoreCommercial: 70,
        scoreIntent: 70,
        scoreTimeliness: 60,
        scoreOriginality: 60,
      },
    });
  });

  it("FK croisée thématique refusée par filtre workspace (simulation POST)", async () => {
    const foreign = await db.customTheme.findFirst({
      where: {
        id: ids.themeWf,
        ...workspaceWhere(WORKSPACE_IDS.wordpress),
      },
    });
    assert.equal(foreign, null);

    const owned = await db.customTheme.findFirst({
      where: {
        id: ids.themeWp,
        ...workspaceWhere(WORKSPACE_IDS.wordpress),
      },
    });
    assert.ok(owned);
  });

  it("inventaire publish isolé ; assertSameWorkspace refuse le croisement", async () => {
    const wpPosts = await db.wordPressPost.findMany({
      where: {
        ...workspaceWhere(WORKSPACE_IDS.wordpress),
        title: "Post inventaire isolation",
      },
    });
    assert.equal(wpPosts.length, 1);
    assert.equal(wpPosts[0]?.wpPostId, ids.postWp);

    assert.throws(
      () =>
        assertSameWorkspace(
          WORKSPACE_IDS.wordpress,
          WORKSPACE_IDS.webflow,
          "Inventaire"
        ),
      (error: unknown) =>
        error instanceof WorkspaceContextError && error.status === 404
    );
  });

  it("requêtes concurrentes scopées restent isolées", async () => {
    const [wp, wf] = await Promise.all([
      db.articleGeneration.findMany({
        where: {
          ...workspaceWhere(WORKSPACE_IDS.wordpress),
          subject: "Sujet isolation identique",
        },
        select: { id: true, title: true },
      }),
      db.articleGeneration.findMany({
        where: {
          ...workspaceWhere(WORKSPACE_IDS.webflow),
          subject: "Sujet isolation identique",
        },
        select: { id: true, title: true },
      }),
    ]);
    assert.equal(wp.length, 1);
    assert.equal(wf.length, 1);
    assert.equal(wp[0]?.title, "Titre WP secret");
    assert.equal(wf[0]?.title, "Titre WF secret");
    assert.notEqual(wp[0]?.id, wf[0]?.id);
  });

  it("génération conserve workspaceId figé (pas de bascule)", async () => {
    const gen = await db.articleGeneration.findUnique({
      where: { id: ids.genWf },
    });
    assert.equal(gen?.workspaceId, WORKSPACE_IDS.webflow);
    assert.equal(gen?.cmsDestination, "webflow");

    const moved = await db.articleGeneration.updateMany({
      where: {
        id: ids.genWf,
        workspaceId: WORKSPACE_IDS.wordpress,
      },
      data: { title: "should-not-apply" },
    });
    assert.equal(moved.count, 0);
  });
});
