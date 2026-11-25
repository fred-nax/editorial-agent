import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  WORKSPACE_DEFAULT_LANGUAGE,
  WORKSPACE_IDS,
  assertLanguageCode,
  defaultLanguageForCmsProvider,
  normalizeWorkspaceLanguage,
  resolveFormLanguage,
} from "../lib/workspace";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("V7.11.2 — langues éditoriales par espace", () => {
  it("fixe les défauts WordPress=fr et Webflow=en-US", () => {
    assert.equal(WORKSPACE_DEFAULT_LANGUAGE.wordpress, "fr");
    assert.equal(WORKSPACE_DEFAULT_LANGUAGE.webflow, "en-US");
    assert.equal(defaultLanguageForCmsProvider("wordpress"), "fr");
    assert.equal(defaultLanguageForCmsProvider("webflow"), "en-US");
    assert.equal(WORKSPACE_IDS.wordpress, "ws_wordpress_naxialis");
    assert.equal(WORKSPACE_IDS.webflow, "ws_webflow_ai_studio_01");
  });

  it("normalise fr-FR → fr et en → en-US sans casser en-GB", () => {
    assert.equal(normalizeWorkspaceLanguage("fr"), "fr");
    assert.equal(normalizeWorkspaceLanguage("fr-FR"), "fr");
    assert.equal(normalizeWorkspaceLanguage("fr_FR"), "fr");
    assert.equal(normalizeWorkspaceLanguage("en"), "en-US");
    assert.equal(normalizeWorkspaceLanguage("en-US"), "en-US");
    assert.equal(normalizeWorkspaceLanguage("en-GB"), "en-GB");
    assert.equal(normalizeWorkspaceLanguage("es"), "es");
    assert.equal(normalizeWorkspaceLanguage(""), null);
    assert.equal(normalizeWorkspaceLanguage("de"), null);
    assert.equal(resolveFormLanguage("en-US", "__agent__"), "en-US");
    assert.equal(resolveFormLanguage(null, "__agent__"), "__agent__");
    assert.equal(assertLanguageCode("fr-FR"), "fr");
    assert.throws(() => assertLanguageCode("de"));
  });

  it("migration additive met à jour Webflow vers en-US", () => {
    const migration = read(
      "prisma/migrations/20261125101500_workspace_default_languages_v7112/migration.sql"
    );
    assert.match(migration, /ws_webflow_ai_studio_01/);
    assert.match(migration, /en-US/);
    assert.match(migration, /ws_wordpress_naxialis/);
    assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN/i);
  });

  it("formulaire et paramètres consomment la langue d’espace", () => {
    const form = read("components/ArticleForm.tsx");
    assert.match(form, /resolveFormLanguage|resolveDefaultLanguage/);
    assert.match(form, /workspace\?\.defaultLanguage/);
    assert.match(form, /workspaceEpoch/);
    assert.doesNotMatch(form, /return "en-GB"/);

    const settings = read(
      "components/settings/WorkspaceLanguageSettingsSection.tsx"
    );
    assert.match(settings, /\/api\/workspace\/language/);
    assert.match(settings, /LANGUAGE_OPTIONS/);
    assert.match(settings, /Langue éditoriale de l’espace|espace actif/);

    const page = read("components/settings/SettingsPageClient.tsx");
    assert.match(page, /WorkspaceLanguageSettingsSection/);

    const route = read("app/api/workspace/language/route.ts");
    assert.match(route, /assertLanguageCode/);
    assert.match(route, /editorialWorkspace\.update/);
    assert.match(route, /workspaceCmsSettings\.updateMany/);
    assert.match(route, /assertRequestWorkspaceMatchesActive/);
    assert.doesNotMatch(route, /openai|runAgentSession|instruction/i);
  });
});
