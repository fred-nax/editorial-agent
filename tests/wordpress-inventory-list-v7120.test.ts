import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { WORKSPACE_IDS, workspaceWhere } from "../lib/workspace";

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

describe("V7.12.0 — inventaire WordPress détaillé (source)", () => {
  it("route items isolée WordPress + filtres serveur", () => {
    const itemsRoute = read("app/api/wordpress-inventory/items/route.ts");
    assert.match(itemsRoute, /assertWordPressOnlyModule/);
    assert.match(itemsRoute, /workspaceWhere/);
    assert.match(itemsRoute, /wordPressPost/);
    assert.match(itemsRoute, /contentType/);
    assert.match(itemsRoute, /array_contains/);
    assert.match(itemsRoute, /adminUrl|wp-admin\/post\.php/);
    assert.doesNotMatch(itemsRoute, /webflowCmsItem|WebflowCmsItem/);
    assert.doesNotMatch(itemsRoute, /openai|OpenAI/i);
  });

  it("panneau WP réutilise composants partagés et expose le tableau", () => {
    const panel = read("components/inventory/WordPressInventoryPanel.tsx");
    assert.match(panel, /InventoryStatCard/);
    assert.match(panel, /InventorySearchInput/);
    assert.match(panel, /InventoryPagination/);
    assert.match(panel, /InventoryStatusBadge/);
    assert.match(panel, /\/api\/wordpress-inventory\/items/);
    assert.match(panel, /<table/);
    assert.match(panel, /Métadonnées SEO/);
    assert.doesNotMatch(panel, /webflow-inventory|WebflowCmsItem/);
  });

  it("board Webflow mutualise les mêmes composants sans données WP", () => {
    const board = read("components/inventory/WebflowInventoryBoard.tsx");
    assert.match(board, /InventoryStatCard/);
    assert.match(board, /InventoryListShell/);
    assert.match(board, /InventoryPagination/);
    assert.match(board, /<table/);
    assert.doesNotMatch(board, /wordpress-inventory|WordPressPost|wpPostId/);
  });
});

describe("V7.12.0 — isolation DB liste WordPress (migtest)", () => {
  const db = createDb();
  const ids = {
    wpPost: "v7120_wp_list_post",
    wfItem: "cccccccccccccccccccccccc",
  };

  before(async () => {
    await db.wordPressPost.deleteMany({
      where: { id: ids.wpPost },
    });
    await db.webflowCmsItem.deleteMany({
      where: { webflowItemId: ids.wfItem },
    });

    await db.wordPressPost.create({
      data: {
        id: ids.wpPost,
        workspaceId: WORKSPACE_IDS.wordpress,
        wpPostId: 912001,
        title: "Article inventaire WP liste",
        slug: "article-inventaire-wp-liste",
        url: "https://example.test/article-inventaire-wp-liste",
        status: "publish",
        contentType: "post",
        excerpt: "Extrait test",
        categories: [1, 2],
        publishedAt: new Date("2026-01-10T10:00:00.000Z"),
        modifiedAt: new Date("2026-01-11T10:00:00.000Z"),
      },
    });

    await db.webflowCmsItem.create({
      data: {
        workspaceId: WORKSPACE_IDS.webflow,
        webflowItemId: ids.wfItem,
        siteId: "site_test",
        collectionId: "col_test",
        title: "Ne doit pas apparaître WP",
        slug: "ne-doit-pas-apparaitre-wp",
        status: "draft",
        isDraft: true,
        isArchived: false,
        isLive: false,
      },
    });
  });

  after(async () => {
    await db.wordPressPost.deleteMany({ where: { id: ids.wpPost } });
    await db.webflowCmsItem.deleteMany({
      where: { webflowItemId: ids.wfItem },
    });
    await db.$disconnect();
  });

  it("filtre workspace WP ne voit pas WebflowCmsItem", async () => {
    const wpPosts = await db.wordPressPost.findMany({
      where: workspaceWhere(WORKSPACE_IDS.wordpress),
      select: { id: true, title: true },
    });
    assert.ok(wpPosts.some((row) => row.id === ids.wpPost));

    const cross = await db.webflowCmsItem.findFirst({
      where: workspaceWhere(WORKSPACE_IDS.wordpress),
    });
    assert.equal(cross, null);

    const byCategory = await db.wordPressPost.findMany({
      where: {
        ...workspaceWhere(WORKSPACE_IDS.wordpress),
        categories: { array_contains: 1 },
      },
      select: { id: true },
    });
    assert.ok(byCategory.some((row) => row.id === ids.wpPost));
  });
});
