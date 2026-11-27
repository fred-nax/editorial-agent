/**
 * PERF-001 / TEST-001 — pagination historique sur migtest.
 * Données dédiées (préfixe) pour éviter les courses avec la suite parallèle.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { db } from "../lib/db";
import { listArticleHistory } from "../lib/articles/history-query";

const url = process.env.DATABASE_URL?.trim();
if (!url?.includes("migtest")) {
  throw new Error("DATABASE_URL migtest requis.");
}

const PREFIX = `v7162hist_${Date.now()}_`;
const WS_ID = `${PREFIX}ws`;

describe("V7.16.2 — listArticleHistory (migtest)", () => {
  before(async () => {
    await db.editorialWorkspace.upsert({
      where: { id: WS_ID },
      create: {
        id: WS_ID,
        slug: `${PREFIX}slug`,
        name: "History pagination fixture",
        cmsProvider: "wordpress",
        enabled: true,
      },
      update: {},
    });
    for (let i = 0; i < 25; i++) {
      await db.articleGeneration.create({
        data: {
          id: `${PREFIX}gen_${i}`,
          workspaceId: WS_ID,
          subject: `Fixture history ${i}`,
          title: `Title ${i}`,
          status: "completed",
          progressStage: "done",
        },
      });
    }
  });

  after(async () => {
    await db.articleGeneration.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });
    await db.editorialWorkspace.deleteMany({
      where: { id: WS_ID },
    });
  });

  it("ne charge que la page demandée et respecte workspaceId", async () => {
    const page1 = await listArticleHistory({
      workspaceId: WS_ID,
      page: 1,
      pageSize: 20,
    });
    assert.ok(page1.articles.length <= 20);
    assert.equal(page1.page, 1);
    assert.ok(page1.pageCount >= 1);
    assert.equal(page1.total, 25);
    assert.ok(page1.total >= page1.articles.length);
    assert.equal(page1.articles.length, 20);

    for (const row of page1.articles) {
      assert.equal(typeof row.id, "string");
      assert.ok(row.id.startsWith(PREFIX));
      assert.equal(typeof row.subject, "string");
      assert.ok(!("trace" in row));
      assert.ok(!("editorialContext" in row));
    }

    const page2 = await listArticleHistory({
      workspaceId: WS_ID,
      page: 2,
      pageSize: 20,
    });
    assert.equal(page2.page, 2);
    assert.equal(page2.articles.length, 5);
    assert.notEqual(page2.articles[0]?.id, page1.articles[0]?.id);
  });

  it("gère une page hors bornes en renvoyant la dernière page", async () => {
    const result = await listArticleHistory({
      workspaceId: WS_ID,
      page: 9999,
      pageSize: 20,
    });
    assert.ok(result.page <= result.pageCount);
    assert.equal(result.page, result.pageCount);
  });
});
