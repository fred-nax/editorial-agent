import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import { ANALYSIS_VERSION } from "../lib/ai-visibility/constants";
import { deleteVisibilityCampaign } from "../lib/ai-visibility/delete-campaign";
import { db } from "../lib/db";

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("GEO 1.1.5 — suppression campagne + UI", () => {
  it("GEO 1.1.4 inchangé (version d’analyse)", () => {
    assert.equal(ANALYSIS_VERSION, "geo-1.1.4");
    const classify = readSource("lib/ai-visibility/classify.ts");
    const validate = readSource("lib/ai-visibility/validate-entities.ts");
    const analyze = readSource("lib/ai-visibility/analyze.ts");
    const metrics = readSource("lib/ai-visibility/metrics.ts");
    assert.match(classify, /classifyEntity/);
    assert.match(validate, /validateExtractedEntities/);
    assert.match(analyze, /validateExtractedEntities/);
    assert.match(metrics, /brandMentionedInResponseBody|isTargetBrandEntity/);
  });

  it("route DELETE sécurisée (auth + service)", () => {
    const route = readSource("app/api/ai-visibility/campaigns/[id]/route.ts");
    assert.match(route, /export async function DELETE/);
    assert.match(route, /requireAuth/);
    assert.match(route, /deleteVisibilityCampaign/);
    assert.match(route, /Unauthorized/);
  });

  it("service refuse une campagne inexistante", async () => {
    const result = await deleteVisibilityCampaign(
      "camp_inexistante_geo115_" + Date.now()
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 404);
      assert.match(result.error, /introuvable/i);
    }
  });

  it("refuse la suppression d’une campagne en cours", async () => {
    const brand = await db.visibilityBrand.create({
      data: {
        name: `GEO115 Brand ${Date.now()}`,
        primaryDomain: `geo115-${Date.now()}.test`,
        knownCompetitors: [{ name: "Concurrent Partagé" }],
      },
    });

    const campaign = await db.visibilityCampaign.create({
      data: {
        brandId: brand.id,
        subject: "Campagne running",
        country: "FR",
        language: "fr",
        questionCount: 5,
        model: "gpt-test",
        status: "running",
        analysisVersion: "geo-1.1.4",
      },
    });

    try {
      const result = await deleteVisibilityCampaign(campaign.id);
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.status, 409);
        assert.match(result.error, /en cours/i);
      }
      const stillThere = await db.visibilityCampaign.findUnique({
        where: { id: campaign.id },
      });
      assert.ok(stillThere);
    } finally {
      await db.visibilityCampaign.delete({ where: { id: campaign.id } });
      await db.visibilityBrand.delete({ where: { id: brand.id } });
    }
  });

  it("supprime les données liées sans orphelins et préserve marque / entités", async () => {
    const stamp = Date.now();
    const brand = await db.visibilityBrand.create({
      data: {
        name: `GEO115 Keep ${stamp}`,
        primaryDomain: `geo115-keep-${stamp}.test`,
        knownCompetitors: [{ name: "Concurrent Partagé", domain: "partage.test" }],
      },
    });

    const otherCampaign = await db.visibilityCampaign.create({
      data: {
        brandId: brand.id,
        subject: "Autre campagne à conserver",
        country: "FR",
        language: "fr",
        questionCount: 5,
        model: "gpt-test",
        status: "completed",
        analysisVersion: "geo-1.1.4",
      },
    });

    const campaign = await db.visibilityCampaign.create({
      data: {
        brandId: brand.id,
        subject: `À supprimer ${stamp}`,
        country: "FR",
        language: "fr",
        questionCount: 5,
        model: "gpt-test",
        status: "completed",
        analysisVersion: "geo-1.1.4",
        validResponses: 1,
        mentionRate: 0,
      },
    });

    const question = await db.visibilityQuestion.create({
      data: {
        campaignId: campaign.id,
        text: "Qui propose des agents IA ?",
        sortOrder: 0,
        validated: true,
      },
    });

    const response = await db.visibilityResponse.create({
      data: {
        campaignId: campaign.id,
        questionId: question.id,
        provider: "openai",
        model: "gpt-test",
        status: "completed",
        responseText: "Réponse de test sans marque.",
      },
    });

    const sharedEntity = await db.visibilityEntity.create({
      data: {
        brandId: brand.id,
        name: "Concurrent Partagé",
        canonicalName: "Concurrent Partagé",
        category: "direct_competitor",
        categoryManual: true,
        kind: "competitor",
      },
    });

    await db.visibilityMention.create({
      data: {
        responseId: response.id,
        entityId: sharedEntity.id,
        kind: "mention",
        excerpt: "Concurrent Partagé",
        analysisVersion: "geo-1.1.4",
      },
    });

    await db.visibilityCitation.create({
      data: {
        responseId: response.id,
        url: "https://example.test/source",
        title: "Source test",
        domain: "example.test",
      },
    });

    const deleted = await deleteVisibilityCampaign(campaign.id);
    assert.equal(deleted.ok, true);
    if (deleted.ok) {
      assert.equal(deleted.brandId, brand.id);
      assert.match(deleted.subject, /À supprimer/);
    }

    assert.equal(
      await db.visibilityCampaign.findUnique({ where: { id: campaign.id } }),
      null
    );
    assert.equal(
      await db.visibilityQuestion.count({ where: { campaignId: campaign.id } }),
      0
    );
    assert.equal(
      await db.visibilityResponse.count({ where: { campaignId: campaign.id } }),
      0
    );
    assert.equal(
      await db.visibilityMention.count({ where: { responseId: response.id } }),
      0
    );
    assert.equal(
      await db.visibilityCitation.count({ where: { responseId: response.id } }),
      0
    );

    const brandAfter = await db.visibilityBrand.findUnique({
      where: { id: brand.id },
    });
    assert.ok(brandAfter);
    assert.deepEqual(brandAfter!.knownCompetitors, [
      { name: "Concurrent Partagé", domain: "partage.test" },
    ]);

    const entityAfter = await db.visibilityEntity.findUnique({
      where: { id: sharedEntity.id },
    });
    assert.ok(entityAfter);
    assert.equal(entityAfter!.categoryManual, true);

    const otherAfter = await db.visibilityCampaign.findUnique({
      where: { id: otherCampaign.id },
    });
    assert.ok(otherAfter);

    const second = await deleteVisibilityCampaign(campaign.id);
    assert.equal(second.ok, false);
    if (!second.ok) {
      assert.equal(second.status, 404);
    }

    await db.visibilityCampaign.delete({ where: { id: otherCampaign.id } });
    await db.visibilityEntity.delete({ where: { id: sharedEntity.id } });
    await db.visibilityBrand.delete({ where: { id: brand.id } });
  });

  it("UI : confirmation avant delete, annulation sans appel, bilan repliable", () => {
    const ui = readSource("components/AiVisibilityCampaignDetail.tsx");
    assert.match(ui, /window\.confirm/);
    assert.match(ui, /Supprimer définitivement la campagne/);
    assert.match(ui, /irr[eé]versible|définitive/i);
    assert.match(ui, /if \(!confirmed\) \{\s*return;/);
    assert.match(ui, /method:\s*"DELETE"/);
    assert.match(ui, /busy === "delete"/);
    assert.match(ui, /Supprimer la campagne/);
    assert.match(ui, /router\.push\(`\/ai-visibility\/\$\{/);

    assert.match(ui, /<details[\s\S]*Détails techniques de l’analyse/);
    assert.match(ui, /<summary/);
    assert.doesNotMatch(ui, /<details[^>]*\bopen\b/);
    assert.match(ui, /analysisVersion/);
    assert.match(ui, /validResponses/);
    assert.match(ui, /finishedAt/);
    assert.match(ui, /Conservées/);
    assert.match(ui, /Rejetées/);
    assert.match(ui, /Corrections manuelles/);
  });

  it("service de suppression n’appelle pas OpenAI / SEO / éditorial", () => {
    const source = readSource("lib/ai-visibility/delete-campaign.ts");
    assert.doesNotMatch(source, /openai/i);
    assert.doesNotMatch(source, /OPENAI_AGENT_ID/);
    assert.doesNotMatch(source, /opportunity/i);
    assert.doesNotMatch(source, /wordpress/i);
    assert.doesNotMatch(source, /visibilityBrand\.delete/);
    assert.doesNotMatch(source, /visibilityEntity\.delete/);
  });
});
