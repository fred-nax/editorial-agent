import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { assertGa4PropertyMatchesSite } from "@/lib/google/ga4-streams";
import {
  isWebflowModuleEnabled,
  webflowEmptyState,
  WORKSPACE_IDS,
} from "@/lib/workspace";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("V7.14.1 — Google Analytics Webflow (source)", () => {
  it("autorise analytics Webflow et active GA4 dans le sync mutualisé", () => {
    assert.equal(isWebflowModuleEnabled("analytics"), true);
    const sync = read("lib/google/sync.ts");
    assert.match(sync, /syncGa4Range/);
    assert.match(sync, /workspaceId/);
    assert.doesNotMatch(sync, /!isWebflow && frozenGa4/);
    assert.doesNotMatch(sync, /Search Console uniquement/);

    const ga4 = read("lib/google/ga4-sync.ts");
    assert.match(ga4, /buildPublishedUrlMapForWorkspace/);
    assert.match(ga4, /hostName/);
    assert.match(ga4, /cmsExternalId/);
    assert.match(ga4, /workspaceId/);
  });

  it("valide les flux GA4 contre le domaine public", () => {
    const ok = assertGa4PropertyMatchesSite({
      siteUrl: "https://www.example.com",
      streams: [
        {
          streamId: "1",
          displayName: "Web",
          defaultUri: "https://www.example.com",
          measurementId: "G-ABC",
          host: "www.example.com",
        },
      ],
    });
    assert.ok(ok.allowedHosts.includes("www.example.com"));

    assert.throws(() =>
      assertGa4PropertyMatchesSite({
        siteUrl: "https://www.example.com",
        streams: [
          {
            streamId: "2",
            displayName: "Other",
            defaultUri: "https://other.test",
            measurementId: "G-XYZ",
            host: "other.test",
          },
        ],
      })
    );

    assert.throws(() =>
      assertGa4PropertyMatchesSite({
        siteUrl: null,
        streams: [],
      })
    );
  });

  it("API et UI exposent GA4 pour tous les espaces", () => {
    assert.match(
      read("app/api/google/properties/route.ts"),
      /ga4Supported:\s*true/
    );
    assert.match(
      read("app/api/google/status/route.ts"),
      /ga4Supported:\s*true/
    );
    assert.match(
      read("app/api/google/properties/select/route.ts"),
      /assertGa4PropertyMatchesSite/
    );
    assert.doesNotMatch(
      read("app/api/google/properties/select/route.ts"),
      /ga4Allowed = workspace\.cmsProvider === "wordpress"/
    );

    const settings = read("components/GoogleIntegrationsSettings.tsx");
    assert.match(settings, /Propriété GA4/);
    assert.doesNotMatch(settings, /hors périmètre de cette version/);
    assert.match(settings, /Measurement ID G-/);

    const analytics = read("app/(protected)/analytics/page.tsx");
    assert.match(analytics, /getAnalyticsAiTraffic\(period, workspace\.id\)/);
    assert.doesNotMatch(analytics, /GA4 hors périmètre/);
  });

  it("cron multi-workspaces conserve GSC et GA4", () => {
    const cron = read("app/api/google/sync/cron/route.ts");
    assert.match(cron, /ga4PropertyId/);
    assert.match(cron, /gscPropertyUrl/);
    assert.match(cron, /startGoogleSync\("daily", sel\.workspaceId\)/);
    assert.match(cron, /skipped/);
  });

  it("migration additive cmsExternalId GA4", () => {
    const migration = read(
      "prisma/migrations/20261125210000_ga4_workspace_webflow_v7141/migration.sql"
    );
    assert.match(migration, /cmsExternalId/);
    assert.match(migration, /ws_wordpress_naxialis/);
    assert.doesNotMatch(migration, /DROP TABLE/i);
    assert.doesNotMatch(migration, /drop_ai_visibility_monitor/i);
    assert.match(read("prisma/schema.prisma"), /cmsExternalId/);
  });

  it("empty state et connexion refusent le fallback WordPress", () => {
    const reason = webflowEmptyState("analytics").reason;
    assert.match(reason, /Google Analytics|Search Console/i);
    assert.match(reason, /WordPress/i);

    const connection = read("lib/google/connection.ts");
    assert.match(connection, /propriété Google Analytics est déjà associée/);
  });

  it("non-régression V7.14.0 GSC Webflow", () => {
    assert.match(
      read("lib/google/published-url-map.ts"),
      /buildPublishedUrlMapForWorkspace/
    );
    assert.match(read("lib/google/gsc-sync.ts"), /workspaceId/);
    assert.equal(WORKSPACE_IDS.webflow.startsWith("ws_"), true);
  });
});
