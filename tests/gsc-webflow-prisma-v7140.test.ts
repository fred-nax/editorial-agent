/**
 * Intégration Prisma migtest — isolation GSC WordPress / Webflow V7.14.0.
 * Aucun appel Google réel ; upserts simulés.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { WORKSPACE_IDS } from "@/lib/workspace";

const PREFIX = `v7140_${Date.now()}_`;
const WP_PROPERTY = `sc-domain:wp-v7140-${PREFIX.slice(0, 8)}.test`;
const WF_PROPERTY = `https://wf-v7140-${PREFIX.slice(0, 8)}.test/`;

function createDb() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) {
    throw new Error(
      "DATABASE_URL requis — utiliser naxialis_agent_v7113_migtest uniquement."
    );
  }
  if (!url.includes("v7113_migtest") && !url.includes("migtest")) {
    throw new Error(
      `DATABASE_URL doit pointer vers migtest (reçu: ${url.slice(0, 60)}…)`
    );
  }
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

describe("V7.14.0 — GSC Prisma isolation (migtest)", () => {
  const db = createDb();
  const ids = {
    pageWp: `${PREFIX}page_wp`,
    pageWf: `${PREFIX}page_wf`,
    pageDup: `${PREFIX}page_dup`,
    runWp: `${PREFIX}run_wp`,
    runWf: `${PREFIX}run_wf`,
  };

  before(async () => {
    await db.editorialWorkspace.upsert({
      where: { id: WORKSPACE_IDS.wordpress },
      create: {
        id: WORKSPACE_IDS.wordpress,
        slug: "wordpress-naxialis",
        name: "WordPress",
        cmsProvider: "wordpress",
        enabled: true,
      },
      update: {},
    });
    await db.editorialWorkspace.upsert({
      where: { id: WORKSPACE_IDS.webflow },
      create: {
        id: WORKSPACE_IDS.webflow,
        slug: "webflow-ai-studio-01",
        name: "Webflow",
        cmsProvider: "webflow",
        enabled: true,
      },
      update: {},
    });
    // FK GoogleSyncRun_connectionId — base migtest neuve sans connexion.
    await db.googleConnection.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        accessTokenEncrypted: "test-only-not-a-secret",
        scopes: "https://www.googleapis.com/auth/webmasters.readonly",
        status: "disconnected",
      },
      update: {},
    });
  });

  after(async () => {
    await db.gscPageDailyStat.deleteMany({
      where: {
        OR: [
          { id: { in: [ids.pageWp, ids.pageWf, ids.pageDup] } },
          { propertyUrl: { in: [WP_PROPERTY, WF_PROPERTY] } },
        ],
      },
    });
    await db.gscPropertyDailyStat.deleteMany({
      where: { propertyUrl: { in: [WP_PROPERTY, WF_PROPERTY] } },
    });
    await db.googleSyncRun.deleteMany({
      where: { id: { in: [ids.runWp, ids.runWf] } },
    });
    await db.$disconnect();
  });

  it("Webflow démarre sans propriété GSC auto-copiée depuis WordPress", async () => {
    const sel = await db.googlePropertySelection.findUnique({
      where: { workspaceId: WORKSPACE_IDS.webflow },
    });
    if (sel?.gscPropertyUrl) {
      assert.notEqual(sel.gscPropertyUrl, WP_PROPERTY);
    }
  });

  it("isole les stats page par propriété / workspace", async () => {
    const day = new Date("2026-11-01T00:00:00.000Z");
    await db.gscPageDailyStat.create({
      data: {
        id: ids.pageWp,
        workspaceId: WORKSPACE_IDS.wordpress,
        propertyUrl: WP_PROPERTY,
        pageUrl: "https://wp.example/a",
        pageUrlNorm: "https://wp.example/a",
        date: day,
        clicks: 5,
        impressions: 50,
        ctr: 0.1,
        position: 3,
        hasData: true,
        wpPostId: 101,
        cmsExternalId: "101",
      },
    });
    await db.gscPageDailyStat.create({
      data: {
        id: ids.pageWf,
        workspaceId: WORKSPACE_IDS.webflow,
        propertyUrl: WF_PROPERTY,
        pageUrl: "https://wf.example/b",
        pageUrlNorm: "https://wf.example/b",
        date: day,
        clicks: 2,
        impressions: 40,
        ctr: 0.05,
        position: 7,
        hasData: true,
        wpPostId: null,
        cmsExternalId: "item_wf_1",
      },
    });

    const wpOnly = await db.gscPageDailyStat.findMany({
      where: { propertyUrl: WP_PROPERTY },
    });
    const wfOnly = await db.gscPageDailyStat.findMany({
      where: {
        workspaceId: WORKSPACE_IDS.webflow,
        propertyUrl: WF_PROPERTY,
      },
    });
    assert.equal(wpOnly.length, 1);
    assert.equal(wpOnly[0]!.clicks, 5);
    assert.equal(wfOnly.length, 1);
    assert.equal(wfOnly[0]!.cmsExternalId, "item_wf_1");
    assert.equal(wfOnly[0]!.wpPostId, null);
  });

  it("empêche la collision d’unicité page×propriété×date", async () => {
    const day = new Date("2026-11-02T00:00:00.000Z");
    await db.gscPageDailyStat.create({
      data: {
        id: ids.pageDup,
        workspaceId: WORKSPACE_IDS.webflow,
        propertyUrl: WF_PROPERTY,
        pageUrl: "https://wf.example/c",
        pageUrlNorm: "https://wf.example/c",
        date: day,
        clicks: 1,
        impressions: 10,
        ctr: 0.1,
        position: 5,
        hasData: true,
      },
    });
    await assert.rejects(() =>
      db.gscPageDailyStat.create({
        data: {
          workspaceId: WORKSPACE_IDS.wordpress,
          propertyUrl: WF_PROPERTY,
          pageUrl: "https://wf.example/c",
          pageUrlNorm: "https://wf.example/c",
          date: day,
          clicks: 9,
          impressions: 90,
          ctr: 0.1,
          position: 1,
          hasData: true,
        },
      })
    );
  });

  it("sync runs scopés par workspace ; pas de deleteMany global dans gsc-sync", async () => {
    await db.googleSyncRun.create({
      data: {
        id: ids.runWp,
        workspaceId: WORKSPACE_IDS.wordpress,
        connectionId: "default",
        status: "completed",
        mode: "manual",
        gscUpserted: 10,
        finishedAt: new Date(),
      },
    });
    await db.googleSyncRun.create({
      data: {
        id: ids.runWf,
        workspaceId: WORKSPACE_IDS.webflow,
        connectionId: "default",
        status: "completed",
        mode: "manual",
        gscUpserted: 3,
        finishedAt: new Date(),
      },
    });
    const wfRuns = await db.googleSyncRun.findMany({
      where: { workspaceId: WORKSPACE_IDS.webflow, id: ids.runWf },
    });
    assert.equal(wfRuns.length, 1);
    assert.equal(wfRuns[0]!.gscUpserted, 3);

    const syncSrc = readFileSync("lib/google/gsc-sync.ts", "utf8");
    assert.doesNotMatch(syncSrc, /deleteMany\(\s*\{\s*\}\s*\)/);
    assert.match(syncSrc, /workspaceId/);
  });
});
