/**
 * Intégration Prisma migtest — isolation GA4 WordPress / Webflow V7.14.1.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { WORKSPACE_IDS } from "@/lib/workspace";

const PREFIX = `v7141_${Date.now()}_`;
const WP_GA4 = `399634894`;
const WF_GA4 = `7141${String(Date.now()).slice(-6)}`;

function createDb() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) {
    throw new Error("DATABASE_URL requis (migtest).");
  }
  if (!url.includes("v7113_migtest") && !url.includes("migtest")) {
    throw new Error(`Refus hors migtest: ${url.slice(0, 60)}`);
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
}

describe("V7.14.1 — GA4 Prisma isolation (migtest)", () => {
  const db = createDb();
  const ids = {
    pageWp: `${PREFIX}ga4_wp`,
    pageWf: `${PREFIX}ga4_wf`,
    srcWf: `${PREFIX}src_wf`,
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
  });

  after(async () => {
    await db.ga4PageSourceDailyStat.deleteMany({
      where: {
        OR: [
          { id: ids.srcWf },
          { propertyId: { in: [WF_GA4] } },
        ],
      },
    });
    await db.ga4PageDailyStat.deleteMany({
      where: {
        OR: [
          { id: { in: [ids.pageWp, ids.pageWf] } },
          { propertyId: { in: [WF_GA4] } },
        ],
      },
    });
    await db.$disconnect();
  });

  it("Webflow démarre sans propriété GA4 auto-copiée", async () => {
    const sel = await db.googlePropertySelection.findUnique({
      where: { workspaceId: WORKSPACE_IDS.webflow },
    });
    if (sel?.ga4PropertyId) {
      assert.notEqual(sel.ga4PropertyId, WP_GA4);
    }
  });

  it("préserve la sélection GA4 WordPress historique si présente", async () => {
    const sel = await db.googlePropertySelection.findUnique({
      where: { workspaceId: WORKSPACE_IDS.wordpress },
    });
    if (sel?.ga4PropertyId) {
      assert.equal(typeof sel.ga4PropertyId, "string");
      assert.notEqual(sel.ga4PropertyId.trim(), "");
    }
  });

  it("isole les stats GA4 par propriété / workspace", async () => {
    const day = new Date("2026-11-10T00:00:00.000Z");
    await db.ga4PageDailyStat.create({
      data: {
        id: ids.pageWp,
        workspaceId: WORKSPACE_IDS.wordpress,
        propertyId: WP_GA4,
        pagePath: "/a",
        pageUrlNorm: "https://naxialis.com/a",
        date: day,
        sessions: 12,
        totalUsers: 10,
        engagedSessions: 8,
        aiSessions: 1,
        wpPostId: 42,
        cmsExternalId: "42",
      },
    });
    await db.ga4PageDailyStat.create({
      data: {
        id: ids.pageWf,
        workspaceId: WORKSPACE_IDS.webflow,
        propertyId: WF_GA4,
        pagePath: "/b",
        pageUrlNorm: "https://wf.example/b",
        date: day,
        sessions: 4,
        totalUsers: 3,
        engagedSessions: 2,
        aiSessions: 1,
        wpPostId: null,
        cmsExternalId: "item_wf_ga4",
      },
    });
    await db.ga4PageSourceDailyStat.create({
      data: {
        id: ids.srcWf,
        workspaceId: WORKSPACE_IDS.webflow,
        propertyId: WF_GA4,
        pageUrlNorm: "https://wf.example/b",
        date: day,
        sourceKey: "chatgpt",
        sessions: 1,
      },
    });

    const wf = await db.ga4PageDailyStat.findMany({
      where: { workspaceId: WORKSPACE_IDS.webflow, propertyId: WF_GA4 },
    });
    assert.equal(wf.length, 1);
    assert.equal(wf[0]!.cmsExternalId, "item_wf_ga4");
    assert.equal(wf[0]!.wpPostId, null);

    const wp = await db.ga4PageDailyStat.findMany({
      where: { propertyId: WP_GA4, id: ids.pageWp },
    });
    assert.equal(wp[0]!.sessions, 12);

    const ai = await db.ga4PageSourceDailyStat.findMany({
      where: { workspaceId: WORKSPACE_IDS.webflow, sourceKey: "chatgpt" },
    });
    assert.equal(ai.length, 1);
  });
});
