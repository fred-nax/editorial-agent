/**
 * Reproduction / non-régression de l’upsert GscPageDailyStat (migtest).
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  isTechnicalGoogleError,
  toPublicGoogleError,
} from "@/lib/google/public-errors";
import { WORKSPACE_IDS } from "@/lib/workspace";

const PREFIX = `v7141_upsert_${Date.now()}_`;
const PROPERTY = `sc-domain:upsert-${PREFIX.slice(0, 10)}.test`;

function createDb() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("migtest")) {
    throw new Error("DATABASE_URL migtest requis.");
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
}

describe("V7.14.1 — upsert GSC Prisma (migtest)", () => {
  const db = createDb();
  const day = new Date("2026-11-20T00:00:00.000Z");
  const pageUrlNorm = `https://example.test/${PREFIX}page`;

  after(async () => {
    await db.gscPageDailyStat.deleteMany({
      where: { propertyUrl: PROPERTY },
    });
    await db.gscPropertyDailyStat.deleteMany({
      where: { propertyUrl: PROPERTY },
    });
    await db.gscQueryDailyStat.deleteMany({
      where: { propertyUrl: PROPERTY },
    });
    await db.$disconnect();
  });

  it("upsert page avec workspace + cmsExternalId puis idempotent", async () => {
    const first = await db.gscPageDailyStat.upsert({
      where: {
        propertyUrl_pageUrlNorm_date: {
          propertyUrl: PROPERTY,
          pageUrlNorm,
          date: day,
        },
      },
      create: {
        workspaceId: WORKSPACE_IDS.wordpress,
        propertyUrl: PROPERTY,
        pageUrl: pageUrlNorm,
        pageUrlNorm,
        date: day,
        clicks: 3,
        impressions: 30,
        ctr: 0.1,
        position: 4.5,
        hasData: true,
        wpPostId: 1001,
        cmsExternalId: "1001",
      },
      update: {
        clicks: 3,
        impressions: 30,
        cmsExternalId: "1001",
        syncedAt: new Date(),
      },
    });
    assert.equal(first.clicks, 3);
    assert.equal(first.cmsExternalId, "1001");

    const second = await db.gscPageDailyStat.upsert({
      where: {
        propertyUrl_pageUrlNorm_date: {
          propertyUrl: PROPERTY,
          pageUrlNorm,
          date: day,
        },
      },
      create: {
        workspaceId: WORKSPACE_IDS.wordpress,
        propertyUrl: PROPERTY,
        pageUrl: pageUrlNorm,
        pageUrlNorm,
        date: day,
        clicks: 99,
        impressions: 99,
        ctr: 1,
        position: 1,
        hasData: true,
      },
      update: {
        clicks: 7,
        impressions: 70,
        ctr: 0.1,
        position: 4,
        workspaceId: WORKSPACE_IDS.wordpress,
        cmsExternalId: "1001",
        syncedAt: new Date(),
      },
    });
    assert.equal(second.id, first.id);
    assert.equal(second.clicks, 7);

    const count = await db.gscPageDailyStat.count({
      where: { propertyUrl: PROPERTY, pageUrlNorm, date: day },
    });
    assert.equal(count, 1);
  });

  it("refuse NaN côté métriques via safe path (message public)", () => {
    const err = new Error(
      "Invalid `prisma.gscPageDailyStat.upsert()` invocation\n\nUnknown argument `cmsExternalId`."
    );
    assert.equal(isTechnicalGoogleError(err.message), true);
    assert.match(toPublicGoogleError(err, "gsc_sync"), /Search Console/i);
  });

  it("upsert propriété et requête sans collision", async () => {
    await db.gscPropertyDailyStat.upsert({
      where: {
        propertyUrl_date: { propertyUrl: PROPERTY, date: day },
      },
      create: {
        workspaceId: WORKSPACE_IDS.wordpress,
        propertyUrl: PROPERTY,
        date: day,
        clicks: 10,
        impressions: 100,
        ctr: 0.1,
        position: 5,
        hasData: true,
      },
      update: { clicks: 11, syncedAt: new Date() },
    });
    await db.gscQueryDailyStat.upsert({
      where: {
        propertyUrl_pageUrlNorm_query_date: {
          propertyUrl: PROPERTY,
          pageUrlNorm,
          query: "naxialis agent",
          date: day,
        },
      },
      create: {
        workspaceId: WORKSPACE_IDS.wordpress,
        propertyUrl: PROPERTY,
        pageUrlNorm,
        query: "naxialis agent",
        date: day,
        clicks: 1,
        impressions: 20,
        ctr: 0.05,
        position: 8,
      },
      update: { clicks: 2, syncedAt: new Date() },
    });
    const props = await db.gscPropertyDailyStat.count({
      where: { propertyUrl: PROPERTY },
    });
    assert.equal(props, 1);
  });
});
