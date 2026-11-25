import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { displayField } from "../components/ArticleSeoPanel";
import { displayMetric } from "../components/GenerationUsage";
import {
  ARTICLE_DETAIL_TABS,
  getArticleDetailTabs,
  moveArticleDetailTab,
} from "../lib/article-detail-tabs";
import {
  UNRECORDED_TRACE_MESSAGE,
  buildGenerationReport,
} from "../lib/generation-report";

function source(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

describe("historique détail UX", () => {
  it("propose les cinq onglets et ouvre le rapport", () => {
    assert.deepEqual(
      ARTICLE_DETAIL_TABS.map((tab) => tab.label),
      [
        "Rapport de génération",
        "Article & SEO",
        "Consommation OpenAI",
        "Image à la une",
        "Performances SEO",
      ]
    );
    assert.equal(ARTICLE_DETAIL_TABS[0].id, "report");
    assert.equal(ARTICLE_DETAIL_TABS[3].id, "featured");
    assert.equal(ARTICLE_DETAIL_TABS[4].id, "performances");
    const tabs = source("components/ArticleDetailTabs.tsx");
    assert.match(tabs, /useState<ArticleDetailTabId>\(resolvedInitial\)/);
    assert.match(tabs, /initialTab = "report"/);
    assert.match(tabs, /getArticleDetailTabs/);
    assert.match(tabs, /role="tablist"/);
    assert.match(tabs, /overflow-x-auto/);
    assert.match(tabs, /from "lucide-react"/);
    assert.match(tabs, /\bImage\b/);
    assert.match(tabs, /featured/);
    assert.match(tabs, /performances/);
    assert.doesNotMatch(tabs, /fetch\(|openai|wordpress/i);
    const page = source("app/(protected)/articles/[id]/page.tsx");
    assert.match(page, /featured=\{/);
    assert.match(page, /FeaturedImagePanel/);
    assert.match(page, /performances=\{/);
    assert.match(page, /ArticlePerformancesPanel/);
    assert.doesNotMatch(
      page,
      /EditorialContextPanel[\s\S]*FeaturedImagePanel[\s\S]*ArticleDetailTabs/
    );
  });

  it("change d'onglet au clavier sans appel réseau", () => {
    assert.equal(moveArticleDetailTab("report", "ArrowRight"), "article");
    assert.equal(moveArticleDetailTab("article", "ArrowRight"), "usage");
    assert.equal(moveArticleDetailTab("usage", "ArrowRight"), "featured");
    assert.equal(moveArticleDetailTab("featured", "ArrowRight"), "performances");
    assert.equal(moveArticleDetailTab("performances", "ArrowRight"), "report");
    assert.equal(moveArticleDetailTab("report", "ArrowLeft"), "performances");
    assert.equal(moveArticleDetailTab("usage", "Home"), "report");
    assert.equal(moveArticleDetailTab("report", "End"), "performances");
    assert.equal(moveArticleDetailTab("article", "Tab"), "article");
  });

  it("réactive performances GSC Webflow ; conserve Image à la une (V7.14.0)", () => {
    const webflowTabs = getArticleDetailTabs("webflow");
    assert.deepEqual(
      webflowTabs.map((tab) => tab.id),
      ["report", "article", "usage", "featured", "performances"]
    );
    assert.equal(
      moveArticleDetailTab("performances", "ArrowRight", webflowTabs),
      "report"
    );
    const page = source("app/(protected)/articles/[id]/page.tsx");
    assert.match(page, /getArticleDetailTabs/);
    assert.match(page, /cmsDestination=\{cmsDestination\}/);
    assert.match(page, /cmsDestination === "webflow"/);
    assert.match(page, /FeaturedImagePanel/);
    assert.match(page, /ArticlePerformancesPanel/);
  });

  it("affiche le rapport lorsqu'une trace existe", () => {
    const report = buildGenerationReport({
      trace: {
        version: 1,
        context: {
          origin: "veille",
          subject: "Sujet de veille",
          veilleContextTransmitted: true,
          angle: "Un angle",
          notes: null,
          sourceUrl: "https://exemple.fr/source",
          sourceTitle: "Publication",
          sourceName: "Média",
          sourcePublishedOn: null,
          sourceKind: "news",
        },
        webSearch: { observed: true, queries: ["requête observée"], truncated: false },
        pages: { items: [], truncated: false },
        ids: { sessionId: "sess_ui", webSearchCallIds: [] },
      },
      status: "completed",
      wpPostId: 12,
      wpUrl: "https://naxialis.com/?p=12",
      wpStatus: "draft",
    });
    assert.equal(report.recorded, true);
    assert.equal(report.queries.length, 1);
    assert.equal(report.pages.length, 0);
    assert.equal(report.wordpress.statusAtCreation, "draft");
    assert.equal(report.cms.destination, "wordpress");
    const view = source("components/GenerationReport.tsx");
    assert.match(view, /Contexte éditorial/);
    assert.match(view, /Recherches effectuées/);
    assert.match(view, /Pages consultées/);
    assert.match(view, /Résultat WordPress/);
    assert.match(view, /Résultat Webflow/);
    assert.match(view, /report\.disclaimer/);
    assert.match(view, /break-all/);
    assert.match(view, /Aucun lien d’édition fabriqué/);
  });

  it("laisse un état vide explicite sans traces", () => {
    const report = buildGenerationReport({
      trace: null,
      status: "completed",
      wpPostId: 4,
      wpUrl: null,
      wpStatus: null,
    });
    assert.equal(report.unrecordedMessage, UNRECORDED_TRACE_MESSAGE);
    assert.equal(report.queriesNote, null);
    assert.equal(report.pagesNote, null);
    const view = source("components/GenerationReport.tsx");
    assert.match(view, /report\.unrecordedMessage/);
  });

  it("couvre une génération terminée, une génération échouée et les champs vides", () => {
    const page = source("app/(protected)/articles/[id]/page.tsx");
    assert.match(page, /ArticleStatus/);
    assert.match(page, /status === "failed"/);
    assert.match(page, /toPublicGenerationError/);
    assert.match(page, /trace=\{article\.trace\}/);
    assert.match(page, /wpStatus=\{article\.wpStatus\}/);
    assert.equal(displayField(null), "—");
    assert.equal(displayField(""), "—");
    assert.equal(displayField("extrait présent"), "extrait présent");
    assert.equal(displayMetric(null), "—");
    assert.equal(displayMetric("$0.1494"), "$0.1494");
  });

  it("présente le coût, les tokens et la copie de session", () => {
    const usage = source("components/GenerationUsage.tsx");
    const copy = source("components/CopySessionId.tsx");
    assert.match(usage, /Coût LLM estimé/);
    assert.match(usage, /Tokens d'entrée/);
    assert.match(usage, /Tokens en cache/);
    assert.match(usage, /Tokens de sortie/);
    assert.match(usage, /Tokens de raisonnement/);
    assert.match(usage, /Tokens totaux/);
    assert.match(usage, /Modèle/);
    assert.match(usage, /Durée de génération/);
    assert.match(usage, /Estimation LLM|Coût LLM inconnu/);
    assert.match(usage, /grid-cols-2/);
    assert.match(copy, /navigator\.clipboard\.writeText/);
    assert.doesNotMatch(`${usage}\n${copy}`, /fetch\(|openai|createWordPressDraft/);
  });
});
