import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import { classifyEntity, classifyMentionKind } from "../lib/ai-visibility/classify";
import { ANALYSIS_VERSION } from "../lib/ai-visibility/constants";
import {
  detectMentionsHeuristically,
  reclassifyEntities,
} from "../lib/ai-visibility/entities";
import {
  extractEntityCandidates,
  isGenericDescriptor,
  verifyNameInResponse,
} from "../lib/ai-visibility/extract";
import {
  buildEditorialHints,
  buildNaturalEditorialTitle,
  computeCampaignMetrics,
} from "../lib/ai-visibility/metrics";

const brand = {
  name: "Naxialis",
  primaryDomain: "naxialis.com",
  aliases: ["Naxialis Agency"],
  domainAliases: ["blog.naxialis.com"],
  knownCompetitors: [] as Array<{ name: string; domain?: string | null }>,
  products: "Agents IA sur mesure pour PME",
};

const subject = "Agents IA sur mesure pour PME";

const sampleAnswer = `
Pour choisir un prestataire, plusieurs acteurs sont cités : IA Infinity,
Tensoria, GENIAL, LUXIA Agents, Quadia et Revolve IA.
Un agent IA ou une agence IA générique ne suffit pas : il faut un expert IA
et parfois un assistant IA. Slack et Bpifrance sont aussi mentionnés.
Nous recommandons Tensoria pour les PME industrielles.
Sources utiles : https://exemple.com/guide
`;

describe("GEO 1.1.1 — faux positifs génériques", () => {
  it("1. « Agent IA » n’est pas une marque", () => {
    assert.equal(isGenericDescriptor("Agent IA"), true);
    assert.equal(isGenericDescriptor("Agents IA"), true);
    const extracted = extractEntityCandidates({
      text: "Un Agent IA peut automatiser des tâches.",
      brand,
      campaignSubject: subject,
    });
    assert.ok(!extracted.entities.some((e) => /agent ia/i.test(e.name)));
    assert.ok(extracted.rejected.some((r) => /agent ia/i.test(r.name)));
  });

  it("2. « Agence IA » sans preuve n’est pas un concurrent direct", () => {
    assert.equal(isGenericDescriptor("Agence IA"), true);
    const classified = classifyEntity({
      name: "Agence IA",
      excerpt: "Une Agence IA propose des services.",
      brand,
      campaignSubject: subject,
    });
    assert.notEqual(classified.category, "direct_competitor");
    const extracted = extractEntityCandidates({
      text: "Choisissez une Agence IA compétente.",
      brand,
      campaignSubject: subject,
    });
    assert.ok(
      !extracted.entities.some(
        (e) =>
          isGenericDescriptor(e.name) && e.category === "direct_competitor"
      )
    );
  });
});

describe("GEO 1.1.1 — conservation des entreprises vérifiées", () => {
  it("3–4. IA Infinity et Tensoria conservées si présentes", () => {
    const extracted = extractEntityCandidates({
      text: sampleAnswer,
      brand,
      campaignSubject: subject,
      historicalNames: [
        { name: "IA Infinity", mentionKind: "mention" },
        { name: "Tensoria", mentionKind: "recommendation", excerpt: "Nous recommandons Tensoria" },
      ],
    });
    const names = extracted.entities.map((e) => e.name);
    assert.ok(names.some((n) => /infinity/i.test(n)));
    assert.ok(names.some((n) => /tensoria/i.test(n)));
  });

  it("5. prestataire inconnu reste une entité valide (unknown ok)", () => {
    const extracted = extractEntityCandidates({
      text: "Parmi les acteurs, Quadia accompagne les PME françaises.",
      brand,
      campaignSubject: subject,
    });
    const quadia = extracted.entities.find((e) => /quadia/i.test(e.name));
    assert.ok(quadia);
    assert.notEqual(quadia?.category, "direct_competitor");
  });

  it("6–7. institution et logiciel hors concurrent direct", () => {
    assert.equal(
      classifyEntity({
        name: "Bpifrance",
        excerpt: "Bpifrance publie un guide.",
        brand,
        campaignSubject: subject,
      }).category,
      "institution"
    );
    assert.equal(
      classifyEntity({
        name: "Slack",
        excerpt: "Les équipes utilisent Slack.",
        brand,
        campaignSubject: subject,
      }).category,
      "software_product"
    );
  });
});

