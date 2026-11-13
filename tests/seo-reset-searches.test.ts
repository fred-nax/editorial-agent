import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import {
  blockReasonIfRunning,
  previewSeoSearchReset,
  resetSeoSearches,
} from "../lib/seo/reset-searches";

describe("V7.5 — réinitialisation recherches SEO", () => {
  it("refuse lorsqu’une recherche est en cours", () => {
    assert.match(
      blockReasonIfRunning(1) ?? "",
      /encore en cours/i
    );
    assert.equal(blockReasonIfRunning(0), null);
  });

  it("prévisualise les volumes et bloque si running", async () => {
    const client = {
      seoOpportunity: {
        async count(args?: { where?: { topicId?: { not: null } } }) {
          if (args?.where?.topicId) {
            return 2;
          }
          return 12;
        },
      },
      opportunitySearchRun: {
        async count(args?: { where?: { status?: string } }) {
          if (args?.where?.status === "running") {
            return 1;
          }
          return 4;
        },
      },
    };

    const preview = await previewSeoSearchReset(client);
    assert.equal(preview.opportunityCount, 12);
    assert.equal(preview.searchRunCount, 4);
    assert.equal(preview.runningSearchCount, 1);
    assert.equal(preview.linkedTopicRefs, 2);
    assert.equal(preview.canReset, false);
    assert.match(preview.blockReason ?? "", /encore en cours/i);
  });

  it("supprime opportunités puis runs dans une transaction", async () => {
    const calls: string[] = [];
    const client = {
      async $transaction<T>(fn: (tx: {
        opportunitySearchRun: {
          count: (args: { where: { status: string } }) => Promise<number>;
          deleteMany: () => Promise<{ count: number }>;
        };
        seoOpportunity: {
          deleteMany: () => Promise<{ count: number }>;
        };
      }) => Promise<T>) {
        return fn({
          opportunitySearchRun: {
            async count() {
              calls.push("count-running");
              return 0;
            },
            async deleteMany() {
              calls.push("delete-runs");
              return { count: 3 };
            },
          },
          seoOpportunity: {
            async deleteMany() {
              calls.push("delete-opportunities");
              return { count: 11 };
            },
          },
        });
      },
    };

    const result = await resetSeoSearches(client);
    assert.deepEqual(calls, [
      "count-running",
      "delete-opportunities",
      "delete-runs",
    ]);
    assert.equal(result.deletedOpportunities, 11);
    assert.equal(result.deletedSearchRuns, 3);
    assert.equal(result.preserved.topics, true);
    assert.equal(result.preserved.researchConfigs, true);
    assert.equal(result.preserved.customThemes, true);
    assert.equal(result.preserved.wordPressPosts, true);
  });

  it("refuse la suppression transactionnelle si un run est running", async () => {
    const client = {
      async $transaction<T>(fn: (tx: {
        opportunitySearchRun: {
          count: (args: { where: { status: string } }) => Promise<number>;
          deleteMany: () => Promise<{ count: number }>;
        };
        seoOpportunity: {
          deleteMany: () => Promise<{ count: number }>;
        };
      }) => Promise<T>) {
        return fn({
          opportunitySearchRun: {
            async count() {
              return 1;
            },
            async deleteMany() {
              throw new Error("ne doit pas supprimer les runs");
            },
          },
          seoOpportunity: {
            async deleteMany() {
              throw new Error("ne doit pas supprimer les opportunités");
            },
          },
        });
      },
    };

    await assert.rejects(
      () => resetSeoSearches(client),
      /Réinitialisation refusée|encore en cours/i
    );
  });

  it("API reset authentifiée, confirm obligatoire, hors Topic/WP", async () => {
    const route = await readFile(
      "app/api/opportunities/reset/route.ts",
      "utf8"
    );
    const lib = await readFile("lib/seo/reset-searches.ts", "utf8");
    const ui = await readFile(
      "components/opportunities/seo-reset-menu.tsx",
      "utf8"
    );
    const board = await readFile("components/OpportunitiesBoard.tsx", "utf8");
    const schema = await readFile("prisma/schema.prisma", "utf8");

    assert.match(route, /requireAuth/);
    assert.match(route, /confirm === true/);
    assert.match(route, /previewSeoSearchReset/);
    assert.match(route, /resetSeoSearches/);
    assert.match(lib, /\$transaction/);
    assert.match(lib, /seoOpportunity\.deleteMany/);
    assert.match(lib, /opportunitySearchRun\.deleteMany/);
    assert.match(lib, /logInfo/);
    assert.doesNotMatch(lib, /topic\.delete/i);
    assert.doesNotMatch(lib, /researchConfig\.delete/i);
    assert.doesNotMatch(lib, /customTheme\.delete/i);
    assert.doesNotMatch(lib, /wordPressPost\.delete/i);
    assert.doesNotMatch(lib, /articleGeneration\.delete/i);
    assert.match(ui, /AlertDialog/);
    assert.match(ui, /Réinitialiser les recherches SEO/);
    assert.match(ui, /opportunityCount/);
    assert.match(ui, /searchRunCount/);
    assert.match(board, /SeoResetMenu/);

    // Contrats schéma : références souples, pas de cascade Topic
    assert.match(schema, /topicId\s+String\?/);
    assert.match(schema, /searchRunId\s+String\?/);
    assert.doesNotMatch(
      schema,
      /topicId\s+String\?\s*\n\s*topic\s+Topic/
    );
  });

  it("n’altère pas le moteur SEO ni WordPress draft", async () => {
    const lib = await readFile("lib/seo/reset-searches.ts", "utf8");
    const search = await readFile("lib/seo/opportunity-search.ts", "utf8");
    assert.doesNotMatch(lib, /OPENAI_AGENT_ID/);
    assert.doesNotMatch(lib, /create_wordpress_draft/);
    assert.doesNotMatch(lib, /createWordPressDraft/);
    assert.doesNotMatch(search, /resetSeoSearches/);
  });
});
