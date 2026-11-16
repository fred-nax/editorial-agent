import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  matchesContentTypeFilter,
  parseAnalyticsContentType,
  resolveInventoryContentType,
} from "../lib/analytics/content-type";
import {
  buildAnalyticsHref,
  moveAnalyticsTab,
  parseAnalyticsPeriod,
  parseAnalyticsTab,
} from "../lib/analytics/params";
import {
  aggregateGscRows,
  resolveAvailablePeriod,
} from "../lib/google/aggregates";
import {
  aggregatePagesForTests,
  aggregateQueriesForTests,
} from "../lib/google/analytics-metrics";
import {
  enrichTopPages,
  indexLatestArticleIdByWpPostId,
  indexPublishedPostsByNorm,
  resolveTopPagePresentation,
} from "../lib/google/dashboard-presentation";
import { AI_SOURCE_KEYS, isAiSourceKey } from "../lib/google/ai-referrers";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Analytics — params URL", () => {
  it("parse tab / période avec défauts", () => {
    assert.equal(parseAnalyticsTab(undefined), "overview");
    assert.equal(parseAnalyticsTab("seo"), "seo");
    assert.equal(parseAnalyticsTab("AI"), "ai");
    assert.equal(parseAnalyticsPeriod(undefined), 28);
    assert.equal(parseAnalyticsPeriod("7"), 7);
    assert.equal(parseAnalyticsPeriod("90"), 90);
    assert.equal(parseAnalyticsPeriod("12"), 28);
  });

  it("construit des liens d’onglets stables", () => {
    assert.equal(buildAnalyticsHref({}), "/analytics");
    assert.equal(
      buildAnalyticsHref({ tab: "seo", period: 7 }),
      "/analytics?tab=seo&period=7"
    );
    assert.equal(
      buildAnalyticsHref({ tab: "articles", period: 28, q: "agent", page: 2 }),
      "/analytics?tab=articles&q=agent&page=2"
    );
    assert.equal(
      buildAnalyticsHref({ tab: "articles", type: "page" }),
      "/analytics?tab=articles&type=page"
    );
  });

  it("navigue au clavier entre onglets", () => {
    assert.equal(moveAnalyticsTab("overview", "ArrowRight"), "seo");
    assert.equal(moveAnalyticsTab("articles", "ArrowRight"), "overview");
    assert.equal(moveAnalyticsTab("seo", "Home"), "overview");
    assert.equal(moveAnalyticsTab("seo", "End"), "articles");
  });

  it("filtre le type de contenu sans approximation", () => {
    assert.equal(parseAnalyticsContentType(undefined), "all");
    assert.equal(parseAnalyticsContentType("page"), "page");
    assert.equal(resolveInventoryContentType("post"), "post");
    assert.equal(resolveInventoryContentType("page"), "page");
    assert.equal(resolveInventoryContentType(null), "unknown");
    assert.equal(resolveInventoryContentType("custom"), "unknown");
    assert.equal(matchesContentTypeFilter("unknown", "all"), true);
    assert.equal(matchesContentTypeFilter("unknown", "post"), false);
    assert.equal(matchesContentTypeFilter("page", "page"), true);
  });
});

describe("Analytics — agrégations GSC", () => {
  it("sépare totaux propriété et somme des pages", () => {
    const property = aggregateGscRows([
      { date: "2026-10-17", clicks: 10, impressions: 1803, position: 31.4 },
    ]);
    const pages = aggregatePagesForTests([
      {
        pageUrlNorm: "https://naxialis.com/a",
        clicks: 6,
        impressions: 900,
        position: 20,
      },
      {
        pageUrlNorm: "https://naxialis.com/b",
        clicks: 4,
        impressions: 1079,
        position: 40,
      },
    ]);
    const pageImpressions = pages.reduce((s, p) => s + p.impressions, 0);
    assert.equal(property.impressions, 1803);
    assert.equal(pageImpressions, 1979);
    assert.notEqual(property.impressions, pageImpressions);
  });

  it("agrège les requêtes avec CTR et position pondérés", () => {
    const rows = aggregateQueriesForTests([
      { query: "agent ia", clicks: 2, impressions: 100, position: 10 },
      { query: "agent ia", clicks: 3, impressions: 50, position: 4 },
      { query: "wordpress", clicks: 1, impressions: 20, position: 8 },
    ]);
    const agent = rows.find((r) => r.query === "agent ia");
    assert.ok(agent);
    assert.equal(agent.clicks, 5);
    assert.equal(agent.impressions, 150);
    assert.ok(agent.ctr !== null && Math.abs(agent.ctr - 5 / 150) < 1e-9);
    assert.ok(
      agent.position !== null &&
        Math.abs(agent.position - (10 * 100 + 4 * 50) / 150) < 1e-9
    );
  });

  it("détecte une période incomplète vs jours demandés", () => {
    const period = resolveAvailablePeriod("2026-11-13", 28);
    assert.ok(period);
    assert.equal(period.start.toISOString().slice(0, 10), "2026-10-17");
    const sparse = aggregateGscRows([
      { date: "2026-11-13", clicks: 1, impressions: 10, position: 5 },
    ]);
    assert.equal(sparse.daysWithData, 1);
    assert.ok(sparse.daysWithData < 28);
  });
});

