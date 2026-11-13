import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultDomainQuotas,
  EDITORIAL_DOMAINS,
  resolveDomainQuotas,
  totalQuota,
} from "../lib/seo/domains";
import {
  compareEditorialSimilarity,
  dedupeCandidateBatch,
} from "../lib/seo/editorial-similarity";
import { opportunityFingerprint } from "../lib/seo/fingerprint";
import {
  jaccardSimilarity,
  normalizeText,
  slugify,
  tokenize,
} from "../lib/seo/normalize";
import { scoreToTopicPriority } from "../lib/seo/priority";
import { classifyContentType, scoreOpportunity } from "../lib/seo/scoring";
import { compareTitleSimilarity } from "../lib/seo/similarity";
import {
  extractJsonArray,
  validateOpportunityCandidate,
  validateOpportunityList,
} from "../lib/seo/validate";
import {
  buildWordPressInventoryUrl,
  resolveInventoryPagePlan,
} from "../lib/seo/wordpress-url";

describe("Multithématique / quotas", () => {
  it("defaults to 20 opportunities across 5 domains", () => {
    const quotas = defaultDomainQuotas();
    assert.equal(totalQuota(quotas), 20);
    assert.equal(quotas.ai_agents, 5);
    assert.equal(quotas.wordpress_woo, 4);
    assert.equal(quotas.seo_geo, 4);
    assert.equal(quotas.saas_web, 4);
    assert.equal(quotas.automation_api, 3);
    assert.equal(EDITORIAL_DOMAINS.length, 5);
  });

  it("allows configurable quota overrides", () => {
    const quotas = resolveDomainQuotas({ ai_agents: 2, seo_geo: 6 });
    assert.equal(quotas.ai_agents, 2);
    assert.equal(quotas.seo_geo, 6);
    assert.equal(quotas.wordpress_woo, 4);
  });
});

describe("WordPress inventory URL / pagination", () => {
  it("builds paginated REST URL with view context by default", () => {
    const url = buildWordPressInventoryUrl({
      baseUrl: "https://blog.example.com/",
      page: 2,
      perPage: 100,
    });
    const parsed = new URL(url);
    assert.equal(parsed.pathname, "/wp-json/wp/v2/posts");
    assert.equal(parsed.searchParams.get("page"), "2");
    assert.equal(parsed.searchParams.get("per_page"), "100");
    assert.equal(parsed.searchParams.get("status"), "publish");
    assert.equal(parsed.searchParams.get("context"), "view");
    assert.ok(parsed.searchParams.get("_fields")?.includes("id"));
    assert.equal(parsed.searchParams.get("modified_after"), null);
  });

  it("builds edit context URL for private statuses", () => {
    const url = buildWordPressInventoryUrl({
      baseUrl: "https://blog.example.com",
      page: 1,
      perPage: 100,
      status: "draft",
      context: "edit",
    });
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("status"), "draft");
    assert.equal(parsed.searchParams.get("context"), "edit");
  });

  it("adds modified_after for incremental sync", () => {
    const after = new Date("2026-01-15T12:00:00.000Z");
    const url = buildWordPressInventoryUrl({
      baseUrl: "https://blog.example.com",
      page: 1,
      perPage: 50,
      modifiedAfter: after,
    });
    assert.equal(
      new URL(url).searchParams.get("modified_after"),
      after.toISOString()
    );
  });

  it("detects inconsistent X-WP-Total vs body length", () => {
    const plan = resolveInventoryPagePlan({
      page: 1,
      perPage: 50,
      postsOnPage: 12,
      headerTotal: 80,
      headerTotalPages: 2,
    });
    assert.equal(plan.headerInconsistent, true);
    assert.equal(plan.totalPages, 2);
    assert.equal(plan.shouldContinue, true);
  });

  it("stops when a page is empty even if headers claim more", () => {
    const plan = resolveInventoryPagePlan({
      page: 2,
      perPage: 50,
      postsOnPage: 0,
      headerTotal: 80,
      headerTotalPages: 2,
    });
    assert.equal(plan.shouldContinue, false);
  });
});

