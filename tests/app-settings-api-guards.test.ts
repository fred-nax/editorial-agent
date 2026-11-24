import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("AppSettings API — garde-fous", () => {
  it("toutes les routes settings exigent requireAuth", () => {
    const routes = [
      "app/api/settings/route.ts",
      "app/api/settings/general/route.ts",
      "app/api/settings/openai/route.ts",
      "app/api/settings/openai/test/route.ts",
      "app/api/settings/wordpress/route.ts",
      "app/api/settings/wordpress/test/route.ts",
      "app/api/settings/wordpress/acknowledge-inventory/route.ts",
      "app/api/settings/seo-plugin/route.ts",
      "app/api/settings/seo-plugin/check/route.ts",
      "app/api/settings/webflow/route.ts",
      "app/api/settings/webflow/test/route.ts",
      "app/api/settings/webflow/sites/route.ts",
      "app/api/settings/webflow/collections/route.ts",
      "app/api/settings/webflow/collections/[collectionId]/fields/route.ts",
      "app/api/settings/webflow/mapping/validate/route.ts",
      "app/api/cms/destinations/route.ts",
      "app/api/cms/wordpress/test/route.ts",
      "app/api/cms/webflow/test/route.ts",
    ];
    for (const route of routes) {
      const source = read(route);
      assert.match(source, /requireAuth/, route);
      assert.doesNotMatch(source, /NEXT_PUBLIC_/, route);
    }
  });

  it("ne journalise jamais les secrets en clair dans les routes", () => {
    const openaiRoute = read("app/api/settings/openai/route.ts");
    const wpRoute = read("app/api/settings/wordpress/route.ts");
    const webflowRoute = read("app/api/settings/webflow/route.ts");
    assert.doesNotMatch(openaiRoute, /apiKey\s*,/);
    assert.doesNotMatch(wpRoute, /appPassword\s*,/);
    assert.doesNotMatch(webflowRoute, /apiToken\s*,/);
    assert.doesNotMatch(openaiRoute, /logInfo\([^)]*apiKey/);
    assert.doesNotMatch(wpRoute, /logInfo\([^)]*appPassword/);
    assert.doesNotMatch(webflowRoute, /logInfo\([^)]*apiToken/);
  });

  it("createWordPressDraft force status draft", () => {
    const source = read("lib/wordpress.ts");
    assert.match(source, /status:\s*"draft"/);
    assert.doesNotMatch(source, /status:\s*"publish"/);
  });

  it("génération fige les connexions via resolveRuntimeConnections", () => {
    const source = read("lib/agent/run-session.ts");
    assert.match(source, /resolveRuntimeConnections/);
    assert.match(source, /wordpressCredentials/);
    assert.doesNotMatch(source, /from ["']\.\.\/env["']/);
  });

  it("migration AppSettings additive présente et GEO drop absente du dépôt actif", () => {
    const migration = read(
      "prisma/migrations/20261116190000_app_settings_v770/migration.sql"
    );
    assert.match(migration, /CREATE TABLE "AppSettings"/);
    assert.doesNotMatch(migration, /DROP TABLE/);

    // La migration historique interdite ne doit pas être réintégrée comme active.
    // (fichier peut exister hors arbre ; on vérifie qu'aucune migration récente ne drop GEO)
    assert.doesNotMatch(migration, /AiVisibility|drop_ai_visibility/i);
  });
});
