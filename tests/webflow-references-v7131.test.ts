/**
 * V7.13.1 — Catégories et auteurs Webflow (découverte, sync, injection, isolation).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildWebflowFieldData } from "../lib/webflow/drafts";
import { extractReferencedCollectionId } from "../lib/webflow/collections";
import { discoverWebflowReferenceTargets } from "../lib/webflow/references-discover";
import type { WebflowClient } from "../lib/webflow/client";
import type { WebflowFieldMapping } from "../lib/webflow/types";
import { isWebflowModuleEnabled } from "../lib/workspace/protection";

const root = join(process.cwd());

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function mockClient(handlers: Record<string, unknown>): WebflowClient {
  return {
    apiToken: "test",
    request: async ({ path }) => {
      const key = Object.keys(handlers).find((k) => path.includes(k));
      if (!key) {
        throw new Error(`Unexpected path ${path}`);
      }
      return handlers[key] as never;
    },
  } as WebflowClient;
}

const mapping: WebflowFieldMapping = {
  title: { fieldId: "f-title", fieldSlug: "name", fieldType: "PlainText" },
  slug: { fieldId: "f-slug", fieldSlug: "slug", fieldType: "PlainText" },
  content: { fieldId: "f-body", fieldSlug: "post-body", fieldType: "RichText" },
  excerpt: { fieldId: "f-ex", fieldSlug: "summary", fieldType: "PlainText" },
  meta_title: { fieldId: "f-mt", fieldSlug: "meta-title", fieldType: "PlainText" },
  meta_description: {
    fieldId: "f-md",
    fieldSlug: "meta-desc",
    fieldType: "PlainText",
  },
  category: {
    fieldId: "f-cat",
    fieldSlug: "category",
    fieldType: "Reference",
  },
  author: {
    fieldId: "f-auth",
    fieldSlug: "author",
    fieldType: "Reference",
  },
};

describe("V7.13.1 — Webflow references (unit)", () => {
  it("extractReferencedCollectionId lit validations.collectionId", () => {
    assert.equal(
      extractReferencedCollectionId({ collectionId: "col-cats" }),
      "col-cats"
    );
    assert.equal(
      extractReferencedCollectionId({ collection: { id: "col-authors" } }),
      "col-authors"
    );
    assert.equal(extractReferencedCollectionId(null), null);
  });

  it("découvre les collections Reference sans hardcoder les noms", async () => {
    const client = mockClient({
      "/sites/site-1/collections": {
        collections: [
          { id: "col-blog", displayName: "Blog" },
          { id: "col-cats", displayName: "Categories" },
          { id: "col-authors", displayName: "Authors" },
        ],
      },
      "/collections/col-blog": {
        id: "col-blog",
        displayName: "Blog",
        fields: [
          {
            id: "f-cat",
            slug: "category",
            type: "Reference",
            isRequired: true,
            displayName: "Category",
            validations: { collectionId: "col-cats" },
          },
          {
            id: "f-auth",
            slug: "author",
            type: "Reference",
            isRequired: false,
            displayName: "Author",
            validations: { collectionId: "col-authors" },
          },
        ],
      },
    });

    const result = await discoverWebflowReferenceTargets({
      client,
      siteId: "site-1",
      blogCollectionId: "col-blog",
      mapping,
    });

    assert.equal(result.ok, true);
    assert.equal(result.targets.length, 2);
    assert.equal(result.targets[0]?.referencedCollectionId, "col-cats");
    assert.equal(result.targets[0]?.isRequired, true);
    assert.equal(result.targets[1]?.referencedCollectionId, "col-authors");
    assert.equal(result.targets[0]?.kind, "category");
  });

  it("refuse MultiReference", async () => {
    const client = mockClient({
      "/sites/site-1/collections": {
        collections: [
          { id: "col-blog", displayName: "Blog" },
          { id: "col-cats", displayName: "Cats" },
        ],
      },
      "/collections/col-blog": {
        id: "col-blog",
        fields: [
          {
            id: "f-cat",
            slug: "category",
            type: "MultiReference",
            isRequired: false,
            displayName: "Cats",
            validations: { collectionId: "col-cats" },
          },
        ],
      },
    });
    const result = await discoverWebflowReferenceTargets({
      client,
      siteId: "site-1",
      blogCollectionId: "col-blog",
      mapping: { category: mapping.category },
    });
    assert.equal(result.targets.length, 0);
    assert.match(result.issues.join(" "), /MultiReference/);
  });

  it("injecte category/author dans buildWebflowFieldData sans toucher create_webflow_draft", () => {
    const fieldData = buildWebflowFieldData(
      {
        title: "Titre",
        content: "<h2>Section</h2><p>Body</p>",
        excerpt: "Ex",
        slug: "titre",
        meta_title: "MT",
        meta_description: "MD",
      },
      mapping,
      {
        categoryItemId: "item-cat-1",
        authorItemId: "item-auth-1",
      }
    );
    assert.equal(fieldData.category, "item-cat-1");
    assert.equal(fieldData.author, "item-auth-1");
    assert.equal(fieldData.name, "Titre");

    const tool = read("lib/agent/webflow-draft-tool.ts");
    assert.match(tool, /create_webflow_draft/);
    assert.doesNotMatch(tool, /webflowCategoryItemId|categoryItemId/);
  });

  it("migration additive WebflowCmsReference + pas de drop destructif", () => {
    const sql = read(
      "prisma/migrations/20261125170000_webflow_cms_references_v7131/migration.sql"
    );
    assert.match(sql, /WebflowCmsReference/);
    assert.match(sql, /webflowDefaultCategoryItemId/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS/);
    assert.doesNotMatch(sql, /DROP TABLE|drop_ai_visibility/);
  });

  it("soft-missing uniquement après sync complète (code sync)", () => {
    const sync = read("lib/webflow/references-sync.ts");
    assert.match(sync, /missingAt/);
    assert.match(sync, /Soft-missing uniquement après/);
    assert.match(sync, /catalogue préservé/);
  });

  it("validation avant OpenAI dans run-session + injection createDraft", () => {
    const run = read("lib/agent/run-session.ts");
    assert.match(run, /resolveWebflowRefsWithDefaults/);
    assert.match(run, /avant tout appel OpenAI payant/);
    assert.match(run, /webflowCategoryItemId/);
    assert.match(run, /createDraft\(\{[\s\S]*webflowCategoryItemId/);
  });

  it("patch brouillon staged n’appelle pas publish/live", () => {
    const update = read("lib/webflow/references-update.ts");
    assert.match(update, /isDraft: true/);
    assert.doesNotMatch(update, /path:.*\/publish|path:.*\/live|unpublish/);
    assert.match(update, /assertWebflowDraftItemForFeaturedImage/);
  });

  it("routes API workspace-bound + header", () => {
    const refs = read("app/api/webflow-references/route.ts");
    assert.match(refs, /assertRequestWorkspaceMatchesActive/);
    assert.match(refs, /assertWebflowOnlyModule/);
    const draft = read("app/api/articles/[id]/webflow-references/route.ts");
    assert.match(draft, /assertRequestWorkspaceMatchesActive/);
    assert.doesNotMatch(draft, /\/publish/);
  });

  it("non-régression modules Webflow + featured_image", () => {
    assert.equal(isWebflowModuleEnabled("featured_image"), true);
    assert.equal(isWebflowModuleEnabled("inventory"), true);
    assert.equal(isWebflowModuleEnabled("topics"), true);
  });

  it("UI settings + formulaire + détail brouillon présents", () => {
    assert.match(
      read("components/cms/WebflowConfigPanel.tsx"),
      /WebflowReferencesSection/
    );
    assert.match(
      read("components/ArticleForm.tsx"),
      /WebflowRefsFields|webflowCategoryItemId/
    );
    assert.match(
      read("components/articles/WebflowDraftRefsPanel.tsx"),
      /Enregistrer/
    );
  });
});
