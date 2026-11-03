import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import { classifyEntity } from "../lib/ai-visibility/classify";
import { ANALYSIS_VERSION } from "../lib/ai-visibility/constants";
import { reclassifyEntities } from "../lib/ai-visibility/entities";
import { computeCampaignMetrics } from "../lib/ai-visibility/metrics";
import {
  entityNormalizedKey,
  identitiesMatch,
} from "../lib/ai-visibility/resolve";

const agencyBrand = {
  name: "Naxialis",
  primaryDomain: "naxialis.com",
  aliases: ["Naxialis Agency"],
  domainAliases: [] as string[],
  knownCompetitors: [{ name: "IA Infinity", domain: "ia-infinity.fr" }],
  products: "Agents IA sur mesure pour PME",
  sector: "IA / services",
};

const bakeryBrand = {
  name: "Boulangerie Dupont",
  primaryDomain: "boulangerie-dupont.fr",
  aliases: [] as string[],
  domainAliases: [] as string[],
  knownCompetitors: [{ name: "Pain & Tradition", domain: null }],
  products: "Pain artisanal et viennoiseries",
  sector: "Boulangerie",
};

const subject = "Agents IA sur mesure pour PME";

describe("GEO 1.1.3 — classification institutions / sources / logiciels", () => {
  it("Bpifrance Le Lab est une institution", () => {
    const result = classifyEntity({
      name: "Bpifrance Le Lab",
      domain: "lelab.bpifrance.fr",
      excerpt: "Selon Bpifrance Le Lab, les PME adoptent l’IA.",
      brand: agencyBrand,
      campaignSubject: subject,
    });
    assert.equal(result.category, "institution");
    assert.notEqual(result.category, "direct_competitor");
  });

  it("CNIL est une institution", () => {
    const result = classifyEntity({
      name: "CNIL",
      domain: "cnil.fr",
      excerpt: "La CNIL rappelle les obligations RGPD.",
      brand: agencyBrand,
      campaignSubject: subject,
    });
    assert.equal(result.category, "institution");
  });

  it("France Num est un dispositif institutionnel", () => {
    const result = classifyEntity({
      name: "France Num",
      domain: "francenum.gouv.fr",
      excerpt: "France Num accompagne la digitalisation des TPE.",
      brand: agencyBrand,
      campaignSubject: subject,
    });
    assert.equal(result.category, "institution");
  });

  it("EUR-Lex est une source documentaire", () => {
    const result = classifyEntity({
      name: "EUR-Lex",
      domain: "eur-lex.europa.eu",
      excerpt: "Le texte est publié sur EUR-Lex.",
      brand: agencyBrand,
      campaignSubject: subject,
    });
    assert.equal(result.category, "information_source");
  });

  it("AI Act Service Desk est une source / service d’information", () => {
    const result = classifyEntity({
      name: "AI Act Service Desk",
      domain: "ai-act-service-desk.ec.europa.eu",
      excerpt: "Consultez l’AI Act Service Desk.",
      brand: agencyBrand,
      campaignSubject: subject,
    });
    assert.equal(result.category, "information_source");
  });

  it("Microsoft 365 / Salesforce / HubSpot sont des logiciels", () => {
    for (const name of ["Microsoft 365", "Salesforce", "HubSpot"]) {
      const result = classifyEntity({
        name,
        excerpt: `${name} est utilisé par les équipes.`,
        brand: agencyBrand,
        campaignSubject: subject,
      });
      assert.equal(result.category, "software_product", name);
    }
  });

  it("Stratinet sans preuve reste unknown", () => {
    const result = classifyEntity({
      name: "Stratinet",
      domain: "stratinet.fr",
      excerpt: "Stratinet apparaît dans une liste d’acteurs.",
      brand: agencyBrand,
      campaignSubject: subject,
    });
    assert.equal(result.category, "unknown");
    assert.notEqual(result.category, "direct_competitor");
  });

  it("véritable agence concurrente déclarée → direct_competitor", () => {
    const result = classifyEntity({
      name: "IA Infinity",
      domain: "ia-infinity.fr",
      excerpt: "L’agence IA Infinity accompagne les PME.",
      brand: agencyBrand,
      campaignSubject: subject,
    });
    assert.equal(result.category, "direct_competitor");
  });

  it("marque cliente hors IA : concurrent déclaré classé, institution non concurrente", () => {
    const competitor = classifyEntity({
      name: "Pain & Tradition",
      excerpt: "Pain & Tradition est une boulangerie voisine.",
      brand: bakeryBrand,
      campaignSubject: "Meilleure boulangerie artisanale à Lyon",
    });
    assert.equal(competitor.category, "direct_competitor");

    const cnil = classifyEntity({
      name: "CNIL",
      excerpt: "La CNIL encadre les données clients.",
      brand: bakeryBrand,
      campaignSubject: "Meilleure boulangerie artisanale à Lyon",
    });
    assert.equal(cnil.category, "institution");
    assert.notEqual(cnil.category, "direct_competitor");
  });

  it("correction manuelle prioritaire", () => {
    const out = reclassifyEntities(
      [
        {
          name: "Stratinet",
          mentionKind: "mention",
          categoryManual: true,
          lockedCategory: "direct_competitor",
        },
      ],
      agencyBrand,
      subject
    );
    assert.equal(out[0]?.category, "direct_competitor");
  });
});

