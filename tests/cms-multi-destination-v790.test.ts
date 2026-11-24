import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  DEFAULT_CMS_DESTINATION,
  getCmsConnector,
  isCmsDestinationEnabled,
  listCmsDestinations,
  normalizeCmsDestination,
  parseCmsDestinationInput,
} from "../lib/cms";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("V7.9.0 — multi-CMS destinations", () => {
  it("registre : WordPress actif, Webflow bientôt", () => {
    const destinations = listCmsDestinations();
    assert.equal(destinations.length, 2);
    assert.equal(destinations[0].id, "wordpress");
    assert.equal(destinations[0].enabled, true);
    assert.equal(destinations[1].id, "webflow");
    assert.equal(destinations[1].enabled, false);
    assert.equal(destinations[1].status, "coming_soon");
    assert.equal(DEFAULT_CMS_DESTINATION, "wordpress");
    assert.equal(isCmsDestinationEnabled("wordpress"), true);
    assert.equal(isCmsDestinationEnabled("webflow"), false);
  });

  it("normalizeCmsDestination rétrocompat null → wordpress", () => {
    assert.equal(normalizeCmsDestination(null), "wordpress");
    assert.equal(normalizeCmsDestination(undefined), "wordpress");
    assert.equal(normalizeCmsDestination(""), "wordpress");
    assert.equal(normalizeCmsDestination("wordpress"), "wordpress");
  });

  it("parseCmsDestinationInput refuse Webflow et valeurs inconnues", () => {
    assert.deepEqual(parseCmsDestinationInput(undefined), {
      ok: true,
      destination: "wordpress",
    });
    assert.deepEqual(parseCmsDestinationInput("wordpress"), {
      ok: true,
      destination: "wordpress",
    });
    const webflow = parseCmsDestinationInput("webflow");
    assert.equal(webflow.ok, false);
    const unknown = parseCmsDestinationInput("ghost");
    assert.equal(unknown.ok, false);
  });

  it("getCmsConnector webflow expose un connecteur lecture seule (createDraft refusé)", async () => {
    const connector = getCmsConnector("webflow");
    assert.equal(connector.id, "webflow");
    await assert.rejects(
      () =>
        connector.createDraft({
          title: "x",
          content: "y",
          excerpt: "z",
          slug: "x",
          meta_title: "t",
          meta_description: "d",
        }),
      /non activée|lecture seule|Validez/i
    );
  });

  it("connecteur WordPress délègue à createWordPressDraft (status draft)", () => {
    const connector = read("lib/cms/wordpress-connector.ts");
    assert.match(connector, /createWordPressDraft/);
    assert.match(connector, /testWordPressConnection/);
    assert.doesNotMatch(connector, /status:\s*["']publish["']/);

    const wordpress = read("lib/wordpress.ts");
    assert.match(wordpress, /status:\s*"draft"/);
    assert.doesNotMatch(wordpress, /status:\s*"publish"/);
  });

  it("agent OpenAI et schéma tool inchangés", () => {
    const tools = read("lib/agent/tools.ts");
    assert.match(tools, /create_wordpress_draft/);
    assert.doesNotMatch(tools, /cmsDestination|webflow/);
    const run = read("lib/agent/run-session.ts");
    assert.match(run, /getCmsConnector/);
    assert.doesNotMatch(run, /webflow/);
  });

  it("API generate valide la destination et stocke cmsDestination", () => {
    const route = read("app/api/generate/route.ts");
    assert.match(route, /parseCmsDestinationInput/);
    assert.match(route, /cmsDestination/);
    assert.match(route, /requireAuth/);
  });

  it("UI Destination CMS + page intégrations", () => {
    const form = read("components/ArticleForm.tsx");
    assert.match(form, /CmsDestinationPicker/);
    assert.match(form, /cmsDestination/);
    const picker = read("components/cms/CmsDestinationPicker.tsx");
    assert.match(picker, /WordPress/);
    assert.match(picker, /Webflow/);
    assert.match(picker, /Bientôt/);
    const page = read("app/(protected)/settings/integrations/page.tsx");
    assert.match(page, /CmsIntegrationsPanel/);
    const panel = read("components/cms/CmsIntegrationsPanel.tsx");
    assert.match(panel, /\/api\/cms\/wordpress\/test/);
    assert.doesNotMatch(panel, /mcp|MCP/);
  });

  it("routes CMS protégées Auth.js, sans OpenAI ni écriture WP", () => {
    const destinations = read("app/api/cms/destinations/route.ts");
    assert.match(destinations, /requireAuth/);
    assert.doesNotMatch(destinations, /openai|createWordPressDraft/i);
    const testRoute = read("app/api/cms/wordpress/test/route.ts");
    assert.match(testRoute, /requireAuth/);
    assert.match(testRoute, /testConnection/);
    assert.doesNotMatch(testRoute, /createDraft|createWordPressDraft/);
    assert.doesNotMatch(testRoute, /from ["']openai["']|runAgentSession/);
  });

  it("migration additive cmsDestination sans GEO drop", () => {
    const migration = read(
      "prisma/migrations/20261124150000_cms_destination_v790/migration.sql"
    );
    assert.match(migration, /ADD COLUMN "cmsDestination"/);
    assert.match(migration, /ADD COLUMN "cmsExternalId"/);
    assert.doesNotMatch(migration, /DROP TABLE|drop_ai_visibility/i);
    const schema = read("prisma/schema.prisma");
    assert.match(schema, /cmsDestination/);
    assert.match(schema, /cmsExternalId/);
  });

  it("génération historique : null destination = wordpress à la complétion", () => {
    const generation = read("lib/generation.ts");
    assert.match(generation, /cmsDestination/);
    assert.match(generation, /cmsExternalId/);
    assert.match(generation, /cmsDestination \?\? "wordpress"/);
  });

  it("prévention doublons : webflow non sélectionnable côté API", () => {
    const parsed = parseCmsDestinationInput("webflow");
    assert.equal(parsed.ok, false);
    if (!parsed.ok) {
      assert.match(parsed.error, /pas encore disponible/i);
    }
  });
});
