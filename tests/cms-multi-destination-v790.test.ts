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

describe("V7.9.0 — multi-CMS destinations (évolué V7.10.1)", () => {
  it("registre : WordPress et Webflow actifs au catalogue", () => {
    const destinations = listCmsDestinations();
    assert.equal(destinations.length, 2);
    assert.equal(destinations[0].id, "wordpress");
    assert.equal(destinations[0].enabled, true);
    assert.equal(destinations[1].id, "webflow");
    assert.equal(destinations[1].enabled, true);
    assert.equal(destinations[1].status, "active");
    assert.equal(DEFAULT_CMS_DESTINATION, "wordpress");
    assert.equal(isCmsDestinationEnabled("wordpress"), true);
    assert.equal(isCmsDestinationEnabled("webflow"), true);
  });

  it("normalizeCmsDestination rétrocompat null → wordpress", () => {
    assert.equal(normalizeCmsDestination(null), "wordpress");
    assert.equal(normalizeCmsDestination(undefined), "wordpress");
    assert.equal(normalizeCmsDestination(""), "wordpress");
    assert.equal(normalizeCmsDestination("wordpress"), "wordpress");
  });

  it("parseCmsDestinationInput accepte Webflow et refuse valeurs inconnues", () => {
    assert.deepEqual(parseCmsDestinationInput(undefined), {
      ok: true,
      destination: "wordpress",
    });
    assert.deepEqual(parseCmsDestinationInput("wordpress"), {
      ok: true,
      destination: "wordpress",
    });
    assert.deepEqual(parseCmsDestinationInput("webflow"), {
      ok: true,
      destination: "webflow",
    });
    const unknown = parseCmsDestinationInput("ghost");
    assert.equal(unknown.ok, false);
  });

  it("getCmsConnector webflow expose un connecteur createDraft", async () => {
    const connector = getCmsConnector("webflow");
    assert.equal(connector.id, "webflow");
    assert.equal(typeof connector.createDraft, "function");
    // Payload volontairement invalide : échoue en validation locale
    // sans créer d’item distant (même si une config Webflow locale existe).
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
      /invalide|H2|H3|non configuré|Collection|Mapping|token/i
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

  it("schéma tool WordPress inchangé ; Webflow isolé dans son module", () => {
    const tools = read("lib/agent/tools.ts");
    assert.match(tools, /create_wordpress_draft/);
    assert.doesNotMatch(tools, /create_webflow_draft/);
    const webflowTool = read("lib/agent/webflow-draft-tool.ts");
    assert.match(webflowTool, /create_webflow_draft/);
    const run = read("lib/agent/run-session.ts");
    assert.match(run, /getCmsConnector/);
    assert.match(run, /CREATE_WEBFLOW_DRAFT_TOOL_NAME/);
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
    assert.match(picker, /selectable/);
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

  it("prévention doublons : Webflow sélectionnable au catalogue, readiness runtime", () => {
    const parsed = parseCmsDestinationInput("webflow");
    assert.equal(parsed.ok, true);
    const destinations = read("app/api/cms/destinations/route.ts");
    assert.match(destinations, /getWebflowGenerationReadiness/);
    assert.match(destinations, /selectable/);
  });
});
