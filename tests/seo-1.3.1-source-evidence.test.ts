import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import {
  TREND_ANALYSIS_VERSION,
  assessTrendSignals,
  normalizeSourceDate,
  qualifySourceRelevance,
} from "../lib/seo/trend-signals";

const FIXED_NOW = new Date("2026-10-30T12:00:00.000Z");

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("SEO 1.3.1 — Source Evidence Quality", () => {
  it("1. OWASP sécurité sur sujet ROI → documentaire / hors preuve", () => {
    const result = assessTrendSignals({
      title: "Mesurer le ROI d’un agent IA en PME",
      subject: "Indicateurs, qualité et contrôle humain",
      angle: "Mesurer le ROI et les indicateurs de performance d’un agent",
      now: FIXED_NOW,
      sources: [
        {
          title: "AI Agent Security Cheat Sheet",
          url: "https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html",
          date: null,
        },
        {
          title: "2026 Work Trend Index report: Agents, human agency, and opportunity",
          url: "https://www.microsoft.com/en-us/worklab/work-trend-index/agents",
          date: "2026-05-05",
        },
      ],
    });

    assert.equal(result.analysisVersion, TREND_ANALYSIS_VERSION);
    assert.equal(result.trendType, "unverified");
    assert.equal(result.signals.admissibleSourceCount, 0);
    assert.ok(result.signals.documentarySourceCount + result.signals.excludedSourceCount >= 2);

    const owasp = result.sourceQualifications.find((item) =>
      item.url.includes("owasp")
    );
    assert.ok(owasp);
    assert.notEqual(owasp!.role, "trend_evidence");
    assert.match(owasp!.exclusionReason ?? "", /sécurité|commun|documentation|angle/i);
  });

  it("2. source consacrée au ROI des agents → pertinente pour l’angle", () => {
    const judged = qualifySourceRelevance({
      opportunityTitle: "Mesurer le ROI d’un agent IA en PME",
      opportunitySubject: "Indicateurs de performance",
      opportunityAngle: "ROI et indicateurs pour agents IA en PME",
      sourceTitle: "Mesurer le ROI et les indicateurs des agents en PME",
    });
    assert.equal(judged.relevance, "direct");
    assert.ok(judged.specificOverlap >= 2);

    const result = assessTrendSignals({
      title: "Mesurer le ROI d’un agent IA en PME",
      subject: "Indicateurs de performance",
      angle: "ROI et indicateurs pour agents IA en PME",
      now: FIXED_NOW,
      sources: [
        {
          title: "Mesurer le ROI et les indicateurs des agents en PME",
          url: "https://example.com/ai-agent-roi-kpis",
          date: "2026-09-01",
        },
        {
          title: "Cadre ROI et indicateurs pour agents IA",
          url: "https://other.io/roi-agents-framework",
          date: "2026-08-15",
        },
      ],
    });
    assert.ok(result.signals.admissibleSourceCount >= 2);
    assert.equal(result.signals.recent90, 2);
    assert.ok(["emerging", "news"].includes(result.trendType));
  });

  it("3. source sans date → aucune preuve de récence", () => {
    const result = assessTrendSignals({
      title: "ROI des agents IA",
      subject: "Mesure du retour sur investissement",
      angle: "Cadre ROI et indicateurs agents",
      now: FIXED_NOW,
      sources: [
        {
          title: "AI agent ROI indicators framework",
          url: "https://a.example/roi",
          date: null,
        },
        {
          title: "Measuring agent ROI for operations",
          url: "https://b.example/roi-ops",
          date: null,
        },
      ],
    });
    assert.equal(result.signals.datedSources, 0);
    assert.equal(result.signals.recent90, 0);
    assert.equal(result.trendType, "unverified");
    assert.equal(normalizeSourceDate(null), null);
    assert.equal(normalizeSourceDate("not-a-date"), null);
  });

  it("4. source ancienne pertinente → pas de faux signal émergent", () => {
    const result = assessTrendSignals({
      title: "ROI des agents IA en entreprise",
      subject: "Mesure du retour sur investissement",
      angle: "Indicateurs ROI pour agents IA",
      now: FIXED_NOW,
      sources: [
        {
          title: "Étude indicateurs ROI agents IA 2024",
          url: "https://a.example/old-roi",
          date: "2024-01-15",
        },
        {
          title: "Rapport mesure ROI indicateurs agents",
          url: "https://b.example/old-roi-2",
          date: "2024-06-01",
        },
      ],
    });
    assert.ok(result.signals.admissibleSourceCount >= 2);
    assert.equal(result.signals.recent90, 0);
    assert.notEqual(result.trendType, "emerging");
    assert.notEqual(result.trendType, "news");
  });

  it("5. plusieurs URL d’un même domaine → indépendance non gonflée", () => {
    const result = assessTrendSignals({
      title: "Sécurité MCP agents",
      subject: "Contrôles MCP",
      angle: "Sécurité et contrôles MCP",
      now: FIXED_NOW,
      sources: [
        {
          title: "Sécurité MCP guide opérationnel",
          url: "https://vendor.com/mcp-security-1",
          date: "2026-09-01",
        },
        {
          title: "Contrôles MCP checklist de sécurité",
          url: "https://vendor.com/mcp-security-2",
          date: "2026-09-15",
        },
      ],
    });
    assert.equal(result.signals.independentDomains, 1);
    assert.equal(result.trendType, "unverified");
  });

  it("6. même source pertinente pour deux angles → pas d’exclusion arbitraire", () => {
    const shared = {
      title: "ROI et contrôles de sécurité des agents en opération",
      url: "https://shared.example/agent-roi-security",
      date: "2026-09-10",
    };

    const roi = assessTrendSignals({
      title: "ROI agents IA",
      subject: "Mesure ROI",
      angle: "Indicateurs ROI agents",
      now: FIXED_NOW,
      sources: [shared],
      batchUrlCounts: { [shared.url]: 2 },
    });
    const security = assessTrendSignals({
      title: "Sécurité agents IA",
      subject: "Contrôles de sécurité",
      angle: "Contrôles de sécurité agents",
      now: FIXED_NOW,
      sources: [shared],
      batchUrlCounts: { [shared.url]: 2 },
    });

    // Pertinence jugée par angle — pas d’exclusion automatique pour réutilisation
    const roiQual = roi.sourceQualifications[0];
    const secQual = security.sourceQualifications[0];
    assert.ok(roiQual);
    assert.ok(secQual);
    assert.equal(roiQual!.sharedInBatch, true);
    assert.equal(secQual!.sharedInBatch, true);
    assert.notEqual(roiQual!.role, "excluded");
    assert.equal(secQual!.role, "trend_evidence");
  });

  it("7. researchGoal trends correctement transmis", () => {
    const search = readSource("lib/seo/opportunity-search.ts");
    const api = readSource("app/api/opportunities/route.ts");
    const modal = readSource("components/ResearchConfigModal.tsx");
    assert.match(search, /trendGoalInstructions/);
    assert.match(search, /goal !== "trends"/);
    assert.match(search, /Privilégier des publications récentes/);
    assert.match(api, /researchGoal: config\.researchGoal/);
    assert.match(modal, /researchGoal/);
    assert.match(modal, /RESEARCH_GOALS/);
    assert.match(modal, /trends/);
  });

  it("8. recherche seo conservée", () => {
    const search = readSource("lib/seo/opportunity-search.ts");
    const config = readSource("lib/seo/research-config.ts");
    assert.match(config, /id: "seo"/);
    assert.match(search, /Objectif de recherche : \$\{researchGoalLabel\(goal\)\}/);
    // Pas de forçage trends
    assert.doesNotMatch(search, /researchGoal\s*=\s*"trends"/);
  });

  it("9. unverified sans preuves admissibles", () => {
    const result = assessTrendSignals({
      title: "Sujet sans preuves",
      subject: "Peu d’éléments",
      angle: "Angle isolé sans corroboration",
      now: FIXED_NOW,
      sources: [
        {
          title: "Page générique agents IA pour PME",
          url: "https://generic.example/agents",
          date: "2026-10-01",
        },
      ],
    });
    assert.equal(result.trendType, "unverified");
    assert.equal(result.confidence, "low");
  });

  it("10. anciens enregistrements compatibles", () => {
    const legacy = {
      title: "Ancienne opportunité",
      trendType: null as string | null,
      trendScore: null as number | null,
      trendSignals: null as Record<string, unknown> | null,
    };
    assert.equal(legacy.trendType, null);
    assert.equal(legacy.trendScore, null);
    assert.equal(legacy.trendSignals, null);

    // Nouvelle méthode versionnée — pas de recalcul silencieux à l’affichage
    const board = readSource("components/OpportunitiesBoard.tsx");
    const detail = readSource(
      "components/opportunities/opportunity-detail-panel.tsx"
    );
    assert.match(detail, /Tendance non évaluée \(historique\)/);
    assert.match(detail, /sourceQualifications/);
    assert.match(detail, /Preuves de tendance/);
    assert.match(detail, /Sources documentaires/);
    assert.match(detail, /Sources exclues/);
    assert.match(board, /OpportunityDetailPanel/);
    assert.equal(TREND_ANALYSIS_VERSION, "seo-1.3.1");
  });

  it("11. aucun appel OpenAI à l’affichage", () => {
    const apiGet = readSource("app/api/opportunities/route.ts");
    const board = readSource("components/OpportunitiesBoard.tsx");
    const detail = readSource(
      "components/opportunities/opportunity-detail-panel.tsx"
    );
    assert.doesNotMatch(board, /openai/i);
    assert.doesNotMatch(detail, /openai/i);
    const getBlock = apiGet.slice(
      apiGet.indexOf("export async function GET"),
      apiGet.indexOf("export async function POST")
    );
    assert.doesNotMatch(getBlock, /openai/i);
    assert.doesNotMatch(getBlock, /assessTrendSignals/);
  });

  it("12. aucun changement moteur éditorial / GEO retiré", () => {
    const search = readSource("lib/seo/opportunity-search.ts");
    assert.doesNotMatch(search, /OPENAI_AGENT_ID/);
    assert.doesNotMatch(search, /create_wordpress_draft/);
    assert.doesNotMatch(search, /runAgentSession/);
    assert.doesNotMatch(search, /ai-visibility/);
    assert.match(search, /analysisVersion/);
    assert.equal(existsSync(resolve(process.cwd(), "lib/ai-visibility")), false);
  });

  it("dates : ISO strict, futures rejetées, pas d’invention URL", () => {
    assert.equal(normalizeSourceDate("2026-09-01", FIXED_NOW), "2026-09-01");
    assert.equal(normalizeSourceDate("2027-01-01", FIXED_NOW), null);
    assert.equal(
      normalizeSourceDate("https://example.com/2026/09/01/post", FIXED_NOW),
      null
    );
  });
});