describe("Analytics — titres WordPress et navigation", () => {
  it("associe titre WP et fiche interne", () => {
    const view = resolveTopPagePresentation({
      page: {
        pageUrlNorm: "https://naxialis.com/blog/x",
        clicks: 2,
        impressions: 40,
      },
      wpPost: {
        wpPostId: 9,
        title: "Titre WordPress",
        url: "https://naxialis.com/blog/x/",
        contentType: "post",
      },
      articleId: "art_1",
    });
    assert.equal(view.label, "Titre WordPress");
    assert.equal(view.articleHref, "/articles/art_1");
    assert.equal(view.contentType, "post");
  });

  it("sans fiche interne : pas de lien /articles inventé + Non identifié", () => {
    const views = enrichTopPages({
      pages: [
        {
          pageUrlNorm: "https://naxialis.com/orphan",
          clicks: 1,
          impressions: 5,
        },
      ],
      postsByNorm: indexPublishedPostsByNorm([]),
      postsById: new Map(),
      articleIdByWpPostId: indexLatestArticleIdByWpPostId([]),
    });
    assert.equal(views[0]?.articleHref, null);
    assert.equal(views[0]?.matchedWordPress, false);
    assert.equal(views[0]?.contentType, "unknown");
    assert.equal(views[0]?.contentTypeLabel, "Non identifié");
  });

  it("reconnaît une page WordPress sans la classer comme article", () => {
    const view = resolveTopPagePresentation({
      page: {
        pageUrlNorm: "https://naxialis.com/a-propos",
        clicks: 1,
        impressions: 20,
      },
      wpPost: {
        wpPostId: 3,
        title: "À propos",
        url: "https://naxialis.com/a-propos/",
        contentType: "page",
      },
      articleId: null,
    });
    assert.equal(view.contentType, "page");
    assert.equal(view.contentTypeLabel, "Page");
    assert.equal(view.articleHref, null);
  });
});

describe("Analytics — trafic IA", () => {
  it("ne classe que les sources IA identifiables", () => {
    assert.equal(isAiSourceKey("chatgpt"), true);
    assert.equal(isAiSourceKey("organic_google"), false);
    assert.equal(isAiSourceKey("other"), false);
    assert.ok(AI_SOURCE_KEYS.includes("perplexity"));
  });
});

describe("Analytics — contrats code", () => {
  it("expose la route protégée et la navigation", () => {
    assert.match(read("app/(protected)/analytics/page.tsx"), /force-dynamic/);
    assert.match(read("app/(protected)/analytics/page.tsx"), /getAnalyticsOverview/);
    assert.match(read("app/(protected)/analytics/page.tsx"), /parseAnalyticsContentType/);
    assert.match(read("lib/analytics/params.ts"), /Contenus/);
    assert.match(read("components/navigation.ts"), /\/analytics/);
    assert.match(read("components/navigation.ts"), /ChartNoAxesCombined/);
    assert.match(
      read("components/dashboard/seo-traffic-strip.tsx"),
      /Voir les statistiques détaillées/
    );
  });

  it("KPI globaux via GscPropertyDailyStat uniquement", () => {
    const metrics = read("lib/google/analytics-metrics.ts");
    assert.match(metrics, /gscPropertyDailyStat\.findMany/);
    assert.match(metrics, /exclusivement|GscPropertyDailyStat|propertyRows/);
    assert.doesNotMatch(
      read("lib/agent/tools.ts"),
      /getAnalyticsOverview|analytics-metrics/
    );
    assert.match(read("lib/agent/tools.ts"), /create_wordpress_draft/);
  });

  it("migration contentType WordPress additive (justifiée)", () => {
    const dirs = readdirSync(join(process.cwd(), "prisma/migrations"));
    assert.equal(
      dirs.some((name) => /analytics/i.test(name)),
      false
    );
    assert.ok(
      dirs.some((name) => name.includes("wordpress_content_type"))
    );
    const sql = read(
      "prisma/migrations/20261115230000_wordpress_content_type/migration.sql"
    );
    assert.match(sql, /ADD COLUMN.*"contentType"/);
    assert.doesNotMatch(sql, /DROP TABLE/i);
  });
});