describe("GEO 1.1.1 — observations et métriques", () => {
  it("8. citation seule ≠ mention corps", () => {
    const entities = detectMentionsHeuristically({
      text: "Ressources utiles sans nommer la marque.",
      brand,
      citations: [{ url: "https://naxialis.com/a", domain: "naxialis.com" }],
      campaignSubject: subject,
    });
    const metrics = computeCampaignMetrics({
      analysisVersion: ANALYSIS_VERSION,
      brand,
      responses: [
        {
          status: "completed",
          citations: [{ url: "https://naxialis.com/a", domain: "naxialis.com" }],
          entities,
        },
      ],
    });
    assert.equal(metrics.mentionCount, 0);
    assert.equal(metrics.domainCitationCount, 1);
  });

  it("9. recommandation explicite comptabilisée", () => {
    assert.equal(
      classifyMentionKind({
        excerpt: "Nous recommandons Tensoria pour les PME.",
        inBody: true,
        citationOnly: false,
      }),
      "recommendation"
    );
  });

  it("10. entité historique sans preuve non restaurée", () => {
    const extracted = extractEntityCandidates({
      text: "Aucun nom d’entreprise ici.",
      brand,
      campaignSubject: subject,
      historicalNames: [{ name: "IA Infinity", mentionKind: "mention" }],
    });
    assert.ok(
      extracted.rejected.some(
        (r) => /infinity/i.test(r.name) && /non vérifiable/i.test(r.reason)
      )
    );
    assert.ok(!extracted.entities.some((e) => /infinity/i.test(e.name)));
  });

  it("11. correction manuelle prioritaire", () => {
    const out = reclassifyEntities(
      [
        {
          name: "Gemini",
          mentionKind: "mention",
          categoryManual: true,
          lockedCategory: "software_product",
        },
      ],
      brand,
      subject
    );
    assert.equal(out[0]?.category, "software_product");
  });

  it("12. réanalyse répétée idempotente (mêmes compteurs)", () => {
    const entities = extractEntityCandidates({
      text: sampleAnswer,
      brand,
      campaignSubject: subject,
      historicalNames: [
        { name: "Revolve IA" },
        { name: "GENIAL" },
        { name: "LUXIA Agents" },
      ],
    }).entities;
    const a = computeCampaignMetrics({
      analysisVersion: ANALYSIS_VERSION,
      brand,
      responses: [{ status: "completed", citations: [], entities }],
    });
    const b = computeCampaignMetrics({
      analysisVersion: ANALYSIS_VERSION,
      brand,
      responses: [{ status: "completed", citations: [], entities }],
    });
    assert.deepEqual(a.entities, b.entities);
  });

  it("13–14. réponses brutes intactes + pas de web search", () => {
    const source = readFileSync(
      resolve(process.cwd(), "lib/ai-visibility/reanalyze.ts"),
      "utf8"
    );
    assert.doesNotMatch(source, /visibilityResponse\.deleteMany/);
    assert.doesNotMatch(source, /getVisibilityProvider/);
    assert.doesNotMatch(source, /provider\.ask/);
    assert.match(source, /observationSnapshot/);
    assert.match(source, /geo-1\.1\.1|ANALYSIS_VERSION/);
  });

  it("15. titres éditoriaux grammaticalement corrects", () => {
    const cost = buildNaturalEditorialTitle({
      kind: "cost",
      subject: "Agents IA sur mesure pour PME",
    });
    assert.equal(cost, "Combien coûte un agent IA sur mesure pour une PME ?");
    assert.doesNotMatch(cost, /un Agents/i);
    assert.doesNotMatch(cost, /pour une PME pour une PME/i);

    const provider = buildNaturalEditorialTitle({
      kind: "provider_choice",
      subject: "Agents IA sur mesure pour PME",
    });
    assert.match(provider, /prestataire spécialisé/i);

    const hints = buildEditorialHints({
      brandName: "Naxialis",
      subject,
      metrics: computeCampaignMetrics({
        analysisVersion: ANALYSIS_VERSION,
        brand,
        responses: Array.from({ length: 4 }, () => ({
          status: "completed" as const,
          citations: [],
          entities: [],
        })),
      }),
      questions: ["Comment choisir ?"],
    });
    for (const hint of hints) {
      assert.doesNotMatch(hint.title, /un Agents/i);
      assert.doesNotMatch(hint.title, /pour une PME pour une PME/i);
    }
  });

  it("16. dénominateurs = réponses completed uniquement", () => {
    const metrics = computeCampaignMetrics({
      analysisVersion: ANALYSIS_VERSION,
      brand,
      responses: [
        {
          status: "completed",
          citations: [],
          entities: [
            {
              name: "Naxialis",
              domain: "naxialis.com",
              kind: "target_brand",
              category: "target_brand",
              mentionKind: "mention",
            },
          ],
        },
        { status: "failed", citations: [], entities: [] },
      ],
    });
    assert.equal(metrics.validResponses, 1);
    assert.equal(metrics.mentionRate, 1);
  });

  it("cas sans données historiques disponibles", () => {
    const plain = "aucune occurrence identifiable dans ce paragraphe.";
    const check = verifyNameInResponse({
      name: "IA Infinity",
      text: plain,
    });
    assert.equal(check.present, false);
    const extracted = extractEntityCandidates({
      text: plain,
      brand,
      campaignSubject: subject,
      historicalNames: [],
    });
    assert.equal(
      extracted.entities.filter((e) => e.category !== "target_brand").length,
      0
    );
  });

  it("version d’analyse courante", () => {
    assert.equal(ANALYSIS_VERSION, "geo-1.1.4");
  });
});
