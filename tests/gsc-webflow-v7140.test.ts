import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { aggregateGscRows } from "@/lib/google/aggregates";
import {
  assertGscPropertyMatchesSite,
  normalizePublicUrl,
  propertyLooksCompatibleWithSite,
} from "@/lib/google/url-normalize";
import { formatGscSignalsForPrompt } from "@/lib/seo/gsc-signals";
import {
  assertModuleAllowedForWorkspace,
  isWebflowModuleEnabled,
  webflowEmptyState,
  WORKSPACE_IDS,
} from "@/lib/workspace";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("V7.14.0 — Search Console Webflow (source)", () => {
  it("active analytics Webflow sans GA4 dans le sync", () => {
    assert.equal(isWebflowModuleEnabled("analytics"), true);
    const wf = {
      id: WORKSPACE_IDS.webflow,
      slug: "webflow-ai-studio-01",
      name: "Webflow",
      cmsProvider: "webflow" as const,
      siteUrl: "https://www.example.com",
      siteLabel: "AI Studio",
      defaultLanguage: "en-US",
      enabled: true,
    };
    assert.doesNotThrow(() =>
      assertModuleAllowedForWorkspace(wf, "analytics")
    );
    const sync = read("lib/google/sync.ts");
    assert.match(sync, /isWebflow/);
    assert.match(sync, /Search Console uniquement|pas GA4/i);
    assert.match(sync, /workspaceId/);
  });

  it("empty state analytics Webflow sans fallback WordPress", () => {
    const reason = webflowEmptyState("analytics").reason;
    assert.match(reason, /Search Console/i);
    assert.match(reason, /WordPress/i);
    assert.doesNotMatch(reason, /substitution WordPress affichée/i);
  });

  it("valide Domain et URL-prefix contre le domaine public", () => {
    assert.equal(
      propertyLooksCompatibleWithSite(
        "sc-domain:example.com",
        "https://www.example.com"
      ),
      true
    );
    assert.equal(
      propertyLooksCompatibleWithSite(
        "https://www.example.com/",
        "https://www.example.com"
      ),
      true
    );
    assert.equal(
      propertyLooksCompatibleWithSite(
        "sc-domain:other.com",
        "https://www.example.com"
      ),
      false
    );
    assert.throws(() =>
      assertGscPropertyMatchesSite({
        gscPropertyUrl: "sc-domain:other.com",
        siteUrl: "https://www.example.com",
      })
    );
    assert.throws(() =>
      assertGscPropertyMatchesSite({
        gscPropertyUrl: "sc-domain:example.com",
        siteUrl: null,
      })
    );
  });

  it("agrège CTR et position sans moyenne arithmétique", () => {
    const agg = aggregateGscRows([
      { date: "2026-01-01", clicks: 10, impressions: 100, position: 2 },
      { date: "2026-01-02", clicks: 0, impressions: 100, position: 10 },
    ]);
    assert.equal(agg.clicks, 10);
    assert.equal(agg.impressions, 200);
    assert.equal(agg.ctr, 0.05);
    assert.equal(agg.position, (2 * 100 + 10 * 100) / 200);
  });

  it("normalise les URLs publiques (host, slash, UTM) sans inventer de slug", () => {
    assert.equal(
      normalizePublicUrl("https://WWW.Example.com/Blog/Post/?utm_source=x"),
      "https://www.example.com/Blog/Post"
    );
    assert.equal(normalizePublicUrl(""), null);
    assert.equal(normalizePublicUrl("/relative-slug-only"), null);
  });

  it("migration additive cmsExternalId + gscPublicSiteUrl", () => {
    const migration = read(
      "prisma/migrations/20261125200000_gsc_workspace_webflow_v7140/migration.sql"
    );
    assert.match(migration, /cmsExternalId/);
    assert.match(migration, /gscPublicSiteUrl/);
    assert.match(migration, /ws_wordpress_naxialis/);
    assert.doesNotMatch(migration, /DROP TABLE/i);
    assert.doesNotMatch(migration, /drop_ai_visibility_monitor/i);
    const schema = read("prisma/schema.prisma");
    assert.match(schema, /cmsExternalId/);
    assert.match(schema, /gscPublicSiteUrl/);
  });

  it("rapprochement inventaire Webflow refuse brouillons et URLs Designer", () => {
    const map = read("lib/google/published-url-map.ts");
    assert.match(map, /isLive:\s*true/);
    assert.match(map, /status:\s*"published"/);
    assert.match(map, /isConfirmedPublicUrl/);
    assert.match(map, /preview\\.webflow/);
    assert.match(map, /buildPublishedUrlMapForWorkspace/);
  });

  it("refuse le partage silencieux de propriété entre espaces", () => {
    const connection = read("lib/google/connection.ts");
    assert.match(connection, /déjà associée à un autre espace/);
    assert.match(connection, /NOT:\s*\{\s*workspaceId/);
  });

  it("UI paramètres et dashboard isolés par workspace", () => {
    const settings = read("components/GoogleIntegrationsSettings.tsx");
    assert.match(settings, /ga4Supported|isWebflow/);
    assert.match(settings, /Tester la connexion/);
    assert.match(settings, /publicSiteUrl/);
    const dashboard = read("app/(protected)/dashboard/page.tsx");
    assert.match(dashboard, /DashboardSeoTrafficStrip workspaceId=\{workspace\.id\}/);
    const article = read("app/(protected)/articles/[id]/page.tsx");
    assert.match(article, /resolvePublishedUrlForGeneration/);
    assert.match(article, /cmsDestination=\{cmsDestination\}/);
  });

  it("signaux opportunités GSC formatés sans invention", () => {
    const text = formatGscSignalsForPrompt([
      {
        kind: "low_ctr",
        query: "agent ia",
        pageUrlNorm: "https://example.com/a",
        clicks: 1,
        impressions: 200,
        ctr: 0.005,
        position: 8.2,
        source: "google_search_console",
      },
    ]);
    assert.ok(text);
    assert.match(text!, /google_search_console/);
    assert.match(text!, /agent ia/);
    assert.match(text!, /Ne pas inventer/);
  });

  it("opportunités restent utilisables sans GSC", () => {
    assert.equal(formatGscSignalsForPrompt([]), null);
    const search = read("lib/seo/opportunity-search.ts");
    assert.match(search, /loadGscOpportunitySignals/);
    assert.match(search, /gscContext/);
  });
});
