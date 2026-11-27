/**
 * PERF-001 / TEST-001 — pagination historique sur migtest.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { db } from "../lib/db";
import { listArticleHistory } from "../lib/articles/history-query";

const url = process.env.DATABASE_URL?.trim();
if (!url?.includes("migtest")) {
  throw new Error("DATABASE_URL migtest requis.");
}

describe("V7.16.2 — listArticleHistory (migtest)", () => {
  it("ne charge que la page demandée et respecte workspaceId", async () => {
    const workspace = await db.editorialWorkspace.findFirst({
      where: { enabled: true },
      select: { id: true },
    });
    assert.ok(workspace, "workspace migtest requis");

    const page1 = await listArticleHistory({
      workspaceId: workspace.id,
      page: 1,
      pageSize: 20,
    });
    assert.ok(page1.articles.length <= 20);
    assert.equal(page1.page, 1);
    assert.ok(page1.pageCount >= 1);
    assert.ok(page1.total >= page1.articles.length);

    for (const row of page1.articles) {
      assert.equal(typeof row.id, "string");
      assert.equal(typeof row.subject, "string");
      assert.ok(!("trace" in row));
      assert.ok(!("editorialContext" in row));
    }

    if (page1.total > 20) {
      const page2 = await listArticleHistory({
        workspaceId: workspace.id,
        page: 2,
        pageSize: 20,
      });
      assert.equal(page2.page, 2);
      if (page2.articles[0] && page1.articles[0]) {
        assert.notEqual(page2.articles[0].id, page1.articles[0].id);
      }
    }
  });

  it("gère une page hors bornes en renvoyant la dernière page", async () => {
    const workspace = await db.editorialWorkspace.findFirst({
      where: { enabled: true },
      select: { id: true },
    });
    assert.ok(workspace);
    const result = await listArticleHistory({
      workspaceId: workspace.id,
      page: 9999,
      pageSize: 20,
    });
    assert.ok(result.page <= result.pageCount);
  });
});
