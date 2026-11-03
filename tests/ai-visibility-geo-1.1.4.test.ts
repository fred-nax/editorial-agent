import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import { analyzeVisibilityResponse } from "../lib/ai-visibility/analyze";
import {
  enrichExtractedEntity,
  classifyEntity,
} from "../lib/ai-visibility/classify";
import { ANALYSIS_VERSION } from "../lib/ai-visibility/constants";
import { reclassifyEntities } from "../lib/ai-visibility/entities";
import { computeCampaignMetrics } from "../lib/ai-visibility/metrics";
import {
  brandMentionedInResponseBody,
  isAnalysisPromptLeak,
  validateExtractedEntities,
} from "../lib/ai-visibility/validate-entities";

const brand = {
  name: "Naxialis",
  primaryDomain: "naxialis.com",
  aliases: [] as string[],
  domainAliases: [] as string[],
  knownCompetitors: [] as Array<{ name: string; domain?: string | null }>,
  products: "Agents IA",
};

const brandWithCompetitor = {
  ...brand,
  knownCompetitors: [{ name: "IA Infinity", domain: "ia-infinity.fr" }],
};

const bakeryBrand = {
  name: "Boulangerie Dupont",
  primaryDomain: "boulangerie-dupont.fr",
  aliases: [] as string[],
  domainAliases: [] as string[],
  knownCompetitors: [{ name: "Pain & Tradition", domain: null }],
  products: "Pain artisanal",
};

