/**
 * Recette isolation DB-003/004 + AI-005/006/007 (migtest).
 * Aucune écriture CMS / OpenAI réelle.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { WORKSPACE_IDS } from "../lib/workspace/constants";
import { recordOpenAiUsageEvent } from "../lib/openai-usage-tracker";
import { sanitizeEditorialHtml } from "../lib/cms/sanitize-editorial-html";
import { reorderThemes } from "../lib/seo/theme-catalog";
import { prismaWatchHistoryStore } from "../lib/veille/history-db";

const PREFIX = "v7161_iso_";

function createDb() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url?.includes("migtest")) {
    throw new Error("DATABASE_URL migtest requis.");
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
}

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("Recette V7.16.1 isolation + CMS sanitize + AI garde-fous", () => {
  const db = createDb();
  const genWp = `${PREFIX}gen_wp`;
  const genWf = `${PREFIX}gen_wf`;
  const themeWp = `${PREFIX}theme_wp`;
  const themeWf = `${PREFIX}theme_wf`;
  const watchWp = `${PREFIX}watch_wp`;
  const watchWf = `${PREFIX}watch_wf`;

  before(async () => {
    process.env.ALLOW_MIGTEST_DATABASE = "1";
    await db.openAiUsageEvent.deleteMany({
      where: { idempotencyKey: { startsWith: PREFIX } },
    });
    await db.editorialWatchSearch.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });
    await db.customTheme.deleteMany({ where: { id: { startsWith: PREFIX } } });
    await db.articleGeneration.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });

    await db.articleGeneration.createMany({
      data: [
        {
          id: genWp,
          workspaceId: WORKSPACE_IDS.wordpress,
          subject: "iso wp",
          status: "completed",
        },
        {
          id: genWf,
          workspaceId: WORKSPACE_IDS.webflow,
          subject: "iso wf",
          status: "completed",
        },
      ],
    });
    await db.customTheme.createMany({
      data: [
        {
          id: themeWp,
          workspaceId: WORKSPACE_IDS.wordpress,
          name: `${PREFIX}WP`,
          active: true,
          sortOrder: 0,
        },
        {
          id: themeWf,
          workspaceId: WORKSPACE_IDS.webflow,
          name: `${PREFIX}WF`,
          active: true,
          sortOrder: 0,
        },
      ],
    });
    await db.editorialWatchSearch.createMany({
      data: [
        {
          id: watchWp,
          workspaceId: WORKSPACE_IDS.wordpress,
          theme: "t",
          periodDays: 7,
          country: "FR",
          articleCount: 0,
          results: [],
        },
        {
          id: watchWf,
          workspaceId: WORKSPACE_IDS.webflow,
          theme: "t",
          periodDays: 7,
          country: "FR",
          articleCount: 0,
          results: [],
        },
      ],
    });
  });

  after(async () => {
    await db.openAiUsageEvent.deleteMany({
      where: { idempotencyKey: { startsWith: PREFIX } },
    });
    await db.editorialWatchSearch.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });
    await db.customTheme.deleteMany({ where: { id: { startsWith: PREFIX } } });
    await db.articleGeneration.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });
    await db.$disconnect();
  });

  it("DB-003 — refuse rattachement usage cross-workspace", async () => {
    const before = await db.openAiUsageEvent.count({
      where: { idempotencyKey: `${PREFIX}cross` },
    });
    const cross = await recordOpenAiUsageEvent({
      workspaceId: WORKSPACE_IDS.wordpress,
      operationType: "article_generation",
      idempotencyKey: `${PREFIX}cross`,
      endpoint: "agents.sessions",
      generationId: genWf,
      completeness: "unknown",
    });
    assert.equal(cross.recorded, false);
    assert.match(String(cross.error), /hors workspace/);
    const after = await db.openAiUsageEvent.count({
      where: { idempotencyKey: `${PREFIX}cross` },
    });
    assert.equal(after, before);
  });

  it("DB-004 — reorderThemes refuse un id d’un autre workspace", async () => {
    await assert.rejects(
      () => reorderThemes([themeWf], WORKSPACE_IDS.wordpress),
      /Thématique inconnue/
    );
    const untouched = await db.customTheme.findFirst({
      where: { id: themeWf },
      select: { sortOrder: true, workspaceId: true },
    });
    assert.equal(untouched?.workspaceId, WORKSPACE_IDS.webflow);
    assert.equal(untouched?.sortOrder, 0);
  });

  it("DB-004 — veille delete scoped ne touche pas l’autre workspace", async () => {
    const store = prismaWatchHistoryStore(WORKSPACE_IDS.wordpress);
    const deleted = await store.delete(watchWf);
    assert.equal(deleted, false);
    const still = await db.editorialWatchSearch.findFirst({
      where: { id: watchWf },
    });
    assert.ok(still);
    const deletedOwn = await store.delete(watchWp);
    assert.equal(deletedOwn, true);
  });

  it("CMS-005 — sanitize neutralise le dangereux et garde l’éditorial", () => {
    const raw = `
      <h2 class="text-2xl font-bold">Titre</h2>
      <p onclick="alert(1)">Para<script>evil()</script></p>
      <table class="w-full"><tr><td class="p-2">A</td></tr></table>
      <details open><summary>FAQ</summary><p>Réponse</p></details>
      <a href="javascript:alert(1)">bad</a>
      <a href="https://naxialis.com/ok" class="underline">ok</a>
      <img src="https://cdn.example.com/a.webp" alt="x" class="rounded" />
      <img src="javascript:alert(1)" alt="bad" />
    `;
    const { html } = sanitizeEditorialHtml(raw);
    assert.doesNotMatch(html, /<script|onclick|javascript:/i);
    assert.match(html, /text-2xl font-bold/);
    assert.match(html, /<table class="w-full">/);
    assert.match(html, /<details/);
    assert.match(html, /href="https:\/\/naxialis.com\/ok"/);
    assert.match(html, /cdn\.example\.com\/a\.webp/);
  });

  it("AI-006/CMS-001 — code refuse recreate + état incertain", () => {
    const src = read("lib/agent/run-session.ts");
    assert.match(src, /idempotent_replay/);
    assert.match(src, /cms_draft_uncertain/);
    assert.match(src, /retry_create_forbidden/);
    assert.match(src, /create_wordpress_draft déjà exécuté/);
    assert.match(src, /create_webflow_draft déjà exécuté/);
  });

  it("AI-005/007 — usage sur échec + draft CMS ≠ failed pur", () => {
    const run = read("lib/agent/run-session.ts");
    const gen = read("lib/generation.ts");
    assert.match(run, /turn_failed[\s\S]*collectSessionUsage/);
    assert.match(run, /turn_cancelled[\s\S]*collectSessionUsage/);
    assert.match(gen, /draftAlreadyCreated \? "completed" : "failed"/);
    assert.match(gen, /hasObservable/);
  });

  it("SEC-002 — instructions auth avant config", () => {
    const src = read("app/api/agent/instructions/route.ts");
    const getFn = src.indexOf("export async function GET");
    const getBody = src.slice(getFn, src.indexOf("export async function POST"));
    assert.ok(getBody.indexOf("if (!session?.user)") < getBody.indexOf("await resolveAgentContext()"));
  });
});
