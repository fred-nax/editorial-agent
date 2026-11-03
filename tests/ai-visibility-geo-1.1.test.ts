import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import { classifyEntity, classifyMentionKind } from "../lib/ai-visibility/classify";
import {
  ANALYSIS_VERSION,
  categoryToLegacyKind,
} from "../lib/ai-visibility/constants";
import {
  detectMentionsHeuristically,
  isTargetBrandEntity,
  reclassifyEntities,
} from "../lib/ai-visibility/entities";
import {
  buildEditorialHints,
  buildNaturalEditorialTitle,
  computeCampaignMetrics,
} from "../lib/ai-visibility/metrics";
import {
  entityNormalizedKey,
  identitiesMatch,
  resolveIdentity,
  resolveParentKey,
} from "../lib/ai-visibility/resolve";

const brand = {
  name: "Naxialis",
  primaryDomain: "naxialis.com",
  aliases: ["Naxialis Agency"],
  domainAliases: ["blog.naxialis.com"],
  knownCompetitors: [{ name: "IA Infinity", domain: "ia-infinity.fr" }],
  products: "Agents IA sur mesure pour PME",
  sector: "IA / services",
};

const subject = "Agents IA sur mesure pour PME";

describe("GEO 1.1 — classification", () => {
  it("1. classe un prestataire réellement concurrent (connu)", () => {
    const result = classifyEntity({
      name: "IA Infinity",
      domain: "ia-infinity.fr",
      excerpt: "L’agence IA Infinity accompagne les PME.",
      brand,
      campaignSubject: subject,
    });
    assert.equal(result.category, "direct_competitor");
    assert.ok(result.confidence >= 0.8);
  });

  it("2. ne classe pas un logiciel comme concurrent direct", () => {
    const result = classifyEntity({
      name: "Slack",
      domain: "slack.com",
      excerpt: "Les équipes utilisent Slack au quotidien.",
      brand,
      campaignSubject: subject,
    });
    assert.equal(result.category, "software_product");
    assert.notEqual(result.category, "direct_competitor");
  });

  it("3. ne classe pas une institution comme concurrent direct", () => {
    const result = classifyEntity({
      name: "Bpifrance",
      domain: "bpifrance.fr",
      excerpt: "Bpifrance publie un guide sur l’IA.",
      brand,
      campaignSubject: subject,
    });
    assert.equal(result.category, "institution");
  });

  it("4. source documentaire sans recommandation", () => {
    const result = classifyEntity({
      name: "Wikipedia",
      domain: "wikipedia.org",
      excerpt: "Selon Wikipedia…",
      mentionKind: "citation_only",
      brand,
      campaignSubject: subject,
    });
    assert.equal(result.category, "information_source");
    const kind = classifyMentionKind({
      excerpt: "Selon Wikipedia…",
      inBody: false,
      citationOnly: true,
    });
    assert.equal(kind, "citation_only");
  });

  it("5. mention positive sans recommandation", () => {
    const kind = classifyMentionKind({
      excerpt: "Naxialis apparaît dans le paysage des acteurs IA.",
      inBody: true,
      citationOnly: false,
    });
    assert.equal(kind, "mention");
  });

  it("6. mention négative", () => {
    const kind = classifyMentionKind({
      excerpt: "Il vaut mieux éviter Naxialis pour ce cas.",
      inBody: true,
      citationOnly: false,
    });
    assert.equal(kind, "negative");
  });

  it("7. recommandation explicite", () => {
    const kind = classifyMentionKind({
      excerpt: "Nous recommandons Naxialis pour les PME françaises.",
      inBody: true,
      citationOnly: false,
    });
    assert.equal(kind, "recommendation");
  });

  it("13. entité inconnue → UNKNOWN", () => {
    const result = classifyEntity({
      name: "Acme Corp XYZ",
      domain: null,
      excerpt: "Acme Corp XYZ est cité une fois.",
      brand,
      campaignSubject: subject,
    });
    assert.equal(result.category, "unknown");
  });
});