describe("GEO 1.1.4 — autorité locale vs LLM", () => {
  it("1. LLM direct_competitor + knownCompetitors vide → unknown", () => {
    const out = enrichExtractedEntity(
      {
        name: "Tensoria",
        domain: "tensoria.fr",
        mentionKind: "mention",
        excerpt: "Tensoria accompagne les PME.",
        category: "direct_competitor",
      },
      brand,
      "Agents IA"
    );
    assert.equal(out.category, "unknown");
    assert.match(out.categoryJustification ?? "", /rejetée|UNKNOWN|insuffisants/i);
  });

  it("2. concurrent déclaré → direct_competitor autorisé", () => {
    const out = enrichExtractedEntity(
      {
        name: "IA Infinity",
        domain: "ia-infinity.fr",
        mentionKind: "mention",
        excerpt: "L’agence IA Infinity accompagne les PME.",
        category: "direct_competitor",
      },
      brandWithCompetitor,
      "Agents IA"
    );
    assert.equal(out.category, "direct_competitor");
  });

  it("3. correction manuelle prioritaire", () => {
    const out = reclassifyEntities(
      [
        {
          name: "Tensoria",
          mentionKind: "mention",
          categoryManual: true,
          lockedCategory: "direct_competitor",
        },
      ],
      brand,
      "Agents IA"
    );
    assert.equal(out[0]?.category, "direct_competitor");
  });

  it("4. LLM target_brand sans preuve dans le corps → aucune mention", () => {
    const validated = validateExtractedEntities({
      entities: [
        {
          name: "Naxialis",
          kind: "target_brand",
          category: "target_brand",
          mentionKind: "mention",
          excerpt: "Marque cible : Naxialis (naxialis.com).",
          confidence: 1,
        },
      ],
      brand,
      responseText:
        "Un agent IA sur mesure aide les PME sans citer aucune marque particulière.",
      campaignSubject: "Agents IA",
    });
    assert.equal(validated.length, 0);
  });

  it("5. « Marque cible : Naxialis » uniquement prompt → mentionRate 0 %", () => {
    assert.equal(
      isAnalysisPromptLeak("Marque cible : Naxialis (naxialis.com)."),
      true
    );
    const metrics = computeCampaignMetrics({
      analysisVersion: ANALYSIS_VERSION,
      brand,
      responses: [
        {
          status: "completed",
          responseText:
            "Guide général sur les agents IA pour PME industrielles.",
          citations: [],
          entities: [
            {
              name: "Naxialis",
              kind: "target_brand",
              category: "target_brand",
              mentionKind: "mention",
              excerpt: "Marque cible : Naxialis (naxialis.com).",
            },
          ],
        },
      ],
    });
    assert.equal(metrics.mentionRate, 0);
    assert.equal(metrics.mentionCount, 0);
  });

  it("6. Naxialis réellement dans la réponse → mention comptée", () => {
    const text =
      "Parmi les acteurs, Naxialis propose des agents IA sur mesure pour PME.";
    assert.equal(brandMentionedInResponseBody(brand, text), true);
    const validated = validateExtractedEntities({
      entities: [
        {
          name: "Naxialis",
          kind: "other",
          category: "unknown",
          mentionKind: "mention",
          excerpt: "Naxialis propose des agents IA",
        },
      ],
      brand,
      responseText: text,
    });
    assert.ok(validated.some((e) => e.category === "target_brand"));
    const metrics = computeCampaignMetrics({
      analysisVersion: ANALYSIS_VERSION,
      brand,
      responses: [
        {
          status: "completed",
          responseText: text,
          citations: [],
          entities: validated,
        },
      ],
    });
    assert.equal(metrics.mentionCount, 1);
    assert.equal(metrics.mentionRate, 1);
  });

  it("7. marque uniquement dans URL source → aucune mention textuelle", () => {
    const text = "Voir la documentation officielle pour en savoir plus.";
    const validated = validateExtractedEntities({
      entities: [
        {
          name: "Naxialis",
          kind: "target_brand",
          category: "target_brand",
          mentionKind: "citation_only",
          domain: "naxialis.com",
          excerpt: "https://naxialis.com/guide?utm_source=openai",
        },
      ],
      brand,
      responseText: text,
      citations: [
        { url: "https://naxialis.com/guide?utm_source=openai", domain: "naxialis.com" },
      ],
    });
    assert.ok(!validated.some((e) => e.category === "target_brand"));
  });

  it("8. recommandation de marque sans preuve → rejetée", () => {
    const validated = validateExtractedEntities({
      entities: [
        {
          name: "Naxialis",
          kind: "target_brand",
          category: "target_brand",
          mentionKind: "recommendation",
          excerpt: "Marque cible : Naxialis — nous recommandons.",
        },
      ],
      brand,
      responseText: "Aucun prestataire nommé dans cette réponse générique.",
    });
    assert.equal(validated.length, 0);
  });

  it("9. analyse initiale et réanalyse : même validation (contrat source)", () => {
    const analyzeSrc = readFileSync(
      resolve(process.cwd(), "lib/ai-visibility/analyze.ts"),
      "utf8"
    );
    const reanalyzeSrc = readFileSync(
      resolve(process.cwd(), "lib/ai-visibility/reanalyze.ts"),
      "utf8"
    );
    assert.match(analyzeSrc, /validateExtractedEntities/);
    assert.match(reanalyzeSrc, /validateExtractedEntities/);
  });

  it("10. deux validations locales idempotentes", () => {
    const text =
      "Tensoria et Quadia sont cités. Aucune autre marque n’apparaît dans ce paragraphe.";
    const input = {
      entities: [
        {
          name: "Tensoria",
          kind: "other" as const,
          category: "direct_competitor" as const,
          mentionKind: "mention" as const,
          excerpt: "Tensoria et Quadia",
        },
        {
          name: "Naxialis",
          kind: "target_brand" as const,
          category: "target_brand" as const,
          mentionKind: "mention" as const,
          excerpt: "Marque cible : Naxialis",
        },
      ],
      brand,
      responseText: text,
    };
    const a = validateExtractedEntities(input).map((e) => ({
      name: e.name,
      category: e.category,
    }));
    const b = validateExtractedEntities(input).map((e) => ({
      name: e.name,
      category: e.category,
    }));
    assert.deepEqual(a, b);
    assert.ok(!a.some((e) => e.name === "Naxialis"));
    assert.ok(a.some((e) => e.name === "Tensoria" && e.category === "unknown"));
  });

  it("11. pas d’OpenAI à l’affichage / réanalyse locale", () => {
    const reanalyze = readFileSync(
      resolve(process.cwd(), "lib/ai-visibility/reanalyze.ts"),
      "utf8"
    );
    const detail = readFileSync(
      resolve(
        process.cwd(),
        "components/AiVisibilityCampaignDetail.tsx"
      ),
      "utf8"
    );
    assert.doesNotMatch(reanalyze, /getVisibilityProvider/);
    assert.doesNotMatch(detail, /openai\.responses/);
    assert.match(reanalyze, /allowLlm/);
  });

  it("12. autre marque (boulangerie) : mêmes règles", () => {
    const leaked = validateExtractedEntities({
      entities: [
        {
          name: "Boulangerie Dupont",
          kind: "target_brand",
          category: "target_brand",
          mentionKind: "mention",
          excerpt: "Marque cible : Boulangerie Dupont",
        },
        {
          name: "Pain & Tradition",
          kind: "competitor",
          category: "direct_competitor",
          mentionKind: "mention",
          excerpt: "Pain & Tradition est cité.",
        },
      ],
      brand: bakeryBrand,
      responseText:
        "Le quartier apprécie Pain & Tradition pour ses croissants.",
      campaignSubject: "Boulangerie artisanale Lyon",
    });
    assert.ok(!leaked.some((e) => /dupont/i.test(e.name)));
    assert.ok(
      leaked.some(
        (e) => /pain/i.test(e.name) && e.category === "direct_competitor"
      )
    );

    const classified = classifyEntity({
      name: "Fake Bakery",
      excerpt: "Fake Bakery fait du pain.",
      brand: bakeryBrand,
      campaignSubject: "Boulangerie",
    });
    assert.notEqual(classified.category, "direct_competitor");
  });

  it("heuristique locale useModel=false applique la validation", async () => {
    const entities = await analyzeVisibilityResponse({
      text: "Aucun rapport avec la marque analysée.",
      citations: [],
      brand,
      campaignSubject: "Agents IA",
      useModel: false,
    });
    assert.ok(!entities.some((e) => e.category === "target_brand"));
  });

  it("version geo-1.1.4", () => {
    assert.equal(ANALYSIS_VERSION, "geo-1.1.4");
  });
});
