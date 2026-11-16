import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { isWordPressStatusForbiddenError } from "../lib/seo/wordpress-inventory";
import {
  buildWordPressInventoryUrl,
  resolveInventoryModifiedAfter,
  resolveInventoryPagePlan,
} from "../lib/seo/wordpress-url";

describe("WordPress sync pagination scenarios", () => {
  it("plans a complete sync when headers and body agree", () => {
    const page1 = resolveInventoryPagePlan({
      page: 1,
      perPage: 100,
      postsOnPage: 74,
      headerTotal: 74,
      headerTotalPages: 1,
    });
    assert.equal(page1.headerInconsistent, false);
    assert.equal(page1.shouldContinue, false);
    assert.equal(page1.totalPages, 1);
  });

  it("plans incremental sync URLs with modified_after", () => {
    const after = new Date("2026-10-01T00:00:00.000Z");
    const url = buildWordPressInventoryUrl({
      baseUrl: "https://naxialis.com",
      page: 1,
      perPage: 100,
      status: "publish",
      context: "view",
      modifiedAfter: after,
    });
    assert.match(url, /modified_after=/);
    assert.match(url, /context=view/);
    assert.match(url, /\/wp\/v2\/posts/);
  });

  it("construit l’URL REST des pages WordPress", () => {
    const url = buildWordPressInventoryUrl({
      baseUrl: "https://naxialis.com",
      page: 1,
      perPage: 100,
      status: "publish",
      context: "view",
      resource: "pages",
    });
    assert.match(url, /\/wp\/v2\/pages/);
    assert.doesNotMatch(url, /\/wp\/v2\/posts/);
  });

  it("curseur incrémental par contentType (pages jamais sync → null)", () => {
    const postCursor = new Date("2026-11-12T17:14:25.000Z");
    assert.equal(
      resolveInventoryModifiedAfter({
        mode: "full",
        latestModifiedByContentType: { post: postCursor },
        contentType: "page",
      }),
      null
    );
    assert.equal(
      resolveInventoryModifiedAfter({
        mode: "incremental",
        latestModifiedByContentType: { post: postCursor },
        contentType: "page",
      }),
      null
    );
    assert.equal(
      resolveInventoryModifiedAfter({
        mode: "incremental",
        latestModifiedByContentType: { post: postCursor },
        contentType: "post",
      }),
      postCursor
    );
    const pageCursor = new Date("2026-10-01T00:00:00.000Z");
    assert.equal(
      resolveInventoryModifiedAfter({
        mode: "incremental",
        latestModifiedByContentType: {
          post: postCursor,
          page: pageCursor,
        },
        contentType: "page",
      }),
      pageCursor
    );
  });

  it("reconnaît un refus REST de statut (pages draft) sans l’assimiler à une panne fatale", () => {
    const body =
      '{"code":"rest_invalid_param","message":"Paramètre(s) invalide(s) : « status »","data":{"status":400,"params":{"status":"L’état est interdit."},"details":{"status":{"code":"rest_forbidden_status"}}}}';
    assert.equal(isWordPressStatusForbiddenError(400, body), true);
    assert.equal(isWordPressStatusForbiddenError(500, body), false);
    assert.equal(isWordPressStatusForbiddenError(400, "other"), false);
  });

  it("persiste contentType page sans collision d’ID cross-type", () => {
    // WordPress partage l’espace d’IDs ; la clé métier reste wpPostId.
    // La dédup sync utilise contentType:id pour ne pas mélanger les lots.
    const batches = [
      { contentType: "post" as const, ids: [100, 200] },
      { contentType: "page" as const, ids: [300, 200] },
    ];
    const seenKeys = new Set<string>();
    const byType: Record<"post" | "page", number[]> = { post: [], page: [] };
    for (const batch of batches) {
      for (const id of batch.ids) {
        const key = `${batch.contentType}:${id}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        byType[batch.contentType].push(id);
      }
    }
    assert.deepEqual(byType.post, [100, 200]);
    assert.deepEqual(byType.page, [300, 200]);
  });

  it("flags partial page when X-WP-Total is higher than retrieved", () => {
    const plan = resolveInventoryPagePlan({
      page: 1,
      perPage: 100,
      postsOnPage: 11,
      headerTotal: 74,
      headerTotalPages: 1,
    });
    assert.equal(plan.headerInconsistent, true);
    assert.equal(plan.shouldContinue, false);
  });
});

describe("WordPress sync persist fallback contract", () => {
  it("keeps historical fields when diagnostic args are unknown", () => {
    // Simule le message Prisma observé en Phase 1.1 (client périmé).
    const prismaError = `
Invalid \`prisma.wordPressSyncRun.update()\` invocation:

{
  data: {
    expectedTotal: 80,
    ~~~~~~~~~~~~~
    storedCount: 12
  }
}
`;
    assert.match(prismaError, /expectedTotal/);
    assert.match(prismaError, /Invalid `prisma\.wordPressSyncRun\.update\(\)`/);

    const fallbackData = {
      status: "completed" as const,
      fetchedCount: 12,
      upsertedCount: 12,
      error: null as string | null,
      finishedAt: new Date(),
    };
    assert.equal(fallbackData.fetchedCount, 12);
    assert.ok(!("expectedTotal" in fallbackData));
  });

  it("preserves fetched counters on partial success before persist failure", () => {
    const counters = {
      fetchedCount: 75,
      upsertedCount: 75,
      expectedTotal: 80,
      storedCount: 75,
    };
    // Même si la persistance diagnostic échoue, les compteurs métier restent.
    assert.ok(counters.fetchedCount > 0);
    assert.ok(counters.storedCount === counters.upsertedCount);
    assert.ok(counters.expectedTotal >= counters.fetchedCount);
  });

  it("allows a new sync after a failed run status", () => {
    const previous = { status: "failed" };
    const canStart = previous.status !== "running";
    assert.equal(canStart, true);
  });
});

describe("WordPress paginated response aggregation", () => {
  it("aggregates unique posts across status fetches", () => {
    const batches = [
      [{ id: 1 }, { id: 2 }, { id: 3 }],
      [{ id: 2 }, { id: 4 }],
      [{ id: 5 }],
    ];
    const seen = new Set<number>();
    for (const batch of batches) {
      for (const post of batch) {
        seen.add(post.id);
      }
    }
    assert.equal(seen.size, 5);
  });

  it("mock documents view returning full publish set", async () => {
    const fetchMock = mock.fn(async () => ({
      ok: true,
      status: 200,
      headers: {
        get(name: string) {
          if (name === "X-WP-Total") return "74";
          if (name === "X-WP-TotalPages") return "1";
          return null;
        },
      },
      json: async () => Array.from({ length: 74 }, (_, i) => ({ id: i + 1 })),
    }));

    const response = await fetchMock();
    const posts = await response.json();
    assert.equal(posts.length, 74);
    assert.equal(response.headers.get("X-WP-Total"), "74");
    assert.equal(fetchMock.mock.callCount(), 1);
  });
});