describe("Duplicate / diversification", () => {
  it("normalizes accents and punctuation", () => {
    assert.equal(
      normalizeText("Agents IA : automatiser l’entreprise"),
      "agents ia automatiser l entreprise"
    );
    assert.equal(slugify("Agents IA & SaaS"), "agents-ia-saas");
  });

  it("detects identical titles after normalization", () => {
    const match = compareTitleSimilarity(
      "Guide WordPress WooCommerce 2026",
      "guide wordpress woocommerce 2026"
    );
    assert.equal(match.score, 1);
  });

  it("flags same problem with different titles via editorial similarity", () => {
    const match = compareEditorialSimilarity(
      {
        title: "Comment sécuriser un agent IA en production",
        subject: "Contrôles d’accès et audit pour agents autonomes PME",
        angle: "réduire les risques d’actions non autorisées",
        searchIntent: "sécuriser agent ia entreprise",
      },
      {
        title: "Bonnes pratiques de sécurité pour agents autonomes",
        subject: "Audit et permissions des agents IA en entreprise",
        angle: "éviter les actions non autorisées des agents",
        searchIntent: "sécurité agents ia pme",
      }
    );
    assert.ok(match.score >= 0.45, `expected elevated similarity, got ${match.score}`);
  });

  it("dedupes near-identical batch candidates", () => {
    const { kept, dropped } = dedupeCandidateBatch([
      {
        title: "n8n pour connecter ERP et CRM",
        subject: "Automatiser les flux ERP/CRM avec n8n",
        theme: "Automatisation et intégrations API",
        angle: "réduire les ressaisies",
        searchIntent: "intégrer erp crm n8n",
      },
      {
        title: "Connecter ERP et CRM via n8n",
        subject: "Automatiser les flux entre ERP et CRM avec n8n",
        theme: "Automatisation et intégrations API",
        angle: "supprimer les ressaisies manuelles",
        searchIntent: "intégration erp crm n8n",
      },
      {
        title: "Make vs n8n pour workflows documentaires",
        subject: "Choisir un outil d’automatisation documentaire",
        theme: "Automatisation et intégrations API",
        angle: "comparatif pour PME",
        searchIntent: "comparer make n8n",
        contentType: "commercial",
      },
    ]);
    assert.equal(kept.length, 2);
    assert.equal(dropped.length, 1);
  });

  it("scores lexical overlap via Jaccard", () => {
    const a = tokenize("automatisation agents ia pour pme");
    const b = tokenize("agents ia automatisation entreprise pme");
    assert.ok(jaccardSimilarity(a, b) > 0.4);
  });
});

