import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import {
  appendTrendHistory,
  assessTrendSignals,
  compareTrendHistory,
  dedupeSourcesByDomain,
} from "../lib/seo/trend-signals";
import { ANALYSIS_VERSION } from "../lib/ai-visibility/constants";

const FIXED_NOW = new Date("2026-10-30T12:00:00.000Z");

describe("SEO 1.3 — Trend Intelligence", () => {
  it("sources récentes et indépendantes → emerging", () => {
    const result = assessTrendSignals({
      title: "Sécuriser un serveur MCP pour agents IA",
      subject: "Sécurité et automatisation via MCP",
      angle: "Contrôles de sécurité MCP pour déploiements agents",
      contentType: "evergreen",
      now: FIXED_NOW,
      sources: [
        {
          title: "Guide sécurité MCP pour agents",
          url: "https://techcrunch.com/mcp-agents",
          date: "2026-09-15",
        },
        {
          title: "MCP : automatiser et sécuriser les déploiements",
          url: "https://frenchweb.fr/mcp-pme",
          date: "2026-08-20",
        },
        {
          title: "Sécurité MCP — contrôles recommandés",
          url: "https://zdnet.com/mcp-security",
          date: "2026-10-01",
        },
      ],
    });
    assert.equal(result.trendType, "emerging");
    assert.ok(result.trendScore >= 50);
    assert.ok(["medium", "high"].includes(result.confidence));
    assert.equal(result.signals.independentDomains, 3);
    assert.match(result.justification, /émergente|émergent/i);
  });

  it("plusieurs URL du même domaine = une seule source indépendante", () => {
    const deduped = dedupeSourcesByDomain([
      {
        title: "Article A",
        url: "https://www.example.com/a",
        date: "2026-10-01",
      },
      {
        title: "Article B",
        url: "https://example.com/b",
        date: "2026-09-01",
      },
      {
        title: "Autre média",
        url: "https://other.io/x",
        date: "2026-09-15",
      },
    ]);
    assert.equal(deduped.length, 2);
    assert.ok(deduped.some((s) => s.domain === "example.com"));
    assert.ok(deduped.some((s) => s.domain === "other.io"));

    const result = assessTrendSignals({
      title: "Sécurité MCP pour agents",
      subject: "Contrôles MCP",
      angle: "Sécurité et contrôles MCP",
      now: FIXED_NOW,
      sources: [
        {
          title: "Sécurité MCP guide opérationnel",
          url: "https://blog.vendor.com/one",
          date: "2026-10-01",
        },
        {
          title: "Contrôles MCP checklist de sécurité",
          url: "https://blog.vendor.com/two",
          date: "2026-09-01",
        },
      ],
    });
    assert.equal(result.signals.independentDomains, 1);
    assert.equal(result.trendType, "unverified");
  });

  it("sources sans date → unverified / confiance faible", () => {
    const result = assessTrendSignals({
      title: "Sujet vague",
      subject: "Sans datation",
      now: FIXED_NOW,
      sources: [
        { title: "Page 1", url: "https://a.com/1", date: null },
        { title: "Page 2", url: "https://b.com/2", date: null },
      ],
    });
    assert.equal(result.trendType, "unverified");
    assert.equal(result.confidence, "low");
    assert.equal(result.signals.datedSources, 0);
  });

  it("actualité ponctuelle avec déclencheur récent", () => {
    const result = assessTrendSignals({
      title: "Annonce faille critique PHP octobre 2026",
      subject: "Patch de sécurité urgent pour WordPress",
      angle: "Faille PHP et patch WordPress à appliquer",
      contentType: "news",
      now: FIXED_NOW,
      sources: [
        {
          title: "Annonce CVE faille critique PHP",
          url: "https://security.example/cve",
          date: "2026-10-20",
        },
        {
          title: "Patch WordPress recommandé après faille PHP",
          url: "https://wpnews.io/php-patch",
          date: "2026-10-22",
        },
      ],
    });
    assert.equal(result.trendType, "news");
    assert.ok(["medium", "high"].includes(result.urgency));
    assert.ok(result.signals.triggerHints.length >= 1);
  });

  it("sujet evergreen : sources étalées dans le temps", () => {
    const result = assessTrendSignals({
      title: "Comment choisir un hébergeur WordPress",
      subject: "Guide comparatif durable hébergement WordPress",
      angle: "Critères pour sélectionner un hébergeur WordPress fiable",
      contentType: "evergreen",
      now: FIXED_NOW,
      sources: [
        {
          title: "Hébergeur WordPress : critères de choix 2024",
          url: "https://hosting-a.com/guide",
          date: "2024-01-10",
        },
        {
          title: "Comparatif hébergeur WordPress 2025",
          url: "https://hosting-b.com/compare",
          date: "2025-06-01",
        },
      ],
    });
    assert.equal(result.trendType, "evergreen");
    assert.equal(result.urgency, "low");
  });

  it("tendance non démontrée si une seule source", () => {
    const result = assessTrendSignals({
      title: "Idée isolée",
      subject: "Peu de preuves",
      now: FIXED_NOW,
      sources: [
        {
          title: "Seul article",
          url: "https://lonely.example/post",
          date: "2026-10-01",
        },
      ],
    });
    assert.equal(result.trendType, "unverified");
    assert.equal(result.confidence, "low");
  });

  it("historique : plus de sources ≠ popularité affirmée", () => {
    const comparison = compareTrendHistory(
      {
        independentDomains: 1,
        trendScore: 20,
        checkedAt: "2026-09-01T00:00:00.000Z",
      },
      {
        independentDomains: 3,
        trendScore: 70,
        checkedAt: "2026-10-30T00:00:00.000Z",
      }
    );
    assert.equal(comparison.sourceCountDelta, 2);
    assert.equal(comparison.scoreDelta, 50);
    assert.match(comparison.interpretation, /ne prouve pas/i);
    assert.doesNotMatch(comparison.interpretation, /popularité réelle confirmée/i);
  });

  it("appendTrendHistory conserve un historique borné", () => {
    const next = appendTrendHistory(
      [
        {
          searchRunId: "a",
          checkedAt: "2026-01-01T00:00:00.000Z",
          trendType: "unverified",
          trendScore: 10,
          confidence: "low",
          independentDomains: 1,
          datedSources: 0,
          recent90: 0,
        },
      ],
      {
        searchRunId: "b",
        checkedAt: "2026-10-30T00:00:00.000Z",
        trendType: "emerging",
        trendScore: 65,
        confidence: "medium",
        independentDomains: 3,
        datedSources: 3,
        recent90: 3,
      }
    );
    assert.equal(next.length, 2);
    assert.equal(next[1]?.searchRunId, "b");
  });

  it("ancienne opportunité sans métadonnées tendance reste affichable (contrat null)", () => {
    const legacy = {
      title: "Ancienne opportunité",
      trendType: null,
      trendScore: null,
      trendJustification: null,
      editorialUrgency: null,
    };
    assert.equal(legacy.trendType, null);
    assert.equal(legacy.trendScore, null);
  });

  it("GET opportunités / UI n’importent pas OpenAI", () => {
    const api = readFileSync(
      resolve(process.cwd(), "app/api/opportunities/route.ts"),
      "utf8"
    );
    const board = readFileSync(
      resolve(process.cwd(), "components/OpportunitiesBoard.tsx"),
      "utf8"
    );
    assert.doesNotMatch(api, /from ["']@\/lib\/openai["']/);
    assert.doesNotMatch(api, /openai\.responses/);
    assert.doesNotMatch(board, /openai/i);
    assert.match(api, /requireAuth/);
  });

  it("aucun effet sur GEO 1.1.3 ni create_wordpress_draft", () => {
    assert.match(ANALYSIS_VERSION, /^geo-1\.1\.\d+$/);
    const search = readFileSync(
      resolve(process.cwd(), "lib/seo/opportunity-search.ts"),
      "utf8"
    );
    assert.doesNotMatch(search, /create_wordpress_draft/);
    assert.doesNotMatch(search, /OPENAI_AGENT_ID/);
    assert.match(search, /assessTrendSignals/);
  });

  it("quotas de recherche toujours définis côté config (pas à l’affichage)", () => {
    const research = readFileSync(
      resolve(process.cwd(), "lib/seo/research-config.ts"),
      "utf8"
    );
    assert.match(research, /requestedCount/);
    const getHandler = readFileSync(
      resolve(process.cwd(), "app/api/opportunities/route.ts"),
      "utf8"
    );
    // Le GET liste uniquement — enqueue uniquement dans POST
    const getBlock = getHandler.slice(
      getHandler.indexOf("export async function GET"),
      getHandler.indexOf("export async function POST")
    );
    assert.doesNotMatch(getBlock, /enqueueOpportunitySearch/);
    assert.doesNotMatch(getBlock, /openai/i);
  });
});
