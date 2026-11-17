import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  buildSeoRestMeta,
  DEFAULT_WP_SEO_PLUGIN,
  isWpSeoPlugin,
  normalizeWpSeoPlugin,
  verifySeoRestMeta,
  WP_SEO_PLUGINS,
  YOAST_META_DESC_KEY,
  YOAST_META_TITLE_KEY,
} from "../lib/wordpress-seo";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("V7.8.2 — WordPress SEO adapters", () => {
  it("normalizeWpSeoPlugin défaut slim_seo", () => {
    assert.equal(normalizeWpSeoPlugin(null), "slim_seo");
    assert.equal(normalizeWpSeoPlugin(undefined), "slim_seo");
    assert.equal(normalizeWpSeoPlugin(""), "slim_seo");
    assert.equal(normalizeWpSeoPlugin("unknown"), "slim_seo");
    assert.equal(normalizeWpSeoPlugin("yoast_seo"), "yoast_seo");
    assert.equal(DEFAULT_WP_SEO_PLUGIN, "slim_seo");
    assert.deepEqual([...WP_SEO_PLUGINS], ["slim_seo", "yoast_seo"]);
    assert.equal(isWpSeoPlugin("slim_seo"), true);
    assert.equal(isWpSeoPlugin("rank_math"), false);
  });

  it("adaptateur Slim SEO conserve meta.slim_seo", () => {
    const built = buildSeoRestMeta("slim_seo", {
      meta_title: "Titre SEO",
      meta_description: "Desc SEO",
    });
    assert.deepEqual(built.restMeta, {
      slim_seo: { title: "Titre SEO", description: "Desc SEO" },
    });

    const ok = verifySeoRestMeta(
      "slim_seo",
      { slim_seo: { title: "Titre SEO", description: "Desc SEO" } },
      { meta_title: "Titre SEO", meta_description: "Desc SEO" }
    );
    assert.equal(ok.persisted, true);
    assert.equal(ok.error, null);

    const fail = verifySeoRestMeta("slim_seo", {}, {
      meta_title: "Titre SEO",
      meta_description: "Desc SEO",
    });
    assert.equal(fail.persisted, false);
    assert.match(fail.error ?? "", /slim_seo/i);
  });

  it("adaptateur Yoast utilise les clés post meta officielles", () => {
    const built = buildSeoRestMeta("yoast_seo", {
      meta_title: "Yoast Title",
      meta_description: "Yoast Desc",
    });
    assert.deepEqual(built.restMeta, {
      [YOAST_META_TITLE_KEY]: "Yoast Title",
      [YOAST_META_DESC_KEY]: "Yoast Desc",
    });

    const ok = verifySeoRestMeta(
      "yoast_seo",
      {
        [YOAST_META_TITLE_KEY]: "Yoast Title",
        [YOAST_META_DESC_KEY]: "Yoast Desc",
      },
      { meta_title: "Yoast Title", meta_description: "Yoast Desc" }
    );
    assert.equal(ok.persisted, true);

    const missing = verifySeoRestMeta("yoast_seo", { other: 1 }, {
      meta_title: "Yoast Title",
      meta_description: "Yoast Desc",
    });
    assert.equal(missing.persisted, false);
    assert.match(missing.error ?? "", /Naxialis Yoast REST Meta|REST/i);
  });

  it("createWordPressDraft utilise les adaptateurs et force draft", () => {
    const source = read("lib/wordpress.ts");
    assert.match(source, /buildSeoRestMeta/);
    assert.match(source, /verifySeoRestMeta/);
    assert.match(source, /resolveWpSeoPlugin/);
    assert.match(source, /status:\s*"draft"/);
    assert.doesNotMatch(source, /status:\s*"publish"/);
    assert.match(source, /seo_persisted/);
    assert.match(source, /seo_error/);
    // Ne plus hardcoder uniquement Slim SEO.
    assert.doesNotMatch(
      source,
      /meta:\s*\{\s*slim_seo:\s*\{\s*title:\s*meta_title/
    );
  });

  it("agent OpenAI et schéma tool inchangés (pas de yoast dans prompts)", () => {
    const run = read("lib/agent/run-session.ts");
    assert.match(run, /createWordPressDraft/);
    assert.match(run, /seo_persisted/);
    assert.doesNotMatch(run, /yoast_seo|slim_seo/);

    // Schéma tool : paramètres create_wordpress_draft inchangés.
    const tools = read("lib/agent/tools.ts");
    assert.match(tools, /CREATE_WORDPRESS_DRAFT_TOOL_NAME/);
    assert.match(tools, /meta_title/);
    assert.match(tools, /meta_description/);
    assert.doesNotMatch(tools, /wpSeoPlugin|yoast_seo|seo_plugin/);
  });

  it("persistance AppSettings + UI Paramètres + route auth", () => {
    const schema = read("prisma/schema.prisma");
    assert.match(schema, /wpSeoPlugin/);

    const migration = read(
      "prisma/migrations/20261117090000_wp_seo_plugin_v782/migration.sql"
    );
    assert.match(migration, /ADD COLUMN "wpSeoPlugin"/);
    assert.doesNotMatch(migration, /DROP /);
    assert.doesNotMatch(migration, /AiVisibility|drop_ai_visibility/i);

    const settings = read("lib/settings/app-settings.ts");
    assert.match(settings, /updateWpSeoPlugin/);
    assert.match(settings, /resolveWpSeoPlugin/);
    assert.match(settings, /normalizeWpSeoPlugin/);

    const route = read("app/api/settings/seo-plugin/route.ts");
    assert.match(route, /requireAuth/);
    assert.match(route, /updateWpSeoPlugin/);

    const ui = read("components/settings/SeoPluginSettingsSection.tsx");
    assert.match(ui, /Intégration SEO WordPress/);
    assert.match(ui, /Slim SEO/);
    assert.match(ui, /Yoast SEO/);
    assert.doesNotMatch(ui, /Rank Math/i);

    const page = read("components/settings/SettingsPageClient.tsx");
    assert.match(page, /SeoPluginSettingsSection/);
  });

  it("extension WordPress Yoast présente et restrictive", () => {
    const php = read(
      "wordpress-extensions/naxialis-yoast-rest-meta/naxialis-yoast-rest-meta.php"
    );
    assert.match(php, /register_post_meta/);
    assert.match(php, /_yoast_wpseo_title/);
    assert.match(php, /_yoast_wpseo_metadesc/);
    assert.match(php, /show_in_rest/);
    assert.match(php, /edit_post/);
    assert.doesNotMatch(php, /register_rest_route/);
    assert.doesNotMatch(php, /publish/);
  });
});
