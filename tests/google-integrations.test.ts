import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  aggregateGscRows,
  comparePageSumToPropertyTotals,
  periodStart,
  resolveAvailablePeriod,
} from "../lib/google/aggregates";
import {
  buildPropertyDailySeries,
  enrichTopPages,
  indexLatestArticleIdByWpPostId,
  indexPublishedPostsByNorm,
  readableUrlLabel,
  resolveTopPagePresentation,
} from "../lib/google/dashboard-presentation";
import {
  buildLineSegments,
  clampTooltipPlacement,
  tooltipAnchorPercent,
} from "../components/dashboard/SeoPropertyTrendChart";
import {
  classifyTrafficSource,
  isAiSourceKey,
} from "../lib/google/ai-referrers";
import {
  createOAuthState,
  verifyOAuthState,
} from "../lib/google/oauth";
import {
  normalizePublicUrl,
  propertyLooksCompatibleWithWp,
} from "../lib/google/url-normalize";
import { resolveSyncRange } from "../lib/google/sync";
import { encryptSecret, decryptSecret } from "../lib/google/crypto";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Google — normalisation URL", () => {
  it("normalise host, retire utm et trailing slash", () => {
    assert.equal(
      normalizePublicUrl(
        "https://WWW.Example.com/Blog/Post/?utm_source=x&utm_medium=y"
      ),
      "https://www.example.com/Blog/Post"
    );
  });

  it("refuse les schémas non http(s)", () => {
    assert.equal(normalizePublicUrl("javascript:alert(1)"), null);
  });

  it("signale une incompatibilité soft GSC / WP", () => {
    assert.equal(
      propertyLooksCompatibleWithWp(
        "sc-domain:naxialis.com",
        "https://naxialis.com"
      ),
      true
    );
    assert.equal(
      propertyLooksCompatibleWithWp(
        "https://autre-site.com/",
        "https://naxialis.com"
      ),
      false
    );
  });
});

describe("Google — classification trafic IA", () => {
  it("reconnaît ChatGPT et Perplexity", () => {
    assert.equal(
      classifyTrafficSource({
        sessionSource: "chatgpt.com",
        sessionMedium: "referral",
      }),
      "chatgpt"
    );
    assert.equal(
      classifyTrafficSource({
        sessionSource: "perplexity.ai",
        sessionMedium: "referral",
      }),
      "perplexity"
    );
  });

  it("classe Google organique sans l’inventer comme IA", () => {
    assert.equal(
      classifyTrafficSource({
        sessionSource: "google",
        sessionMedium: "organic",
      }),
      "organic_google"
    );
    assert.equal(isAiSourceKey("organic_google"), false);
  });

  it("ne classe pas le direct / (none) comme IA", () => {
    assert.equal(
      classifyTrafficSource({
        sessionSource: "(direct)",
        sessionMedium: "(none)",
      }),
      "other"
    );
  });
});

describe("Google — agrégations GSC", () => {
  it("calcule CTR et position pondérés (pas moyenne de moyennes)", () => {
    const agg = aggregateGscRows([
      { date: "2026-01-01", clicks: 10, impressions: 100, position: 4 },
      { date: "2026-01-02", clicks: 0, impressions: 900, position: 10 },
    ]);
    assert.equal(agg.clicks, 10);
    assert.equal(agg.impressions, 1000);
    assert.ok(agg.ctr !== null && Math.abs(agg.ctr - 0.01) < 1e-9);
    assert.ok(agg.position !== null && Math.abs(agg.position - 9.4) < 1e-9);
  });

  it("periodStart couvre N jours inclusifs", () => {
    const end = new Date("2026-01-10T00:00:00.000Z");
    const start = periodStart(7, end);
    assert.equal(start.toISOString().slice(0, 10), "2026-01-04");
  });

  it("ancre la période sur le dernier jour disponible (pas J−1 supposé)", () => {
    const period = resolveAvailablePeriod("2026-11-13", 28);
    assert.ok(period);
    assert.equal(period.end.toISOString().slice(0, 10), "2026-11-13");
    assert.equal(period.start.toISOString().slice(0, 10), "2026-10-17");
    assert.equal(resolveAvailablePeriod(null, 28), null);
  });

  it("distingue somme des pages et totaux propriété", () => {
    const pageRows = [
      {
        date: "2026-11-01",
        clicks: 6,
        impressions: 900,
        position: 20,
      },
      {
        date: "2026-11-01",
        clicks: 4,
        impressions: 1079,
        position: 40,
      },
    ];
    const propertyRows = [
      {
        date: "2026-11-01",
        clicks: 10,
        impressions: 1803,
        position: 31.4,
      },
    ];
    const cmp = comparePageSumToPropertyTotals(pageRows, propertyRows);
    assert.equal(cmp.page.clicks, 10);
    assert.equal(cmp.property.clicks, 10);
    assert.equal(cmp.page.impressions, 1979);
    assert.equal(cmp.property.impressions, 1803);
    assert.equal(cmp.impressionsDiffer, true);
  });

  it("dashboard KPI lit GscPropertyDailyStat, pas la somme des pages", () => {
    const metrics = read("lib/google/metrics.ts");
    assert.match(metrics, /gscPropertyDailyStat\.findMany/);
    assert.match(
      metrics,
      /exclusivement GscPropertyDailyStat|KPI globaux : exclusivement/
    );
    const gscSync = read("lib/google/gsc-sync.ts");
    assert.match(gscSync, /aggregationType: "byProperty"/);
    assert.match(gscSync, /dimensions: \["date"\]/);
    assert.match(gscSync, /needsGscPropertyBackfill/);
    assert.match(gscSync, /gscPropertyDailyStat\.upsert/);
  });

  it("migration propriété additive sans DROP", () => {
    const sql = read(
      "prisma/migrations/20261115210000_gsc_property_daily_stat/migration.sql"
    );
    assert.match(sql, /CREATE TABLE "GscPropertyDailyStat"/);
    assert.doesNotMatch(sql, /DROP TABLE/i);
    assert.doesNotMatch(sql, /ALTER TABLE "GscPageDailyStat"/i);
  });
});

