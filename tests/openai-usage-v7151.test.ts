/**
 * V7.15.1 — Provenance registre vs legacy, garde migtest, statut tracking.
 * Sans appel OpenAI payant.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertApplicationDatabaseAllowed,
  databaseNameFromUrl,
  isMigtestDatabaseUrl,
} from "../lib/db";
import {
  mergeUsageTrackingFailure,
  readUsageTrackingFromTrace,
} from "../lib/openai-usage-tracking-status";

describe("V7.15.1 — garde bases PostgreSQL", () => {
  it("extrait le nom de base sans secrets", () => {
    assert.equal(
      databaseNameFromUrl(
        "postgresql://user:secret@127.0.0.1:5432/naxialis_agent"
      ),
      "naxialis_agent"
    );
    assert.equal(
      isMigtestDatabaseUrl(
        "postgresql://u:p@127.0.0.1:5432/naxialis_agent_v7113_migtest"
      ),
      true
    );
    assert.equal(
      isMigtestDatabaseUrl("postgresql://u:p@127.0.0.1:5432/naxialis_agent"),
      false
    );
  });

  it("refuse migtest hors test / hors ALLOW_MIGTEST_DATABASE", () => {
    const previousAllow = process.env.ALLOW_MIGTEST_DATABASE;
    const previousArgv = process.argv.slice();
    const previousExec = process.execArgv.slice();
    try {
      delete process.env.ALLOW_MIGTEST_DATABASE;
      // Simule un process hors node:test
      process.argv = ["node", "server.js"];
      process.execArgv = [];
      const previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";
      const previousLifecycle = process.env.npm_lifecycle_event;
      delete process.env.npm_lifecycle_event;

      assert.throws(
        () =>
          assertApplicationDatabaseAllowed(
            "postgresql://u:p@127.0.0.1:5432/naxialis_agent_v7113_migtest"
          ),
        /base de test/
      );

      process.env.ALLOW_MIGTEST_DATABASE = "1";
      assert.doesNotThrow(() =>
        assertApplicationDatabaseAllowed(
          "postgresql://u:p@127.0.0.1:5432/naxialis_agent_v7113_migtest"
        )
      );

      process.env.NODE_ENV = previousNodeEnv;
      if (previousLifecycle === undefined) {
        delete process.env.npm_lifecycle_event;
      } else {
        process.env.npm_lifecycle_event = previousLifecycle;
      }
    } finally {
      if (previousAllow === undefined) {
        delete process.env.ALLOW_MIGTEST_DATABASE;
      } else {
        process.env.ALLOW_MIGTEST_DATABASE = previousAllow;
      }
      process.argv = previousArgv;
      process.execArgv = previousExec;
    }
  });
});

describe("V7.15.1 — marqueur usageTracking dans trace", () => {
  it("fusionne un échec sans écraser le reste de la trace", () => {
    const merged = mergeUsageTrackingFailure(
      { version: 1, webSearch: { observed: true } },
      { operationType: "article_generation", error: "delegate missing" }
    );
    assert.equal((merged as { version?: number }).version, 1);
    const state = readUsageTrackingFromTrace(merged);
    assert.equal(state?.failures.length, 1);
    assert.equal(state?.failures[0]?.operationType, "article_generation");
    assert.match(state?.failures[0]?.error ?? "", /delegate missing/);
  });

  it("ne fabrique pas un coût zéro depuis un échec", () => {
    const state = readUsageTrackingFromTrace({
      usageTracking: {
        failures: [
          {
            ok: false,
            at: "2026-11-25T00:00:00.000Z",
            operationType: "image_generation",
            error: "insert failed",
          },
        ],
      },
    });
    assert.ok(state);
    assert.equal(state.failures[0]?.ok, false);
  });
});
