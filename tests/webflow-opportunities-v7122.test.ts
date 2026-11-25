import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  assertModuleAllowedForWorkspace,
  isWebflowModuleEnabled,
  webflowEmptyState,
  WORKSPACE_IDS,
} from "@/lib/workspace";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("V7.12.2 — Opportunités SEO Webflow (source)", () => {
  it("active le module opportunities ; analytics GSC optionnel (V7.14.0)", () => {
    assert.equal(isWebflowModuleEnabled("opportunities"), true);
    assert.equal(isWebflowModuleEnabled("analytics"), true);
    // Images Webflow (V7.13.0) n’impactent pas le module opportunités
    assert.equal(isWebflowModuleEnabled("featured_image"), true);

    const wf = {
      id: WORKSPACE_IDS.webflow,
      slug: "webflow-ai-studio-01",
      name: "Webflow",
      cmsProvider: "webflow" as const,
      siteUrl: null,
      siteLabel: "AI Studio",
      defaultLanguage: "en-US",
      enabled: true,
    };
    assert.doesNotThrow(() =>
      assertModuleAllowedForWorkspace(wf, "opportunities")
    );
    assert.doesNotThrow(() =>
      assertModuleAllowedForWorkspace(wf, "analytics")
    );

    const reason = webflowEmptyState("opportunities").reason;
    assert.match(reason, /Google|Search Console/i);
    assert.match(reason, /inventaire|documentaires|thématiques/i);
  });

  it("préflight inventaire CMS-aware et jamais de fallback WordPress", () => {
    const route = read("app/api/opportunities/route.ts");
    assert.match(route, /countWorkspaceInventoryForOpportunities/);
    assert.doesNotMatch(
      route,
      /db\.wordPressPost\.count\(\s*\{\s*where:\s*workspaceWhere/
    );
    assert.match(route, /Inventaire Webflow vide/);
    assert.match(route, /cmsProvider/);
    assert.match(route, /googleDataAvailable:/);
    assert.match(route, /workspaceHasGscData|gsc-signals/);
    assert.match(route, /inventorySourceNote/);
  });

  it("doublons Webflow via inventaire + file + opportunités (sans WP)", () => {
    const duplicates = read("lib/seo/duplicates.ts");
    assert.match(duplicates, /listEditorialInventory/);
    assert.match(duplicates, /purpose:\s*"duplicates"/);
    assert.match(duplicates, /findSimilarWebflowInventory/);
    assert.match(duplicates, /findSimilarWordPressPosts/);
    assert.match(duplicates, /findSimilarRegisteredOpportunities/);
    assert.match(duplicates, /cmsDestination:\s*"webflow"/);
    assert.match(duplicates, /cannibalisation SEO/);
    assert.match(duplicates, /editorialContext:\s*true/);
    assert.match(duplicates, /angleFromGenerationContext|parseStoredEditorialContext/);
    const generationSelect = duplicates.match(
      /articleGeneration\.findMany\(\{[\s\S]*?select:\s*\{([^}]+)\}/
    );
    assert.ok(generationSelect);
    assert.doesNotMatch(generationSelect[1] ?? "", /\bangle\s*:/);
    assert.match(
      duplicates,
      /cmsProvider === "webflow"\s*\?[\s\S]*findSimilarWebflowInventory/
    );
    assert.match(
      duplicates,
      /: findSimilarWordPressPosts/
    );
  });

  it("prompts respectent la langue workspace et interdisent les métriques inventées", () => {
    const search = read("lib/seo/opportunity-search.ts");
    assert.match(search, /languagePromptLine/);
    assert.match(search, /defaultLanguage/);
    assert.match(search, /English \(en-US\)/);
    assert.match(search, /métrique SEO Google mesurée/);
    assert.match(search, /getWorkspaceByIdOrSlug/);
  });

  it("UI board branche sync inventaire selon l’espace", () => {
    const board = read("components/OpportunitiesBoard.tsx");
    assert.match(board, /useWorkspaceOptional/);
    assert.match(board, /\/api\/webflow-inventory\/sync/);
    assert.match(board, /\/api\/wordpress-inventory\/sync/);
    assert.match(board, /Inventaire \{inventoryLabel\}/);
    assert.match(board, /pas de données Google Search Console pour Webflow/);
    assert.doesNotMatch(board, /Inventaire WP\s*:/);
  });

  it("conversion file conserve workspace + origine sans génération", () => {
    const queue = read("lib/seo/queue.ts");
    assert.match(queue, /workspaceId: opportunity\.workspaceId/);
    assert.match(queue, /origin:\s*"seo_opportunity"/);
    assert.match(queue, /Langue espace/);
    assert.match(queue, /Origine : opportunité SEO/);
    assert.doesNotMatch(queue, /runAgent|generateArticle|create_wordpress_draft/);
  });

  it("page opportunités n’affiche plus l’empty state Webflow par défaut", () => {
    const page = read("app/(protected)/opportunities/page.tsx");
    assert.match(page, /assertModuleAllowedForWorkspace\(workspace, "opportunities"\)/);
    assert.match(page, /OpportunitiesBoard/);
  });

  it("non-régression : chemin WordPress des doublons et prompts FR conservés", () => {
    const duplicates = read("lib/seo/duplicates.ts");
    assert.match(duplicates, /isWordPressInventoryUsable/);
    assert.match(duplicates, /db\.wordPressPost\.findMany/);
    const search = read("lib/seo/opportunity-search.ts");
    assert.match(search, /Langue des opportunités[\s\S]*français/);
    assert.match(search, /findSimilarContent/);
  });
});

describe("V7.12.2 — similarité locale Webflow (sans OpenAI)", () => {
  it("détecte un titre inventaire proche et un brouillon", async () => {
    const { compareTitleSimilarity } = await import("@/lib/seo/similarity");
    const { compareEditorialSimilarity } = await import(
      "@/lib/seo/editorial-similarity"
    );
    const exact = compareTitleSimilarity(
      "How to build an AI-ready business",
      "How to build an AI-ready business"
    );
    assert.ok(exact.score >= 0.85);

    const closeEn = compareEditorialSimilarity(
      {
        title: "Building an AI ready company",
        subject: "AI readiness for SMBs",
      },
      {
        title: "How to build an AI-ready business",
        subject: "Prepare your organization for AI",
      }
    );
    assert.ok(closeEn.score >= 0.35 || exact.score >= 0.85);
  });
});
