import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  CREATE_WORDPRESS_DRAFT_TOOL_NAME,
  agentSessionTools,
} from "../lib/agent/tools";
import {
  EDITORIAL_AGENT_PROFILES,
  getAgentToolsForDestination,
  getEditorialAgentProfile,
} from "../lib/agent/registry";
import { parseCmsDestinationInput } from "../lib/cms";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("V7.9.1 — agents éditoriaux par CMS", () => {
  it("profil WordPress par défaut avec outils historiques", () => {
    const profile = getEditorialAgentProfile("wordpress");
    assert.equal(profile.agentEnvKey, "OPENAI_AGENT_ID");
    assert.ok(profile.allowedToolNames.includes(CREATE_WORDPRESS_DRAFT_TOOL_NAME));
    assert.ok(profile.allowedToolNames.includes("web_search"));

    const tools = getAgentToolsForDestination("wordpress");
    assert.equal(tools.length, agentSessionTools.length);
    assert.deepEqual(tools, agentSessionTools);
  });

  it("profil Webflow sans create_wordpress_draft et sans fallback WP", () => {
    const profile = getEditorialAgentProfile("webflow");
    assert.equal(profile.agentEnvKey, "OPENAI_WEBFLOW_AGENT_ID");
    assert.ok(!profile.allowedToolNames.includes(CREATE_WORDPRESS_DRAFT_TOOL_NAME));

    const tools = getAgentToolsForDestination("webflow");
    assert.ok(tools.every((tool) => tool.type === "web_search"));
    assert.ok(
      !tools.some(
        (tool) =>
          tool.type === "function" &&
          tool.name === CREATE_WORDPRESS_DRAFT_TOOL_NAME
      )
    );

    const registry = read("lib/agent/registry.ts");
    assert.match(registry, /Aucun repli sur l’agent WordPress|jamais de repli/i);
    assert.match(registry, /OPENAI_WEBFLOW_AGENT_ID/);
  });

  it("refuse destination désactivée ou inconnue", () => {
    assert.equal(parseCmsDestinationInput("webflow").ok, false);
    assert.equal(parseCmsDestinationInput("ghost").ok, false);
    assert.deepEqual(parseCmsDestinationInput(undefined), {
      ok: true,
      destination: "wordpress",
    });
  });

  it("registre expose deux profils distincts", () => {
    assert.equal(EDITORIAL_AGENT_PROFILES.length, 2);
    assert.equal(EDITORIAL_AGENT_PROFILES[0].cmsDestination, "wordpress");
    assert.equal(EDITORIAL_AGENT_PROFILES[1].cmsDestination, "webflow");
  });

  it("run-session résout l’agent avant la session et isole les outils", () => {
    const run = read("lib/agent/run-session.ts");
    assert.match(run, /resolveEditorialAgentForDestination/);
    assert.match(run, /editorialAgent\.agentId/);
    assert.match(run, /editorialAgent\.tools/);
    assert.match(run, /cmsDestination/);
    assert.match(run, /tool_not_allowed_for_cms/);
    assert.doesNotMatch(run, /agentSessionTools/);
  });

  it("génération conserve cmsDestination à la reprise", () => {
    const generation = read("lib/generation.ts");
    assert.match(
      generation,
      /cmsDestination:\s*generation\.cmsDestination \?\? ["']wordpress["']/
    );
    assert.match(generation, /createQueuedGeneration/);
  });

  it("API generate refuse agent non configuré / destination invalide", () => {
    const route = read("app/api/generate/route.ts");
    assert.match(route, /parseCmsDestinationInput/);
    assert.match(route, /resolveEditorialAgentForDestination/);
  });

  it("UI affiche l’agent associé et Webflow bientôt", () => {
    const picker = read("components/cms/CmsDestinationPicker.tsx");
    assert.match(picker, /Agent éditorial/);
    assert.match(picker, /Bientôt/);
    assert.match(picker, /agents/);
    assert.match(picker, /génération d’items non activée/i);
    const form = read("components/ArticleForm.tsx");
    assert.match(form, /\/api\/cms\/destinations/);
    assert.match(form, /CmsDestinationPicker/);
  });

  it("intégrations exposent l’état agent sans secrets", () => {
    const panel = read("components/cms/CmsIntegrationsPanel.tsx");
    assert.match(panel, /Agent éditorial/);
    assert.match(panel, /agentEnvKey/);
    assert.match(panel, /WebflowConfigPanel/);
    assert.doesNotMatch(panel, /OPENAI_API_KEY|appPassword|sk-/);
    const page = read("app/(protected)/settings/integrations/page.tsx");
    assert.match(page, /listPublicEditorialAgentStatuses/);
    assert.match(page, /webflow=\{settings\.webflow\}/);
    const api = read("app/api/cms/destinations/route.ts");
    assert.match(api, /listPublicEditorialAgentStatuses/);
    assert.match(api, /requireAuth/);
  });

  it("schéma tool create_wordpress_draft et instructions WP inchangés", () => {
    const tools = read("lib/agent/tools.ts");
    assert.match(tools, /CREATE_WORDPRESS_DRAFT_TOOL_NAME/);
    assert.match(tools, /meta_title/);
    assert.doesNotMatch(tools, /webflow|cmsDestination/);
    const wordpress = read("lib/wordpress.ts");
    assert.match(wordpress, /status:\s*"draft"/);
    assert.doesNotMatch(wordpress, /status:\s*"publish"/);
  });

  it("pas de migration destructive ni nouvelle migration inutile V7.9.1", () => {
    const schema = read("prisma/schema.prisma");
    assert.match(schema, /cmsDestination/);
    // V7.9.1 réutilise les colonnes V7.9.0 — pas de nouveau drop GEO.
    assert.doesNotMatch(schema, /drop_ai_visibility/i);
  });

  it("non-régression connecteur WordPress via registre CMS", () => {
    const connector = read("lib/cms/wordpress-connector.ts");
    assert.match(connector, /createWordPressDraft/);
    assert.match(connector, /testWordPressConnection/);
  });
});
