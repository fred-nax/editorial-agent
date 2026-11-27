import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  assertPaidRouteAllowed,
  buildPaidRouteBucketKey,
  readPaidRouteRateLimitConfig,
  resetPaidRouteRateLimitForTests,
} from "../lib/auth/paid-route-rate-limit";
import {
  assertRequiredEnv,
  missingAuthUrlInProduction,
} from "../lib/env-check";
import {
  DEFAULT_ARTICLE_HISTORY_PAGE_SIZE,
  parseArticleHistoryPage,
  parseArticleHistoryPageSize,
} from "../lib/articles/history-query";

describe("V7.16.2 SEC-003 — paid route rate-limit", () => {
  beforeEach(() => {
    resetPaidRouteRateLimitForTests();
  });

  it("isole les buckets par workspace et route", () => {
    assert.notEqual(
      buildPaidRouteBucketKey({
        workspaceId: "ws-a",
        routeKey: "generate",
      }),
      buildPaidRouteBucketKey({
        workspaceId: "ws-b",
        routeKey: "generate",
      })
    );
  });

  it("bloque après le plafond configuré", () => {
    const config = { maxRequests: 3, windowMs: 60_000 };
    const base = {
      workspaceId: "ws-1",
      routeKey: "generate",
      config,
      now: 1_000,
    };
    assert.equal(assertPaidRouteAllowed(base).allowed, true);
    assert.equal(assertPaidRouteAllowed(base).allowed, true);
    assert.equal(assertPaidRouteAllowed(base).allowed, true);
    const denied = assertPaidRouteAllowed(base);
    assert.equal(denied.allowed, false);
    assert.ok((denied.retryAfterMs ?? 0) > 0);
  });

  it("lit la config depuis l’env", () => {
    const cfg = readPaidRouteRateLimitConfig({
      OPENAI_PAID_ROUTE_MAX_PER_HOUR: "12",
      OPENAI_PAID_ROUTE_WINDOW_MS: "120000",
    } as NodeJS.ProcessEnv);
    assert.equal(cfg.maxRequests, 12);
    assert.equal(cfg.windowMs, 120_000);
  });
});

describe("V7.16.2 AUTH-002 — AUTH_URL production", () => {
  it("signale l’absence en production", () => {
    assert.equal(
      missingAuthUrlInProduction({ NODE_ENV: "production" } as NodeJS.ProcessEnv),
      "AUTH_URL (ou NEXTAUTH_URL)"
    );
    assert.equal(
      missingAuthUrlInProduction({
        NODE_ENV: "production",
        AUTH_URL: "https://agent.example",
      } as NodeJS.ProcessEnv),
      null
    );
    assert.equal(
      missingAuthUrlInProduction({ NODE_ENV: "development" } as NodeJS.ProcessEnv),
      null
    );
  });

  it("assertRequiredEnv échoue sans AUTH_URL en production", () => {
    assert.throws(
      () =>
        assertRequiredEnv({
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://x/y",
          AUTH_SECRET: "secret",
          ADMIN_EMAIL: "a@b.c",
          ADMIN_PASSWORD_HASH: "hash",
        } as NodeJS.ProcessEnv),
      /AUTH_URL/
    );
  });
});

describe("V7.16.2 PERF — pagination historique", () => {
  it("borne page et pageSize", () => {
    assert.equal(parseArticleHistoryPage("0"), 1);
    assert.equal(parseArticleHistoryPage("-2"), 1);
    assert.equal(parseArticleHistoryPage("3"), 3);
    assert.equal(parseArticleHistoryPageSize("20"), 20);
    assert.equal(parseArticleHistoryPageSize("50"), 50);
    assert.equal(parseArticleHistoryPageSize("999"), DEFAULT_ARTICLE_HISTORY_PAGE_SIZE);
  });
});
