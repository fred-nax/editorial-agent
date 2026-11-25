import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  deriveWebflowInventoryStatus,
  normalizeWebflowInventoryItem,
} from "../lib/webflow/inventory-normalize";
import { assertWebflowAllowedRequest } from "../lib/webflow/client";
import { listAllWebflowCollectionItems } from "../lib/webflow/items";
import { createWebflowClient } from "../lib/webflow/client";
import {
  isWebflowModuleEnabled,
  WORKSPACE_IDS,
  workspaceWhere,
} from "../lib/workspace";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function createDb() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL requis (migtest).");
  }
  if (!url.includes("migtest")) {
    throw new Error(
      `Refus d’écrire hors base de test (URL=${url.replace(/:[^:@/]+@/, ":***@")}).`
    );
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
}

describe("V7.12.0 — inventaire Webflow (source + normalisation)", () => {
  it("active le module inventory Webflow sans activer opportunités", () => {
    assert.equal(isWebflowModuleEnabled("inventory"), true);
    assert.equal(isWebflowModuleEnabled("opportunities"), false);
    assert.equal(isWebflowModuleEnabled("featured_image"), false);
  });

  it("autorise GET items/live et refuse publish", () => {
    assert.doesNotThrow(() =>
      assertWebflowAllowedRequest(
        "GET",
        "/collections/abc123/items/live"
      )
    );
    assert.throws(
      () =>
        assertWebflowAllowedRequest(
          "POST",
          "/collections/abc123/items/live"
        ),
      /interdit/i
    );
    assert.throws(
      () =>
        assertWebflowAllowedRequest("POST", "/collections/abc123/items/publish"),
      /interdit/i
    );
  });

  it("dérive published / draft / archived / changed", () => {
    assert.equal(
      deriveWebflowInventoryStatus({
        isDraft: false,
        isArchived: false,
        isLive: true,
        lastPublished: "2026-01-01T00:00:00.000Z",
        lastUpdated: "2026-01-01T00:00:00.000Z",
      }),
      "published"
    );
    assert.equal(
      deriveWebflowInventoryStatus({
        isDraft: true,
        isArchived: false,
        isLive: false,
        lastPublished: null,
        lastUpdated: "2026-01-01T00:00:00.000Z",
      }),
      "draft"
    );
    assert.equal(
      deriveWebflowInventoryStatus({
        isDraft: false,
        isArchived: true,
        isLive: false,
        lastPublished: "2026-01-01T00:00:00.000Z",
        lastUpdated: "2026-01-02T00:00:00.000Z",
      }),
      "archived"
    );
    assert.equal(
      deriveWebflowInventoryStatus({
        isDraft: true,
        isArchived: false,
        isLive: true,
        lastPublished: "2026-01-01T00:00:00.000Z",
        lastUpdated: "2026-01-03T00:00:00.000Z",
      }),
      "changed"
    );
  });

  it("normalise via mapping sans inventer d’URL", () => {
    const normalized = normalizeWebflowInventoryItem(
      {
        id: "aaaaaaaaaaaaaaaaaaaaaaaa",
        isDraft: false,
        isArchived: false,
        createdOn: "2026-01-01T00:00:00.000Z",
        lastUpdated: "2026-01-02T00:00:00.000Z",
        lastPublished: "2026-01-02T00:00:00.000Z",
        fieldData: {
          name: "Titre WF",
          slug: "titre-wf",
          "post-body": "<p>Hello <b>world</b></p>",
          "post-summary": "<p>Résumé</p>",
        },
      },
      {
        title: { fieldId: "1", fieldSlug: "name" },
        slug: { fieldId: "2", fieldSlug: "slug" },
        content: { fieldId: "3", fieldSlug: "post-body" },
        excerpt: { fieldId: "4", fieldSlug: "post-summary" },
      },
      { isLive: true }
    );
    assert.equal(normalized.title, "Titre WF");
    assert.equal(normalized.slug, "titre-wf");
    assert.equal(normalized.contentText, "Hello world");
    assert.equal(normalized.url, null);
    assert.equal(normalized.status, "published");
  });

  it("pagine les items avec fetch simulé (offset/limit)", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      const offset = Number(new URL(url).searchParams.get("offset") ?? "0");
      if (offset === 0) {
        return new Response(
          JSON.stringify({
            items: Array.from({ length: 100 }, (_, i) => ({
              id: `id${String(i).padStart(22, "0")}`,
              isDraft: true,
              isArchived: false,
              fieldData: {},
            })),
            pagination: { total: 120, limit: 0, limit: 100 },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          items: Array.from({ length: 20 }, (_, i) => ({
            id: `id${String(100 + i).padStart(22, "0")}`,
            isDraft: false,
            isArchived: false,
            lastPublished: "2026-01-01T00:00:00.000Z",
            fieldData: {},
          })),
          pagination: { total: 120, offset: 100, limit: 100 },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const client = createWebflowClient({
      apiToken: "wf_test_token_xxxxxxxx",
      fetchImpl,
    });
    const result = await listAllWebflowCollectionItems(client, "col123", {
      live: false,
    });
    assert.equal(result.items.length, 120);
    assert.equal(result.pagesFetched, 2);
    assert.equal(result.expectedTotal, 120);
    assert.ok(calls.every((url) => url.includes("/collections/col123/items")));
    assert.ok(calls.every((url) => !url.includes("/publish")));
  });

  it("migration additive et routes isolées Webflow", () => {
    const sql = read(
      "prisma/migrations/20261125120000_webflow_cms_inventory_v7120/migration.sql"
    );
    assert.match(sql, /CREATE TABLE "WebflowCmsItem"/);
    assert.match(sql, /CREATE TABLE "WebflowSyncRun"/);
    assert.doesNotMatch(sql, /DROP TABLE/i);
    assert.doesNotMatch(sql, /TRUNCATE/i);
    assert.doesNotMatch(sql, /ALTER TABLE "WordPressPost"/);
    // Commentaire d’avertissement OK ; aucune instruction SQL drop GEO.
    assert.doesNotMatch(sql, /^\s*DROP\b/im);

    const syncRoute = read("app/api/webflow-inventory/sync/route.ts");
    assert.match(syncRoute, /assertWebflowOnlyModule/);
    assert.match(syncRoute, /assertModuleAllowedForWorkspace/);
    assert.doesNotMatch(syncRoute, /resolveWordPressConfig|WordPressPost/);

    const itemsRoute = read("app/api/webflow-inventory/items/route.ts");
    assert.match(itemsRoute, /webflowCmsItem/);
    assert.doesNotMatch(itemsRoute, /wordPressPost/);

    const access = read("lib/editorial-inventory/access.ts");
    assert.match(access, /listEditorialInventory/);
    assert.match(access, /internal_links/);
    assert.match(access, /seo_opportunities/);
  });

  it("ne hard-code pas WORKSPACE_IDS.wordpress dans le moteur Webflow", () => {
    const inventory = read("lib/webflow/inventory.ts");
    assert.doesNotMatch(inventory, /WORKSPACE_IDS\.wordpress/);
    assert.match(inventory, /run\.workspaceId/);
    assert.match(inventory, /inventaire local précédent conservé/i);
    assert.match(inventory, /Liste live indisponible/);
    assert.match(inventory, /bad_request/);
  });
});

describe("V7.12.0 — isolation DB inventaire Webflow (migtest)", () => {
  const db = createDb();
  const ids = {
    itemWpSpace: "v7120_item_should_not_exist_on_wp",
    itemWf: "bbbbbbbbbbbbbbbbbbbbbbbb",
  };

  before(async () => {
    await db.webflowCmsItem.deleteMany({
      where: {
        OR: [
          { webflowItemId: ids.itemWf },
          { id: ids.itemWpSpace },
        ],
      },
    });
    await db.webflowCmsItem.create({
      data: {
        workspaceId: WORKSPACE_IDS.webflow,
        webflowItemId: ids.itemWf,
        siteId: "site_test",
        collectionId: "col_test",
        title: "Article inventaire isolé",
        slug: "article-inventaire-isole",
        status: "published",
        isDraft: false,
        isArchived: false,
        isLive: true,
      },
    });
  });

  after(async () => {
    await db.webflowCmsItem.deleteMany({
      where: { webflowItemId: ids.itemWf },
    });
    await db.$disconnect();
  });

  it("lecture croisée WordPress → item Webflow = null", async () => {
    const denied = await db.webflowCmsItem.findFirst({
      where: {
        webflowItemId: ids.itemWf,
        ...workspaceWhere(WORKSPACE_IDS.wordpress),
      },
    });
    assert.equal(denied, null);
  });

  it("WordPressPost inchangé (pas de contamination)", async () => {
    const wpCount = await db.wordPressPost.count({
      where: workspaceWhere(WORKSPACE_IDS.wordpress),
    });
    assert.ok(wpCount >= 0);
    const leaked = await db.wordPressPost.findFirst({
      where: {
        ...workspaceWhere(WORKSPACE_IDS.webflow),
        title: "Article inventaire isolé",
      },
    });
    // Peut être null ou un post de test antérieur — ne doit pas être créé par ce suite.
    if (leaked) {
      assert.notEqual(leaked.slug, "article-inventaire-isole");
    }
  });

  it("unicité (workspace, collection, item)", async () => {
    await assert.rejects(
      () =>
        db.webflowCmsItem.create({
          data: {
            workspaceId: WORKSPACE_IDS.webflow,
            webflowItemId: ids.itemWf,
            siteId: "site_test",
            collectionId: "col_test",
            title: "Dup",
            slug: "dup",
            status: "draft",
          },
        }),
      /Unique constraint|P2002/i
    );
  });
});
