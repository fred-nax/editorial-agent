import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import {
  ANALYSIS_VERSION,
  assertCampaignLimits,
  estimateCampaignCalls,
  normalizeDomain,
} from "../lib/ai-visibility/constants";
import { validateBrandInput } from "../lib/ai-visibility/brands";
import {
  detectMentionsHeuristically,
  isTargetBrandEntity,
  parseAliasList,
} from "../lib/ai-visibility/entities";
import {
  areCampaignsComparable,
  buildEditorialHints,
  computeCampaignMetrics,
} from "../lib/ai-visibility/metrics";
import {
  buildNeutralQuestionSeeds,
  intentDiversityScore,
} from "../lib/ai-visibility/questions";
import { normalizeCitations } from "../lib/ai-visibility/sources";

const brand = {
  name: "Naxialis",
  primaryDomain: "naxialis.com",
  aliases: ["Naxialis Agency", "Naxialis AI"],
  domainAliases: ["www.naxialis.com", "blog.naxialis.com"],
  knownCompetitors: [
    { name: "Agence Alpha", domain: "agence-alpha.fr" },
    { name: "Beta Labs", domain: "betalabs.io" },
  ],
};

describe("AI Visibility — marques", () => {
  it("crée une marque valide (validation)", () => {
    const result = validateBrandInput({
      name: "Naxialis",
      primaryDomain: "https://www.naxialis.com/path",
      description: "Agence IA",
      sector: "IA / SaaS",
      products: "Agents IA",
      country: "FR",
      language: "fr",
      aliases: "Naxialis Agency, Naxialis AI",
      domainAliases: "blog.naxialis.com",
      knownCompetitors: "Agence Alpha, Beta Labs",
    });
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.value.name, "Naxialis");
    assert.equal(result.value.primaryDomain, "naxialis.com");
    assert.deepEqual(result.value.aliases, [
      "Naxialis Agency",
      "Naxialis AI",
    ]);
    assert.equal(result.value.domainAliases[0], "blog.naxialis.com");
    assert.equal(result.value.knownCompetitors.length, 2);
  });

  it("rejette un domaine invalide", () => {
    const result = validateBrandInput({
      name: "Test",
      primaryDomain: "pas-un-domaine",
    });
    assert.equal(result.ok, false);
  });

  it("normalise les domaines", () => {
    assert.equal(normalizeDomain("HTTPS://WWW.Example.COM/foo"), "example.com");
  });
});

describe("AI Visibility — questions", () => {
  it("génère des graines de questions", () => {
    const questions = buildNeutralQuestionSeeds({
      subject: "Développement d'agents IA pour les PME",
      count: 5,
    });
    assert.equal(questions.length, 5);
    for (const question of questions) {
      assert.ok(!/naxialis/i.test(question.text));
      assert.ok(question.text.length > 10);
    }
  });

  it("diversifie les intentions", () => {
    const questions = buildNeutralQuestionSeeds({
      subject: "agents IA",
      count: 10,
    });
    const score = intentDiversityScore(questions.map((item) => item.intent));
    assert.ok(score >= 4);
  });
});

