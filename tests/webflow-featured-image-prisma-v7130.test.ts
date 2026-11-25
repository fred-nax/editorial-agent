/**
 * V7.13.0 — Persistance images Webflow sur migtest (client Prisma réel).
 * Aucun appel OpenAI / Webflow distant.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { WORKSPACE_IDS } from "../lib/workspace/constants";

const PREFIX = "v7130_fi_";

function createDb() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL requis — utiliser naxialis_agent_v7113_migtest uniquement."
    );
  }
  if (!url.includes("v7113_migtest") && !url.includes("migtest")) {
    throw new Error(
      `Refus d’écrire hors base de test (URL=${url.replace(/:[^:@/]+@/, ":***@")}).`
    );
  }
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

describe("V7.13.0 — intégration Prisma migtest (featured Webflow)", () => {
  const db = createDb();
  const ids = {
    genWp: `${PREFIX}gen_wp`,
    genWf: `${PREFIX}gen_wf`,
    imgWp: `${PREFIX}img_wp`,
    imgWf: `${PREFIX}img_wf`,
  };

  before(async () => {
    await db.articleFeaturedImage.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });
    await db.articleGeneration.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });

    await db.articleGeneration.create({
      data: {
        id: ids.genWp,
        workspaceId: WORKSPACE_IDS.wordpress,
        subject: "WP featured isolation",
        status: "completed",
        cmsDestination: "wordpress",
        wpPostId: 4242,
        wpStatus: "draft",
      },
    });
    await db.articleGeneration.create({
      data: {
        id: ids.genWf,
        workspaceId: WORKSPACE_IDS.webflow,
        subject: "Webflow featured isolation",
        status: "completed",
        cmsDestination: "webflow",
        cmsExternalId: "item_draft_v7130",
        wpStatus: "draft",
      },
    });

    await db.articleFeaturedImage.create({
      data: {
        id: ids.imgWp,
        workspaceId: WORKSPACE_IDS.wordpress,
        generationId: ids.genWp,
        relativePath: "pending",
        mimeType: "image/webp",
        byteSize: 12,
        prompt: "wp prompt",
        style: "photographic",
        aspectRatio: "3:2",
        size: "1536x1024",
        model: "gpt-image-1",
        status: "ready",
        wpMediaId: 99,
        wpMediaUrl: "https://wp.example/media/99",
      },
    });

    await db.articleFeaturedImage.create({
      data: {
        id: ids.imgWf,
        workspaceId: WORKSPACE_IDS.webflow,
        generationId: ids.genWf,
        relativePath: "pending",
        mimeType: "image/webp",
        byteSize: 34,
        prompt: "wf prompt",
        style: "photographic",
        aspectRatio: "3:2",
        size: "1536x1024",
        model: "gpt-image-1",
        status: "ready",
        webflowAssetId: "asset_resume_1",
        webflowAssetUrl: "https://cdn.example/asset_resume_1.webp",
        cmsTransferStatus: "association_failed",
        error: "Association CMS simulée échouée",
      },
    });
  });

  after(async () => {
    await db.articleFeaturedImage.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });
    await db.articleGeneration.deleteMany({
      where: { id: { startsWith: PREFIX } },
    });
    await db.$disconnect();
  });

  it("isole les colonnes WP et Webflow (pas de détournement wpMedia*)", async () => {
    const wp = await db.articleFeaturedImage.findUniqueOrThrow({
      where: { id: ids.imgWp },
    });
    const wf = await db.articleFeaturedImage.findUniqueOrThrow({
      where: { id: ids.imgWf },
    });

    assert.equal(wp.wpMediaId, 99);
    assert.equal(wp.webflowAssetId, null);
    assert.equal(wp.cmsTransferStatus, null);

    assert.equal(wf.webflowAssetId, "asset_resume_1");
    assert.equal(wf.cmsTransferStatus, "association_failed");
    assert.equal(wf.wpMediaId, null);
    assert.equal(wf.wpMediaUrl, null);
  });

  it("filtre par workspaceId (pas de croisement WordPress / Webflow)", async () => {
    const wfOnly = await db.articleFeaturedImage.findMany({
      where: {
        workspaceId: WORKSPACE_IDS.webflow,
        id: { startsWith: PREFIX },
      },
    });
    assert.equal(wfOnly.length, 1);
    assert.equal(wfOnly[0]!.id, ids.imgWf);

    const crossed = await db.articleFeaturedImage.findFirst({
      where: {
        id: ids.imgWf,
        workspaceId: WORKSPACE_IDS.wordpress,
      },
    });
    assert.equal(crossed, null);
  });

  it("permet la reprise association (asset conservé, statut ready)", async () => {
    const updated = await db.articleFeaturedImage.update({
      where: { id: ids.imgWf },
      data: {
        status: "ready",
        cmsTransferStatus: "file_uploaded",
        error: null,
      },
    });
    assert.equal(updated.webflowAssetId, "asset_resume_1");
    assert.equal(updated.status, "ready");
    assert.equal(updated.cmsTransferStatus, "file_uploaded");
  });

  it("associe au brouillon sans toucher wpMediaId", async () => {
    const associated = await db.articleFeaturedImage.update({
      where: { id: ids.imgWf },
      data: {
        status: "attached",
        cmsTransferStatus: "associated",
        error: null,
      },
    });
    assert.equal(associated.status, "attached");
    assert.equal(associated.cmsTransferStatus, "associated");
    assert.equal(associated.wpMediaId, null);
    assert.equal(associated.webflowAssetId, "asset_resume_1");
  });
});