describe("GEO 1.1.3 — identités et métriques", () => {
  it("Revolve AI / Revolve IA = même identité ; UXIA ≠ LUXIA", () => {
    assert.equal(
      entityNormalizedKey("Revolve AI"),
      entityNormalizedKey("Revolve IA")
    );
    assert.equal(
      identitiesMatch({ name: "Revolve AI" }, { name: "Revolve IA" }),
      true
    );
    assert.equal(
      identitiesMatch({ name: "UXIA Agents" }, { name: "LUXIA Agents" }),
      false
    );
    assert.notEqual(
      entityNormalizedKey("IA Infinity"),
      entityNormalizedKey("Infinity")
    );
  });

  it("métriques : 1 réponse = 1 compteur / entité ; reco ≠ citation", () => {
    const metrics = computeCampaignMetrics({
      analysisVersion: ANALYSIS_VERSION,
      brand: agencyBrand,
      responses: [
        {
          status: "completed",
          citations: [{ url: "https://cnil.fr/guide", domain: "cnil.fr" }],
          entities: [
            {
              name: "IA Infinity",
              domain: "ia-infinity.fr",
              kind: "competitor",
              category: "direct_competitor",
              mentionKind: "mention",
            },
            {
              name: "IA Infinity",
              domain: "ia-infinity.fr",
              kind: "competitor",
              category: "direct_competitor",
              mentionKind: "mention",
            },
            {
              name: "CNIL",
              kind: "other",
              category: "institution",
              mentionKind: "citation_only",
            },
          ],
        },
        {
          status: "completed",
          citations: [],
          entities: [
            {
              name: "IA Infinity",
              domain: "ia-infinity.fr",
              kind: "competitor",
              category: "direct_competitor",
              mentionKind: "recommendation",
              excerpt: "Nous recommandons IA Infinity.",
            },
          ],
        },
      ],
    });

    const infinity = metrics.entities.find((e) => /infinity/i.test(e.name));
    assert.ok(infinity);
    assert.equal(infinity!.mentionCount, 2);
    assert.equal(infinity!.recommendationCount, 1);
    assert.equal(infinity!.citationCount, 0);

    const cnil = metrics.entities.find((e) => /cnil/i.test(e.name));
    assert.ok(cnil);
    assert.equal(cnil!.citationCount, 1);
    assert.equal(cnil!.recommendationCount, 0);
    assert.equal(cnil!.category, "institution");

    assert.ok(!metrics.competitors.some((c) => /cnil|bpifrance/i.test(c.name)));
    assert.equal(metrics.validResponses, 2);
    assert.match(metrics.sampleSizeNote, /geo-1\.1\.\d+/);
  });

  it("idempotence classification (même entrée → même catégorie)", () => {
    const input = {
      name: "Bpifrance Le Lab",
      domain: "bpifrance.fr",
      excerpt: "Bpifrance Le Lab publie une étude.",
      brand: agencyBrand,
      campaignSubject: subject,
    };
    assert.deepEqual(classifyEntity(input), classifyEntity(input));
  });

  it("reclassification locale sans appel OpenAI / provider web", () => {
    const source = readFileSync(
      resolve(process.cwd(), "lib/ai-visibility/reanalyze.ts"),
      "utf8"
    );
    assert.doesNotMatch(source, /getVisibilityProvider/);
    assert.doesNotMatch(source, /provider\.ask/);
    assert.doesNotMatch(source, /openai\.responses/);
    assert.match(source, /allowLlm/);
    assert.equal(ANALYSIS_VERSION, "geo-1.1.4");
  });
});
