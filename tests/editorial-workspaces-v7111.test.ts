import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  WORKSPACE_COOKIE_NAME,
  WORKSPACE_IDS,
  WORKSPACE_SLUGS,
  assertGenerationWorkspaceConsistency,
  assertSameWorkspace,
  assertWordPressOnlyModule,
  assertModuleAllowedForWorkspace,
  cmsProviderFromWorkspace,
  isWebflowModuleEnabled,
  webflowEmptyState,
  workspaceWhere,
  WorkspaceContextError,
} from "../lib/workspace";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("V7.11.1 — espaces éditoriaux (socle)", () => {
  it("constantes espaces stables", () => {
    assert.equal(WORKSPACE_IDS.wordpress, "ws_wordpress_naxialis");
    assert.equal(WORKSPACE_IDS.webflow, "ws_webflow_ai_studio_01");
    assert.equal(WORKSPACE_SLUGS.wordpress, "wordpress-naxialis");
    assert.equal(WORKSPACE_SLUGS.webflow, "webflow-ai-studio-01");
    assert.equal(WORKSPACE_COOKIE_NAME, "naxialis_workspace");
  });

  it("workspaceWhere et guards anti-croisement", () => {
    assert.deepEqual(workspaceWhere(WORKSPACE_IDS.wordpress), {
      workspaceId: WORKSPACE_IDS.wordpress,
    });
    assert.equal(cmsProviderFromWorkspace("wordpress"), "wordpress");
    assert.equal(cmsProviderFromWorkspace("webflow"), "webflow");
    assert.throws(() => cmsProviderFromWorkspace("ghost"), /inconnu/);

    assert.doesNotThrow(() =>
      assertSameWorkspace(WORKSPACE_IDS.wordpress, WORKSPACE_IDS.wordpress)
    );
    assert.throws(
      () =>
        assertSameWorkspace(
          WORKSPACE_IDS.wordpress,
          WORKSPACE_IDS.webflow,
          "Topic"
        ),
      (error: unknown) =>
        error instanceof WorkspaceContextError &&
        error.code === "WORKSPACE_MISMATCH" &&
        error.status === 404
    );

    assert.doesNotThrow(() =>
      assertGenerationWorkspaceConsistency({
        workspaceCmsProvider: "webflow",
        cmsDestination: "webflow",
      })
    );
    assert.throws(
      () =>
        assertGenerationWorkspaceConsistency({
          workspaceCmsProvider: "webflow",
          cmsDestination: "wordpress",
        }),
      (error: unknown) =>
        error instanceof WorkspaceContextError &&
        error.code === "WORKSPACE_CMS_MISMATCH"
    );
    assert.throws(
      () => assertWordPressOnlyModule("webflow"),
      (error: unknown) =>
        error instanceof WorkspaceContextError && error.status === 403
    );
  });

  it("protection transitoire Webflow — empty states, pas de compensation WP", () => {
    assert.equal(isWebflowModuleEnabled("generation"), true);
    assert.equal(isWebflowModuleEnabled("history"), true);
    assert.equal(isWebflowModuleEnabled("inventory"), true);
    assert.equal(isWebflowModuleEnabled("analytics"), false);
    assert.equal(isWebflowModuleEnabled("opportunities"), true);
    assert.equal(isWebflowModuleEnabled("veille"), true);
    assert.equal(isWebflowModuleEnabled("featured_image"), false);

    const analyticsEmpty = webflowEmptyState("analytics");
    assert.equal(analyticsEmpty.empty, true);
    assert.match(analyticsEmpty.reason, /propriété Google dédiée/);

    const workspaceWebflow = {
      id: WORKSPACE_IDS.webflow,
      slug: WORKSPACE_SLUGS.webflow,
      name: "Webflow",
      cmsProvider: "webflow" as const,
      siteUrl: null,
      siteLabel: "AI Studio 01",
      defaultLanguage: "fr",
      enabled: true,
    };
    assert.doesNotThrow(() =>
      assertModuleAllowedForWorkspace(workspaceWebflow, "inventory")
    );
    assert.doesNotThrow(() =>
      assertModuleAllowedForWorkspace(workspaceWebflow, "generation")
    );
    assert.doesNotThrow(() =>
      assertModuleAllowedForWorkspace(workspaceWebflow, "opportunities")
    );
  });

  it("schéma Prisma : EditorialWorkspace + workspaceId obligatoires", () => {
    const schema = read("prisma/schema.prisma");
    assert.match(schema, /model EditorialWorkspace/);
    assert.match(schema, /model WorkspaceCmsSettings/);
    assert.match(schema, /model WorkspaceMigrationIssue/);
    assert.match(schema, /workspaceId\s+String\r?\n\s+workspace\s+EditorialWorkspace/);
    assert.match(schema, /@@unique\(\[workspaceId, fingerprint\]\)/);
    assert.match(schema, /@@unique\(\[workspaceId, wpPostId\]\)/);
    assert.match(schema, /@@unique\(\[workspaceId, sourceUrl, subject\]\)/);
    assert.match(schema, /@@unique\(\[workspaceId, legacyKey\]\)/);
    assert.doesNotMatch(schema, /20261103173400_drop_ai_visibility/);
  });

  it("migration additive : pas de DROP Visibility*, seed 2 espaces", () => {
    const migration = read(
      "prisma/migrations/20261124220000_editorial_workspaces_v7111/migration.sql"
    );
    assert.match(migration, /ws_wordpress_naxialis/);
    assert.match(migration, /ws_webflow_ai_studio_01/);
    assert.match(migration, /WorkspaceCmsSettings/);
    assert.match(migration, /WorkspaceMigrationIssue/);
    assert.match(migration, /topic_linked_to_multiple_workspaces/);
    assert.doesNotMatch(migration, /DROP TABLE\s+"Visibility/i);
    assert.match(
      migration,
      /Ne touche pas 20261103173400_drop_ai_visibility_monitor/
    );
    assert.doesNotMatch(migration, /^\s*DROP TABLE/im);
  });

  it("génération fige workspaceId ; reprise ignore le cookie UI", () => {
    const generation = read("lib/generation.ts");
    assert.match(generation, /workspaceId: string/);
    assert.match(generation, /Contexte figé à la création/);
    assert.match(generation, /jamais le cookie UI/);
    assert.match(generation, /relation croisée interdite/);

    const generateRoute = read("app/api/generate/route.ts");
    assert.match(generateRoute, /resolveActiveWorkspace/);
    assert.match(generateRoute, /workspaceId: workspace\.id/);
    assert.match(generateRoute, /Destination imposée par l’espace actif/);
  });

  it("API workspace cookie + routes scopées", () => {
    assert.equal(existsSync(path.join(root, "app/api/workspace/route.ts")), true);
    const workspaceRoute = read("app/api/workspace/route.ts");
    assert.match(workspaceRoute, /buildWorkspaceCookieOptions/);
    assert.match(workspaceRoute, /httpOnly/);

    const topics = read("app/api/topics/route.ts");
    assert.match(topics, /workspaceWhere\(workspace\.id\)/);
    assert.match(topics, /workspaceId,/);

    const articles = read("app/api/articles/[id]/route.ts");
    assert.match(articles, /assertSameWorkspace/);

    const inventory = read("app/api/wordpress-inventory/sync/route.ts");
    assert.match(inventory, /assertWordPressOnlyModule/);
  });

  it("dual-read CMS : pas de croisement WP↔Webflow", () => {
    const cms = read("lib/workspace/cms-settings.ts");
    assert.match(cms, /Dual-read strict/);
    assert.match(cms, /allowWpLegacy/);
    assert.match(cms, /allowWebflowLegacy/);
    assert.match(cms, /webflowApiTokenEncrypted: null/);
    assert.match(cms, /wpUrl: null/);
  });

  it("sauvegarde PostgreSQL pré-migration présente", () => {
    const backups = path.join(root, "backups");
    assert.equal(existsSync(backups), true);
    const dump = readdirSync(backups).some((name) =>
      name.startsWith("naxialis_agent_pre_v7111_")
    );
    assert.equal(dump, true);
  });
});