describe("AI Visibility — détection", () => {
  it("détecte la marque cible et un alias", () => {
    const entities = detectMentionsHeuristically({
      text: "Parmi les acteurs, Naxialis Agency propose des agents métier.",
      brand,
    });
    assert.ok(
      entities.some(
        (entity) =>
          entity.kind === "target_brand" && entity.mentionKind === "mention"
      )
    );
    assert.ok(
      isTargetBrandEntity({ name: "Naxialis Agency", domain: null }, brand)
    );
  });

  it("détecte un concurrent connu", () => {
    const entities = detectMentionsHeuristically({
      text: "Agence Alpha est souvent citée sur ce marché.",
      brand,
    });
    assert.ok(
      entities.some(
        (entity) =>
          entity.kind === "competitor" && entity.name === "Agence Alpha"
      )
    );
  });

  it("distingue mention et recommandation", () => {
    const mention = detectMentionsHeuristically({
      text: "Naxialis apparaît dans le paysage des acteurs IA.",
      brand,
    });
    const reco = detectMentionsHeuristically({
      text: "Nous recommandons Naxialis pour les PME françaises.",
      brand,
    });
    assert.equal(mention[0]?.mentionKind, "mention");
    assert.equal(reco[0]?.mentionKind, "recommendation");
  });

  it("ne traite pas une citation d’URL comme recommandation", () => {
    const entities = detectMentionsHeuristically({
      text: "Voici des ressources utiles.",
      brand,
      citations: [{ url: "https://naxialis.com/blog", domain: "naxialis.com" }],
    });
    assert.ok(
      entities.some((entity) => entity.mentionKind === "citation_only")
    );
    assert.ok(
      !entities.some((entity) => entity.mentionKind === "recommendation")
    );
  });

  it("extrait les citations sans inventer", () => {
    const citations = normalizeCitations([
      { url: "https://exemple.com/a", title: "A" },
      { url: "not-a-url" },
      { url: "https://exemple.com/a" },
      null,
    ]);
    assert.equal(citations.length, 1);
    assert.equal(citations[0]?.domain, "exemple.com");
  });

  it("gère l’absence de sources", () => {
    assert.deepEqual(normalizeCitations(null), []);
    assert.deepEqual(normalizeCitations([]), []);
  });
});

describe("AI Visibility — métriques & campagnes simulées", () => {
  it("calcule les taux sur réponses valides uniquement", () => {
    const metrics = computeCampaignMetrics({
      analysisVersion: ANALYSIS_VERSION,
      brand,
      responses: [
        {
          status: "completed",
          citations: [{ url: "https://naxialis.com", domain: "naxialis.com" }],
          entities: [
            {
              name: "Naxialis",
              domain: "naxialis.com",
              kind: "target_brand",
              category: "target_brand",
              mentionKind: "recommendation",
            },
            {
              name: "Agence Alpha",
              domain: "agence-alpha.fr",
              kind: "competitor",
              category: "direct_competitor",
              mentionKind: "mention",
            },
          ],
        },
        {
          status: "completed",
          citations: [],
          entities: [
            {
              name: "Beta Labs",
              domain: "betalabs.io",
              kind: "competitor",
              category: "direct_competitor",
              mentionKind: "recommendation",
            },
          ],
        },
        {
          status: "failed",
          citations: [],
          entities: [],
        },
      ],
    });

    assert.equal(metrics.validResponses, 2);
    assert.equal(metrics.failedResponses, 1);
    assert.equal(metrics.mentionCount, 1);
    assert.equal(metrics.recommendationCount, 1);
    assert.equal(metrics.mentionRate, 0.5);
    assert.equal(metrics.recommendationRate, 0.5);
    assert.equal(metrics.domainCitationRate, 0.5);
    assert.ok(metrics.competitors.some((item) => item.name === "Agence Alpha"));
    assert.match(metrics.sampleSizeNote, /2 réponse/);
  });

  it("ne considère pas une analyse échouée comme absence de marque", () => {
    const metrics = computeCampaignMetrics({
      analysisVersion: ANALYSIS_VERSION,
      brand,
      responses: [
        { status: "failed", citations: [], entities: [] },
        { status: "failed", citations: [], entities: [] },
      ],
    });
    assert.equal(metrics.mentionRate, null);
    assert.equal(metrics.validResponses, 0);
  });

  it("signale une campagne partielle via les compteurs", () => {
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
    assert.equal(metrics.failedResponses, 1);
    assert.ok(metrics.failedResponses > 0 && metrics.validResponses > 0);
  });

  it("conserve la version d’analyse (historique)", () => {
    const metrics = computeCampaignMetrics({
      analysisVersion: "geo-1.0",
      brand,
      responses: [],
    });
    assert.equal(metrics.analysisVersion, "geo-1.0");
  });

  it("avertit si campagnes non comparables", () => {
    const result = areCampaignsComparable(
      {
        analysisVersion: "geo-1.0",
        model: "gpt-a",
        questionCount: 10,
        repetitions: 1,
        subject: "Agents IA",
      },
      {
        analysisVersion: "geo-1.0",
        model: "gpt-b",
        questionCount: 5,
        repetitions: 2,
        subject: "Autre sujet",
      }
    );
    assert.equal(result.comparable, false);
    assert.ok(result.warnings.length >= 3);
  });

  it("propose des hints éditoriaux sans Topic auto", () => {
    const metrics = computeCampaignMetrics({
      analysisVersion: ANALYSIS_VERSION,
      brand,
      responses: Array.from({ length: 4 }, () => ({
        status: "completed" as const,
        citations: [],
        entities: [
          {
            name: "Agence Alpha",
            domain: "agence-alpha.fr",
            kind: "competitor" as const,
            category: "direct_competitor" as const,
            mentionKind: "mention" as const,
          },
        ],
      })),
    });
    const hints = buildEditorialHints({
      brandName: "Naxialis",
      subject: "coût des agents IA",
      metrics,
      questions: ["Combien coûte un agent IA ?"],
    });
    assert.ok(hints.length > 0);
    assert.ok(hints.some((hint) => /validation manuelle/i.test(hint.rationale)));
    assert.ok(hints.every((hint) => !/pour «/.test(hint.title)));
  });
});