describe("Scoring différencié + content types", () => {
  it("returns differentiated totals for contrasted candidates", () => {
    const commercial = scoreOpportunity(
      {
        title: "Comparer Make et n8n pour automatiser un CRM PME",
        subject:
          "Aide à choisir une plateforme d’automatisation pour réduire les coûts de saisie",
        angle: "ROI et critères de choix pour décideurs",
        searchIntent: "comparer make n8n devis",
        theme: "Automatisation et intégrations API",
        naxialisService: "Automatisation",
        contentType: "commercial",
        sources: [
          {
            title: "Doc n8n",
            url: "https://docs.n8n.io/",
            date: "2026-09-01",
          },
          {
            title: "Make changelog",
            url: "https://www.make.com/en/changelog",
            date: "2026-08-20",
          },
        ],
      },
      { duplicateRisk: "none", similarMaxScore: 0.1, similarPostCount: 0 }
    );

    const thinNews = scoreOpportunity(
      {
        title: "Une nouveauté IA",
        subject: "Brève non sourcée",
        theme: "Intelligence artificielle et agents IA",
        contentType: "news",
        sources: [],
      },
      { duplicateRisk: "high", similarMaxScore: 0.9, similarPostCount: 4 }
    );

    assert.ok(commercial.total > thinNews.total + 15);
    assert.notEqual(commercial.total, thinNews.total);
    assert.ok(commercial.rationale.commercial.includes("commercial"));
  });

  it("classifies editorial content types", () => {
    assert.equal(
      classifyContentType("commercial", {
        title: "x",
        subject: "y",
      }),
      "commercial"
    );
    assert.equal(
      classifyContentType(null, {
        title: "Annonce OpenAI 2026",
        subject: "Actualité produit",
        searchIntent: "actualité",
      }),
      "news"
    );
    assert.equal(
      classifyContentType(null, {
        title: "Guide Next.js App Router pour SaaS B2B",
        subject: "Architecture durable",
      }),
      "evergreen"
    );
  });

  it("maps score to topic priority without auto-generate", () => {
    assert.equal(scoreToTopicPriority(85), 1);
    assert.equal(scoreToTopicPriority(65), 2);
    assert.equal(scoreToTopicPriority(40), 0);
  });
});

describe("IA validation + persistence fingerprint", () => {
  it("rejects incomplete rows", () => {
    assert.equal(validateOpportunityCandidate(null), null);
    assert.equal(validateOpportunityCandidate({ title: "Seul" }), null);
  });

  it("accepts structured candidates with contentType", () => {
    const parsed = validateOpportunityCandidate({
      title: "API et intégrations WooCommerce",
      subject: "Comment connecter un SaaS à WooCommerce via REST",
      theme: "API et intégrations",
      angle: "Cas pratique PME",
      searchIntent: "comment intégrer",
      contentType: "evergreen",
      sources: [
        { title: "Doc WP", url: "https://developer.wordpress.org/rest-api/" },
        { title: "Bad", url: "not-a-url" },
      ],
    });
    assert.ok(parsed);
    assert.equal(parsed?.contentType, "evergreen");
    assert.equal(parsed?.sources?.length, 1);
    assert.equal(
      parsed?.theme,
      "Automatisation et intégrations API"
    );
  });

  it("extracts JSON array from fenced model output", () => {
    const raw = `Voici:\n\`\`\`json\n[{"title":"A","subject":"B","theme":"SEO et GEO","contentType":"news"}]\n\`\`\``;
    const list = validateOpportunityList(extractJsonArray(raw));
    assert.equal(list.length, 1);
    assert.equal(list[0]?.contentType, "news");
  });

  it("produces stable fingerprints for persistence", () => {
    const a = opportunityFingerprint(
      "Guide GEO pour PME",
      "Visibilité dans les moteurs IA"
    );
    const b = opportunityFingerprint(
      "guide geo pour pme!",
      "Visibilité dans les moteurs IA."
    );
    const c = opportunityFingerprint("Autre sujet", "Complètement différent");
    assert.equal(a, b);
    assert.notEqual(a, c);
  });
});

describe("API route auth surface", () => {
  it("documents requireAuth on SEO routes", async () => {
    const fs = await import("node:fs/promises");
    const paths = [
      "app/api/opportunities/route.ts",
      "app/api/opportunities/[id]/route.ts",
      "app/api/opportunities/search/[id]/route.ts",
      "app/api/opportunities/reset/route.ts",
      "app/api/wordpress-inventory/sync/route.ts",
      "app/api/wordpress-inventory/sync/[id]/route.ts",
    ];
    for (const file of paths) {
      const source = await fs.readFile(file, "utf8");
      assert.match(source, /requireAuth/);
      assert.match(source, /Unauthorized/);
    }
  });
});

describe("Queue helpers", () => {
  it("keeps high scores as high topic priority", () => {
    assert.notEqual(scoreToTopicPriority(90), scoreToTopicPriority(10));
  });
});
