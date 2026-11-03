import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import { ANALYSIS_VERSION } from "../lib/ai-visibility/constants";
import {
  deleteVisibilityBrand,
  deleteVisibilityBrands,
  MAX_BRAND_IDS_PER_DELETE,
  normalizeBrandIds,
} from "../lib/ai-visibility/delete-brand";
import { db } from "../lib/db";

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

async function createTestBrand(label: string) {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return db.visibilityBrand.create({
    data: {
      name: `GEO116 ${label} ${stamp}`,
      primaryDomain: `geo116-${label}-${stamp}.test`,
      knownCompetitors: [{ name: "Concurrent Isolé" }],
    },
  });
}

describe("GEO 1.1.6 — suppression de marques", () => {
  it("GEO 1.1.4 / SEO / éditorial non touchés", () => {
    assert.equal(ANALYSIS_VERSION, "geo-1.1.4");
    const deleteBrand = readSource("lib/ai-visibility/delete-brand.ts");
    assert.doesNotMatch(deleteBrand, /openai/i);
    assert.doesNotMatch(deleteBrand, /OPENAI_AGENT_ID/);
    assert.doesNotMatch(deleteBrand, /opportunity/i);
    assert.doesNotMatch(deleteBrand, /wordpress/i);
    assert.doesNotMatch(deleteBrand, /create_wordpress_draft/);
    assert.doesNotMatch(deleteBrand, /validateExtractedEntities/);
    assert.doesNotMatch(deleteBrand, /naxialis-test-/);
  });

  it("routes DELETE / bulk sécurisées", () => {
    const single = readSource("app/api/ai-visibility/brands/[id]/route.ts");
    assert.match(single, /export async function DELETE/);
    assert.match(single, /requireAuth/);
    assert.match(single, /session\.user/);
    assert.match(single, /deleteVisibilityBrand/);

    const bulk = readSource("app/api/ai-visibility/brands/delete/route.ts");
    assert.match(bulk, /requireAuth/);
    assert.match(bulk, /session\.user/);
    assert.match(bulk, /deleteVisibilityBrands/);
    assert.match(bulk, /partial/);
  });

  it("normalise ids : dédoublonnage, plafond, refus invalide", () => {
    const ok = normalizeBrandIds(["a", "b", "a", "  c  "]);
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.deepEqual(ok.ids, ["a", "b", "c"]);
    }

    const empty = normalizeBrandIds([]);
    assert.equal(empty.ok, false);

    const tooMany = normalizeBrandIds(
      Array.from({ length: MAX_BRAND_IDS_PER_DELETE + 1 }, (_, i) => `id-${i}`)
    );
    assert.equal(tooMany.ok, false);

    const bad = normalizeBrandIds([1, "x"] as unknown[]);
    assert.equal(bad.ok, false);
  });

  it("supprime une marque sans campagne", async () => {
    const brand = await createTestBrand("empty");
    const result = await deleteVisibilityBrand(brand.id);
    assert.equal(result.ok, true);
    assert.equal(
      await db.visibilityBrand.findUnique({ where: { id: brand.id } }),
      null
    );
  });

  it("supprime une marque avec plusieurs campagnes (atomicité)", async () => {
    const brand = await createTestBrand("multi");
    const keep = await createTestBrand("keep");

    const c1 = await db.visibilityCampaign.create({
      data: {
        brandId: brand.id,
        subject: "Campagne A",
        country: "FR",
        language: "fr",
        questionCount: 5,
        model: "gpt-test",
        status: "completed",
        analysisVersion: "geo-1.1.4",
      },
    });
    const c2 = await db.visibilityCampaign.create({
      data: {
        brandId: brand.id,
        subject: "Campagne B",
        country: "FR",
        language: "fr",
        questionCount: 5,
        model: "gpt-test",
        status: "partial",
        analysisVersion: "geo-1.1.4",
      },
    });
    const q = await db.visibilityQuestion.create({
      data: {
        campaignId: c1.id,
        text: "Question test ?",
        sortOrder: 0,
        validated: true,
      },
    });
    const response = await db.visibilityResponse.create({
      data: {
        campaignId: c1.id,
        questionId: q.id,
        provider: "openai",
        model: "gpt-test",
        status: "completed",
        responseText: "Réponse.",
      },
    });
    const entity = await db.visibilityEntity.create({
      data: {
        brandId: brand.id,
        name: "Entité marque",
        category: "unknown",
        kind: "other",
      },
    });
    await db.visibilityMention.create({
      data: {
        responseId: response.id,
        entityId: entity.id,
        kind: "mention",
        analysisVersion: "geo-1.1.4",
      },
    });
    await db.visibilityCitation.create({
      data: {
        responseId: response.id,
        url: "https://example.test/a",
        domain: "example.test",
      },
    });

    const otherCampaign = await db.visibilityCampaign.create({
      data: {
        brandId: keep.id,
        subject: "À conserver",
        country: "FR",
        language: "fr",
        questionCount: 5,
        model: "gpt-test",
        status: "completed",
      },
    });

    const result = await deleteVisibilityBrand(brand.id);
    assert.equal(result.ok, true);

    assert.equal(await db.visibilityCampaign.findUnique({ where: { id: c1.id } }), null);
    assert.equal(await db.visibilityCampaign.findUnique({ where: { id: c2.id } }), null);
    assert.equal(await db.visibilityQuestion.count({ where: { campaignId: c1.id } }), 0);
    assert.equal(await db.visibilityResponse.count({ where: { campaignId: c1.id } }), 0);
    assert.equal(await db.visibilityMention.count({ where: { responseId: response.id } }), 0);
    assert.equal(await db.visibilityCitation.count({ where: { responseId: response.id } }), 0);
    assert.equal(await db.visibilityEntity.findUnique({ where: { id: entity.id } }), null);

    assert.ok(await db.visibilityBrand.findUnique({ where: { id: keep.id } }));
    assert.ok(
      await db.visibilityCampaign.findUnique({ where: { id: otherCampaign.id } })
    );

    await db.visibilityCampaign.delete({ where: { id: otherCampaign.id } });
    await db.visibilityBrand.delete({ where: { id: keep.id } });
  });

  it("refuse une campagne en cours sans suppression partielle", async () => {
    const brand = await createTestBrand("running");
    const campaign = await db.visibilityCampaign.create({
      data: {
        brandId: brand.id,
        subject: "En cours",
        country: "FR",
        language: "fr",
        questionCount: 5,
        model: "gpt-test",
        status: "running",
      },
    });

    const result = await deleteVisibilityBrand(brand.id);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 409);
    }
    assert.ok(await db.visibilityBrand.findUnique({ where: { id: brand.id } }));
    assert.ok(await db.visibilityCampaign.findUnique({ where: { id: campaign.id } }));

    await db.visibilityCampaign.delete({ where: { id: campaign.id } });
    await db.visibilityBrand.delete({ where: { id: brand.id } });
  });

  it("suppression multiple sélectionnée + ids inexistants / doublons", async () => {
    const a = await createTestBrand("bulk-a");
    const b = await createTestBrand("bulk-b");
    const keep = await createTestBrand("bulk-keep");

    const batch = await deleteVisibilityBrands([
      a.id,
      b.id,
      a.id,
      "missing-geo116-id",
    ]);
    assert.equal(batch.ok, true);
    if (!batch.ok) {
      return;
    }
    assert.equal(batch.result.deleted.length, 2);
    assert.equal(batch.result.failed.length, 1);
    assert.equal(batch.result.failed[0]?.status, 404);
    assert.ok(await db.visibilityBrand.findUnique({ where: { id: keep.id } }));

    const second = await deleteVisibilityBrand(a.id);
    assert.equal(second.ok, false);
    if (!second.ok) {
      assert.equal(second.status, 404);
    }

    await db.visibilityBrand.delete({ where: { id: keep.id } });
  });

  it("UI : confirmation, sélection visible, pas de auto naxialis-test", () => {
    const board = readSource("components/AiVisibilityBoard.tsx");
    assert.match(board, /window\.confirm/);
    assert.match(board, /if \(!confirmed\) \{\s*return;/);
    assert.match(board, /Tout sélectionner \(marques visibles\)/);
    assert.match(board, /Supprimer la sélection/);
    assert.match(board, /selectedIds/);
    assert.match(board, /\/api\/ai-visibility\/brands\/delete/);
    assert.match(board, /method:\s*"DELETE"/);
    assert.doesNotMatch(board, /naxialis-test-/);
    assert.match(board, /Aucune marque/);

    const detail = readSource("components/AiVisibilityBrandDetail.tsx");
    assert.match(detail, /Supprimer la marque/);
    assert.match(detail, /window\.confirm/);
    assert.match(detail, /primaryDomain/);
    assert.match(detail, /campagne\(s\)/);
    assert.match(detail, /router\.push\("\/ai-visibility"\)/);
  });
});