describe("Google — présentation dashboard SEO", () => {
  it("associe un titre WordPress et un lien interne /articles/:id", () => {
    const view = resolveTopPagePresentation({
      page: {
        pageUrlNorm: "https://naxialis.com/blog/agent-ia",
        clicks: 4,
        impressions: 200,
      },
      wpPost: {
        wpPostId: 42,
        title: "Sécuriser un agent IA",
        url: "https://naxialis.com/blog/agent-ia/",
      },
      articleId: "gen_abc",
    });
    assert.equal(view.label, "Sécuriser un agent IA");
    assert.equal(view.articleHref, "/articles/gen_abc");
    assert.equal(view.matchedWordPress, true);
  });

  it("n’invente pas de lien interne sans fiche ArticleGeneration", () => {
    const view = resolveTopPagePresentation({
      page: {
        pageUrlNorm: "https://naxialis.com/blog/agent-ia",
        clicks: 2,
        impressions: 80,
      },
      wpPost: {
        wpPostId: 42,
        title: "Sécuriser un agent IA",
        url: "https://naxialis.com/blog/agent-ia/",
      },
      articleId: null,
    });
    assert.equal(view.label, "Sécuriser un agent IA");
    assert.equal(view.articleHref, null);
    assert.equal(view.matchedWordPress, true);
  });

  it("sans WordPress : label lisible + URL publique", () => {
    assert.equal(
      readableUrlLabel("https://naxialis.com/blog/inconnu/"),
      "naxialis.com/blog/inconnu"
    );
    const view = resolveTopPagePresentation({
      page: {
        pageUrlNorm: "https://naxialis.com/blog/inconnu",
        clicks: 1,
        impressions: 40,
      },
      wpPost: null,
      articleId: null,
    });
    assert.equal(view.matchedWordPress, false);
    assert.equal(view.articleHref, null);
    assert.equal(view.publicUrl, "https://naxialis.com/blog/inconnu");
    assert.match(view.label, /blog\/inconnu/);
  });

  it("enrichit le top pages en batch sans N+1", () => {
    const posts = [
      {
        wpPostId: 10,
        title: "Article A",
        url: "https://naxialis.com/a/",
      },
      {
        wpPostId: 11,
        title: "Article B",
        url: "https://naxialis.com/b",
      },
    ];
    const views = enrichTopPages({
      pages: [
        {
          pageUrlNorm: "https://naxialis.com/a",
          clicks: 5,
          impressions: 100,
          wpPostId: 10,
        },
        {
          pageUrlNorm: "https://naxialis.com/orphan",
          clicks: 1,
          impressions: 10,
        },
      ],
      postsByNorm: indexPublishedPostsByNorm(posts),
      postsById: new Map(posts.map((p) => [p.wpPostId, p])),
      articleIdByWpPostId: indexLatestArticleIdByWpPostId([
        { id: "newer", wpPostId: 10 },
        { id: "older", wpPostId: 10 },
      ]),
    });
    // Comme metrics (orderBy createdAt desc) : la première occurrence gagne.
    assert.equal(views[0]?.label, "Article A");
    assert.equal(views[0]?.articleHref, "/articles/newer");
    assert.equal(views[1]?.matchedWordPress, false);
    assert.equal(views[1]?.articleHref, null);
  });

  it("série quotidienne : null sur jours sans données, pas de zéro fictif", () => {
    const series = buildPropertyDailySeries(
      [
        {
          date: "2026-10-17",
          clicks: 1,
          impressions: 50,
        },
        {
          date: "2026-10-19",
          clicks: 2,
          impressions: 80,
        },
      ],
      new Date("2026-10-17T00:00:00.000Z"),
      new Date("2026-10-19T00:00:00.000Z")
    );
    assert.equal(series.length, 3);
    assert.deepEqual(series[0], {
      date: "2026-10-17",
      clicks: 1,
      impressions: 50,
    });
    assert.deepEqual(series[1], {
      date: "2026-10-18",
      clicks: null,
      impressions: null,
    });
    assert.deepEqual(series[2], {
      date: "2026-10-19",
      clicks: 2,
      impressions: 80,
    });
  });

  it("casse les segments SVG sur les jours null", () => {
    const segments = buildLineSegments([
      { x: 0, y: 10 },
      { x: 1, y: 12 },
      { x: 2, y: null },
      { x: 3, y: 8 },
      { x: 4, y: 9 },
    ]);
    assert.deepEqual(segments, ["0,10 1,12", "3,8 4,9"]);
  });

  it("positionne l’infobulle sans dépasser les bords", () => {
    assert.equal(tooltipAnchorPercent(0, 28), 0);
    assert.equal(tooltipAnchorPercent(27, 28), 100);
    assert.deepEqual(clampTooltipPlacement(0), {
      left: "0%",
      transform: "translateX(0)",
    });
    assert.deepEqual(clampTooltipPlacement(100), {
      left: "100%",
      transform: "translateX(-100%)",
    });
    assert.deepEqual(clampTooltipPlacement(50), {
      left: "50%",
      transform: "translateX(-50%)",
    });
  });

  it("aligne la série graphique sur la période KPI dans metrics", () => {
    const metrics = read("lib/google/metrics.ts");
    assert.match(metrics, /buildPropertyDailySeries\(propertyRows, start, end\)/);
    assert.match(metrics, /propertySeries/);
    const strip = read("components/dashboard/seo-traffic-strip.tsx");
    assert.match(strip, /SeoPropertyTrendChart/);
    assert.match(strip, /summary\.propertySeries/);
    assert.match(strip, /articleHref/);
    assert.match(strip, /group-hover:bg-slate-50|hover:bg-slate-50/);
    const chart = read("components/dashboard/SeoPropertyTrendChart.tsx");
    assert.match(chart, /h-\[220px\].*sm:h-\[240px\].*lg:h-\[256px\]/s);
    assert.match(chart, /preserveAspectRatio="none"/);
    assert.match(chart, /ArrowRight/);
    assert.match(chart, /clampTooltipPlacement/);
  });
});

