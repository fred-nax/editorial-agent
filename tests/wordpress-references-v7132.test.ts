/**
 * V7.13.2 — Catégories / auteurs WordPress (sélection manuelle + sync).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildCategoryHierarchyLabel,
} from "@/lib/wordpress/references-sync";
import {
  normalizeWpCategorizationMode,
  parseWpCategoryIdsJson,
  serializeWpCategoryIds,
} from "@/lib/wordpress/references-types";
import {
  WordPressReferenceValidationError,
} from "@/lib/wordpress/references-validate";
import {
  assertWordPressDraftEditable,
  WordPressDraftUpdateError,
} from "@/lib/wordpress/references-update";
import { parseSyncedCategoriesJson } from "@/lib/wordpress-categories";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("V7.13.2 — types et utilitaires WordPress refs", () => {
  it("normalise le mode (défaut automatic)", () => {
    assert.equal(normalizeWpCategorizationMode(null), "automatic");
    assert.equal(normalizeWpCategorizationMode("manual"), "manual");
    assert.equal(normalizeWpCategorizationMode("other"), "automatic");
  });

  it("parse / serialize IDs catégories", () => {
    assert.deepEqual(parseWpCategoryIdsJson("[1,2,2,3]"), [1, 2, 3]);
    assert.equal(serializeWpCategoryIds([3, 1, 1]), "[3,1]");
    assert.equal(serializeWpCategoryIds([]), null);
  });

  it("conserve parent dans le snapshot JSON", () => {
    const parsed = parseSyncedCategoriesJson(
      JSON.stringify([
        { id: 10, name: "Parent", slug: "parent", parent: 0, count: 1 },
        { id: 11, name: "Enfant", slug: "enfant", parent: 10, count: 0 },
      ])
    );
    assert.equal(parsed[1]?.parent, 10);
  });

  it("construit un libellé hiérarchique", () => {
    const label = buildCategoryHierarchyLabel(
      [
        { wpId: 1, name: "Racine", parentWpId: null },
        { wpId: 2, name: "Enfant", parentWpId: 1 },
        { wpId: 3, name: "Petit-enfant", parentWpId: 2 },
      ],
      3
    );
    assert.equal(label, "Racine › Enfant › Petit-enfant");
  });
});

describe("V7.13.2 — refus brouillons non éditables", () => {
  it("refuse publish / trash / statut incertain", () => {
    assert.throws(
      () =>
        assertWordPressDraftEditable({
          id: 1,
          status: "publish",
          categories: [],
          author: 1,
          title: "x",
          link: "",
        }),
      WordPressDraftUpdateError
    );
    assert.throws(
      () =>
        assertWordPressDraftEditable({
          id: 1,
          status: "trash",
          categories: [],
          author: 1,
          title: "x",
          link: "",
        }),
      WordPressDraftUpdateError
    );
    assert.doesNotThrow(() =>
      assertWordPressDraftEditable({
        id: 1,
        status: "draft",
        categories: [1],
        author: 2,
        title: "x",
        link: "",
      })
    );
  });
});

describe("V7.13.2 — fichiers et non-régression", () => {
  it("préserve create_wordpress_draft et resolveCategoriesForSubject", () => {
    const tools = read("lib/agent/tools.ts");
    assert.match(tools, /create_wordpress_draft/);
    const cats = read("lib/wordpress-categories.ts");
    assert.match(cats, /export function resolveCategoriesForSubject/);
    const session = read("lib/agent/run-session.ts");
    assert.match(session, /resolveCategoriesForSubject/);
    assert.match(session, /wpCategorizationMode/);
    assert.match(session, /wpAuthorIdForDraft/);
  });

  it("injecte author uniquement de façon optionnelle dans wordpress.ts", () => {
    const wp = read("lib/wordpress.ts");
    assert.match(wp, /authorId/);
    assert.match(wp, /payload\.author = authorId/);
    assert.match(wp, /status: "draft"/);
  });

  it("expose APIs workspace-scopées wordpress-references", () => {
    const api = read("app/api/wordpress-references/route.ts");
    assert.match(api, /assertWordPressOnlyModule/);
    assert.match(api, /assertRequestWorkspaceMatchesActive/);
    assert.match(api, /syncWordPressCmsReferences/);
    const draft = read("app/api/articles/[id]/wordpress-references/route.ts");
    assert.match(draft, /patchWordPressDraftReferences/);
    assert.match(draft, /NOT_DRAFT|assertWordPressDraftEditable|editable/);
  });

  it("migration additive WordPressCmsReference (pas de DROP)", () => {
    const sql = read(
      "prisma/migrations/20261125190000_wordpress_cms_references_v7132/migration.sql"
    );
    assert.match(sql, /WordPressCmsReference/);
    assert.match(sql, /wpCategorizationMode/);
    assert.doesNotMatch(sql, /\bDROP TABLE\b/i);
    assert.doesNotMatch(sql, /drop_ai_visibility_monitor/);
  });

  it("préserve tarifs OpenAI V7.13.1", () => {
    const pricing = read("lib/openai-pricing.ts");
    assert.match(pricing, /gpt-5\.6-sol/);
    assert.match(pricing, /4(?:\.0)?/);
  });

  it("UI WordPress refs + section paramètres + panneau brouillon", () => {
    assert.match(
      read("components/cms/WordPressRefsFields.tsx"),
      /Métadonnées éditoriales WordPress/
    );
    assert.match(
      read("components/cms/WordPressReferencesSection.tsx"),
      /Catégories et auteurs WordPress/
    );
    assert.match(
      read("components/articles/WordPressDraftRefsPanel.tsx"),
      /Mettre à jour le brouillon/
    );
    assert.match(
      read("components/ArticleForm.tsx"),
      /WordPressRefsFields/
    );
    assert.match(
      read("components/TopicQueue.tsx"),
      /WordPressRefsFields/
    );
  });

  it("file éditoriale et SEO portent les champs WP", () => {
    assert.match(read("lib/topics/create.ts"), /wpCategorizationMode/);
    assert.match(read("lib/seo/queue.ts"), /wpManualDefaultCategoryIds/);
    assert.match(read("lib/editorial-context.ts"), /wpCategoryIds/);
    assert.match(read("lib/generation.ts"), /wpCategorizationMode/);
  });

  it("erreur de validation typée", () => {
    const err = new WordPressReferenceValidationError("x", "CATEGORY_MISSING");
    assert.equal(err.code, "CATEGORY_MISSING");
  });
});