describe("AI Visibility — limites, isolation, auth", () => {
  it("estime et plafonne les appels", () => {
    assert.equal(estimateCampaignCalls(10, 3), 30);
    const ok = assertCampaignLimits({ questionCount: 20, repetitions: 3 });
    assert.equal(ok.ok, true);
    const bad = assertCampaignLimits({ questionCount: 20, repetitions: 4 as 1 });
    assert.equal(bad.ok, false);
  });

  it("parse les alias sans fusion ambiguë", () => {
    assert.deepEqual(parseAliasList("A, B\nC"), ["A", "B", "C"]);
    assert.ok(
      !isTargetBrandEntity({ name: "Agence Alpha", domain: null }, brand)
    );
  });

  it("isole conceptuellement les marques (clés distinctes)", () => {
    const a = validateBrandInput({
      name: "Naxialis",
      primaryDomain: "naxialis.com",
    });
    const b = validateBrandInput({
      name: "Client X",
      primaryDomain: "client-x.fr",
    });
    assert.equal(a.ok && b.ok, true);
    if (a.ok && b.ok) {
      assert.notEqual(a.value.primaryDomain, b.value.primaryDomain);
    }
  });

  it("les routes API GEO exigent requireAuth", () => {
    const files = [
      "app/api/ai-visibility/brands/route.ts",
      "app/api/ai-visibility/brands/[id]/route.ts",
      "app/api/ai-visibility/brands/[id]/campaigns/route.ts",
      "app/api/ai-visibility/brands/delete/route.ts",
      "app/api/ai-visibility/campaigns/[id]/route.ts",
      "app/api/ai-visibility/campaigns/[id]/questions/route.ts",
      "app/api/ai-visibility/campaigns/[id]/run/route.ts",
      "app/api/ai-visibility/campaigns/[id]/reanalyze/route.ts",
      "app/api/ai-visibility/entities/[id]/route.ts",
    ];
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      assert.match(source, /requireAuth/);
    }
  });

  it("n’appelle pas create_wordpress_draft depuis le module GEO", () => {
    const files = [
      "lib/ai-visibility/campaigns.ts",
      "lib/ai-visibility/questions.ts",
      "lib/ai-visibility/analyze.ts",
      "lib/ai-visibility/providers/openai.ts",
      "lib/ai-visibility/metrics.ts",
      "lib/ai-visibility/reanalyze.ts",
      "lib/ai-visibility/classify.ts",
    ];
    for (const file of files) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      assert.doesNotMatch(source, /create_wordpress_draft/);
      assert.doesNotMatch(source, /OPENAI_AGENT_ID/);
      assert.doesNotMatch(source, /runAgentSession/);
    }
  });
});