describe("Google — OAuth state & chiffrement", () => {
  it("signe et vérifie le state", () => {
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY =
      process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ||
      Buffer.alloc(32, 7).toString("base64");
    process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-auth-secret";
    const { state, nonce } = createOAuthState();
    const payload = verifyOAuthState(state);
    assert.equal(payload.n, nonce);
  });

  it("refuse un state falsifié", () => {
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY =
      process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ||
      Buffer.alloc(32, 7).toString("base64");
    const { state } = createOAuthState();
    assert.throws(() => verifyOAuthState(state.replace(/\./, ".x")));
  });

  it("chiffre et déchiffre un jeton", () => {
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString(
      "base64"
    );
    const enc = encryptSecret("ya29.test-token");
    assert.notEqual(enc, "ya29.test-token");
    assert.equal(decryptSecret(enc), "ya29.test-token");
  });
});

describe("Google — fenêtres de sync", () => {
  it("initial ≈ 90 jours, daily ≈ 7 jours", () => {
    const initial = resolveSyncRange("initial");
    const daily = resolveSyncRange("daily");
    const initialDays =
      (initial.end.getTime() - initial.start.getTime()) / 86_400_000;
    const dailyDays =
      (daily.end.getTime() - daily.start.getTime()) / 86_400_000;
    assert.equal(Math.round(initialDays), 89);
    assert.equal(Math.round(dailyDays), 6);
  });
});

describe("Google — contrats code (non-régression éditoriale)", () => {
  it("n’altère pas create_wordpress_draft ni l’agent", () => {
    assert.match(read("lib/agent/tools.ts"), /create_wordpress_draft/);
    const googleLib = read("lib/google/sync.ts");
    assert.doesNotMatch(googleLib, /runAgentSession|create_wordpress_draft/);
  });

  it("migration additive sans DROP TABLE métier", () => {
    const sql = read(
      "prisma/migrations/20261115170000_google_integrations_v761/migration.sql"
    );
    assert.match(sql, /CREATE TABLE "GoogleConnection"/);
    assert.doesNotMatch(sql, /DROP TABLE "ArticleGeneration"/i);
    assert.doesNotMatch(sql, /drop_ai_visibility_monitor/i);
  });

  it("expose les routes OAuth/sync protégées", () => {
    assert.match(
      read("app/api/google/oauth/start/route.ts"),
      /requireAuth/
    );
    assert.match(read("app/api/google/sync/cron/route.ts"), /GOOGLE_SYNC_CRON_SECRET/);
  });

  it("ajoute l’onglet Performances SEO", () => {
    const tabs = read("lib/article-detail-tabs.ts");
    assert.match(tabs, /performances/);
    assert.match(tabs, /Performances SEO/);
  });
});