describe("GEO 1.1 — normalisation / déduplication", () => {
  it("10. alias Revolve IA / Revolve AI = même identité", () => {
    assert.equal(
      entityNormalizedKey("Revolve IA"),
      entityNormalizedKey("Revolve AI")
    );
    assert.equal(
      identitiesMatch(
        { name: "Revolve IA", domain: null },
        { name: "Revolve AI", domain: null }
      ),
      true
    );
  });

  it("11. produits distincts d’un même éditeur (Microsoft / 365 / Azure)", () => {
    const m365 = resolveIdentity({ name: "Microsoft 365" });
    const azure = resolveIdentity({ name: "Azure" });
    const microsoft = resolveIdentity({ name: "Microsoft" });
    assert.notEqual(m365.normalizedKey, azure.normalizedKey);
    assert.notEqual(m365.normalizedKey, microsoft.normalizedKey);
    assert.equal(resolveParentKey(m365.normalizedKey), "microsoft");
    assert.equal(resolveParentKey(azure.normalizedKey), "microsoft");
    assert.equal(
      identitiesMatch(
        { name: "Microsoft 365" },
        { name: "Azure", domain: "microsoft.com" }
      ),
      false
    );
  });

  it("12. homonymes : similarité lexicale ≠ fusion", () => {
    assert.equal(
      identitiesMatch({ name: "Orange" }, { name: "Orange Business" }),
      false
    );
    assert.equal(
      identitiesMatch({ name: "Meta" }, { name: "Metaverse Labs" }),
      false
    );
  });
});

describe("GEO 1.1 — métriques indépendantes", () => {
  it("8. plusieurs mentions dans une même réponse comptent une fois", () => {
    const metrics = computeCampaignMetrics({
      analysisVersion: ANALYSIS_VERSION,
      brand,
      responses: [
        {
          status: "completed",
          citations: [],
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
          ],
        },
      ],
    });
    const row = metrics.entities.find((item) => item.name === "IA Infinity");
    assert.equal(row?.mentionCount, 1);
  });

  it("9. domaine cité uniquement en source ≠ mention corps", () => {
    const entities = detectMentionsHeuristically({
      text: "Voici des ressources utiles sans nommer la marque.",
      brand,
      citations: [{ url: "https://naxialis.com/blog", domain: "naxialis.com" }],
      campaignSubject: subject,
    });
    assert.ok(
      entities.some((entity) => entity.mentionKind === "citation_only")
    );
    const metrics = computeCampaignMetrics({
      analysisVersion: ANALYSIS_VERSION,
      brand,
      responses: [
        {
          status: "completed",
          citations: [
            { url: "https://naxialis.com/blog", domain: "naxialis.com" },
          ],
          entities,
        },
      ],
    });
    assert.equal(metrics.mentionCount, 0);
    assert.equal(metrics.domainCitationCount, 1);
    assert.equal(metrics.mentionRate, 0);
    assert.equal(metrics.domainCitationRate, 1);
  });

  it("15. recalcul des métriques (reco ≠ mention seule)", () => {
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
        {
          status: "completed",
          citations: [],
          entities: [
            {
              name: "Naxialis",
              domain: "naxialis.com",
              kind: "target_brand",
              category: "target_brand",
              mentionKind: "recommendation",
            },
          ],
        },
        { status: "failed", citations: [], entities: [] },
      ],
    });
    assert.equal(metrics.validResponses, 2);
    assert.equal(metrics.mentionCount, 2);
    assert.equal(metrics.recommendationCount, 1);
    assert.equal(metrics.mentionRate, 1);
    assert.equal(metrics.recommendationRate, 0.5);
  });
});

describe("GEO 1.1 — classification manuelle & réanalyse", () => {
  it("14. classification manuelle persistante (reclassify)", () => {
    const out = reclassifyEntities(
      [
        {
          name: "Gemini",
          mentionKind: "mention",
          excerpt: "Gemini est cité.",
          categoryManual: true,
          lockedCategory: "software_product",
        },
      ],
      brand,
      subject
    );
    assert.equal(out[0]?.category, "software_product");
    assert.match(out[0]?.categoryJustification ?? "", /manuelle/i);
  });

  it("16. réanalyse idempotente (même entrée → mêmes compteurs)", () => {
    const baseEntities = [
      {
        name: "Salesforce",
        domain: "salesforce.com",
        kind: "other" as const,
        category: "software_product" as const,
        mentionKind: "mention" as const,
      },
    ];
    const a = computeCampaignMetrics({
      analysisVersion: ANALYSIS_VERSION,
      brand,
      responses: [{ status: "completed", citations: [], entities: baseEntities }],
    });
    const b = computeCampaignMetrics({
      analysisVersion: ANALYSIS_VERSION,
      brand,
      responses: [{ status: "completed", citations: [], entities: baseEntities }],
    });
    assert.deepEqual(a.entities, b.entities);
    assert.equal(a.mentionCount, b.mentionCount);
  });

  it("17. conservation conceptuelle des réponses brutes (module réanalyse)", () => {
    const source = readFileSync(
      resolve(process.cwd(), "lib/ai-visibility/reanalyze.ts"),
      "utf8"
    );
    assert.match(source, /deleteMany/);
    assert.match(source, /visibilityMention/);
    assert.doesNotMatch(source, /visibilityResponse\.deleteMany/);
    assert.doesNotMatch(source, /responseText:\s*null/);
  });

  it("18. absence de nouvelle recherche web lors d’une réanalyse locale", () => {
    const source = readFileSync(
      resolve(process.cwd(), "lib/ai-visibility/reanalyze.ts"),
      "utf8"
    );
    assert.doesNotMatch(source, /getVisibilityProvider/);
    assert.doesNotMatch(source, /provider\.ask/);
    assert.match(source, /useModel:\s*allowLlm/);
  });
});

describe("GEO 1.1 — opportunités éditoriales", () => {
  it("19. titres éditoriaux correctement construits (pas de dump sujet cassé)", () => {
    const title = buildNaturalEditorialTitle({
      kind: "provider_choice",
      subject: "2 Agents IA sur mesure pour PME",
    });
    assert.doesNotMatch(title, /pour «/);
    assert.doesNotMatch(title, /^Comment choisir un prestataire pour 2 /);
    assert.match(title, /prestataire spécialisé|agence spécialisée/i);
    assert.doesNotMatch(title, /\b2\b/);

    const metrics = computeCampaignMetrics({
      analysisVersion: ANALYSIS_VERSION,
      brand,
      responses: Array.from({ length: 4 }, () => ({
        status: "completed" as const,
        citations: [],
        entities: [
          {
            name: "Slack",
            domain: "slack.com",
            kind: "other" as const,
            category: "software_product" as const,
            mentionKind: "mention" as const,
          },
        ],
      })),
    });
    const hints = buildEditorialHints({
      brandName: "Naxialis",
      subject: "Agents IA sur mesure pour PME",
      metrics,
      questions: ["Comment choisir un prestataire IA ?"],
    });
    assert.ok(hints.length > 0);
    for (const hint of hints) {
      assert.doesNotMatch(hint.title, /pour «/);
      assert.doesNotMatch(hint.title, /vs Slack/i);
    }
  });

  it("ne propose un comparatif nominatif que pour un concurrent direct étayé", () => {
    const metrics = computeCampaignMetrics({
      analysisVersion: ANALYSIS_VERSION,
      brand,
      responses: Array.from({ length: 3 }, () => ({
        status: "completed" as const,
        citations: [],
        entities: [
          {
            name: "IA Infinity",
            domain: "ia-infinity.fr",
            kind: "competitor" as const,
            category: "direct_competitor" as const,
            mentionKind: "mention" as const,
          },
        ],
      })),
    });
    const hints = buildEditorialHints({
      brandName: "Naxialis",
      subject,
      metrics,
      questions: ["Qui choisir ?"],
    });
    assert.ok(
      hints.some((hint) => /IA Infinity/i.test(hint.title) && /différenciation/i.test(hint.title))
    );
  });
});

describe("GEO 1.1 — non-régression", () => {
  it("20. pas de régression campagnes / isolation moteur éditorial", () => {
    assert.equal(ANALYSIS_VERSION, "geo-1.1.4");
    assert.equal(categoryToLegacyKind("direct_competitor"), "competitor");
    assert.equal(categoryToLegacyKind("software_product"), "other");
    assert.ok(
      isTargetBrandEntity(
        { name: "Naxialis", domain: null, category: "target_brand" },
        brand
      )
    );

    const geoFiles = [
      "lib/ai-visibility/campaigns.ts",
      "lib/ai-visibility/reanalyze.ts",
      "lib/ai-visibility/analyze.ts",
      "lib/ai-visibility/metrics.ts",
      "lib/ai-visibility/classify.ts",
      "lib/ai-visibility/entity-store.ts",
    ];
    for (const file of geoFiles) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      assert.doesNotMatch(source, /create_wordpress_draft/);
      assert.doesNotMatch(source, /OPENAI_AGENT_ID/);
      assert.doesNotMatch(source, /runAgentSession/);
    }

    const authFiles = [
      "app/api/ai-visibility/campaigns/[id]/reanalyze/route.ts",
      "app/api/ai-visibility/entities/[id]/route.ts",
    ];
    for (const file of authFiles) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      assert.match(source, /requireAuth/);
    }
  });

  it("ANSSI / Gemini / Salesforce classés hors concurrents directs", () => {
    assert.equal(
      classifyEntity({
        name: "ANSSI",
        excerpt: "L’ANSSI publie des recommandations.",
        brand,
        campaignSubject: subject,
      }).category,
      "institution"
    );
    assert.equal(
      classifyEntity({
        name: "Gemini",
        excerpt: "Gemini peut aider à rédiger.",
        brand,
        campaignSubject: subject,
      }).category,
      "software_product"
    );
    assert.equal(
      classifyEntity({
        name: "Salesforce",
        domain: "salesforce.com",
        excerpt: "Salesforce propose Einstein.",
        brand,
        campaignSubject: subject,
      }).category,
      "software_product"
    );
  });
});
