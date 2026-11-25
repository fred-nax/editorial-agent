import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  getArticleDetailTabs,
  moveArticleDetailTab,
} from "../lib/article-detail-tabs";
import { buildGenerationReport } from "../lib/generation-report";
import { parseHistoryCmsFilter } from "../components/articles/ArticleHistoryFilters";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("V7.10.2 — isolation UX WordPress / Webflow", () => {
  it("Nouvel article : destination imposée par espace + rapprochements conditionnels", () => {
    const page = read("app/(protected)/articles/new/page.tsx");
    assert.doesNotMatch(page, /WordPress uniquement pour/);
    assert.match(page, /déterminés\s*\r?\n\s*côté serveur|déterminés côté serveur/);
    assert.match(page, /espace actif/);

    const form = read("components/ArticleForm.tsx");
    assert.match(
      form,
      /enabled=\{\s*cmsDestination === "wordpress" \|\| cmsDestination === "webflow"\s*\}/
    );
    assert.match(form, /brouillon sera créé dans Webflow/);

    const panel = read("components/EditorialRapprochementPanel.tsx");
    assert.match(panel, /enabled = true/);
    assert.match(panel, /Actualiser l&apos;inventaire/);
    assert.match(panel, /cmsProvider/);
  });

  it("détail : résultat CMS + onglets filtrés Webflow", () => {
    // V7.13.0 : onglet Image réactivé ; performances GSC toujours masquées.
    assert.deepEqual(
      getArticleDetailTabs("webflow").map((tab) => tab.id),
      ["report", "article", "usage", "featured"]
    );
    assert.equal(getArticleDetailTabs("wordpress").length, 5);
    assert.equal(
      moveArticleDetailTab(
        "report",
        "End",
        getArticleDetailTabs("webflow")
      ),
      "featured"
    );

    const report = buildGenerationReport({
      trace: null,
      status: "completed",
      cmsDestination: "webflow",
      cmsExternalId: "item-abc",
      wpStatus: "draft",
      wpPostId: null,
      wpUrl: null,
    });
    assert.equal(report.cms.destination, "webflow");
    assert.equal(report.cms.externalId, "item-abc");
    assert.equal(report.cms.url, null);
    assert.equal(report.wordpress.url, null);
    assert.equal(report.cms.statusAtCreation, "draft");

    const seo = read("components/ArticleSeoPanel.tsx");
    assert.match(seo, /Identifiant CMS Webflow/);
    assert.match(seo, /Aucun lien d’édition fabriqué/);
  });

  it("historique badges CMS (filtre CMS retiré en V7.11.2 — isolé par espace)", () => {
    assert.equal(parseHistoryCmsFilter("webflow"), "webflow");
    assert.equal(parseHistoryCmsFilter("wordpress"), "wordpress");
    assert.equal(parseHistoryCmsFilter(undefined), "all");

    const historyPage = read("app/(protected)/articles/page.tsx");
    assert.doesNotMatch(historyPage, /ArticleHistoryFilters/);
    assert.match(historyPage, /workspaceWhere/);

    const history = read("components/ArticleHistory.tsx");
    assert.match(history, /CmsDestinationBadge/);
    assert.match(history, /Réf\. CMS/);
  });

  it("dashboard isolé par espace (plus d’agrégats WP/Webflow croisés)", () => {
    const dash = read("app/(protected)/dashboard/page.tsx");
    assert.doesNotMatch(dash, /draftsWebflowThisMonth/);
    assert.doesNotMatch(dash, /draftsWordpressThisMonth/);
    assert.match(dash, /workspaceWhere/);
    assert.match(dash, /cmsDestination: true/);

    const recent = read("components/dashboard/recent-generations.tsx");
    assert.match(recent, /CmsDestinationBadge/);
    assert.doesNotMatch(recent, /webflow\.com\/design/);
  });

  it("ne modifie pas le moteur de génération ni les prompts", () => {
    // Garde-fous : cette version UX ne retouche pas run-session / prompt.
    // (Les fichiers peuvent exister ; on vérifie juste l’absence de changement
    // de signature critique via les tests V7.10.1 déjà présents.)
    const prompt = read("lib/agent/prompt.ts");
    assert.match(prompt, /create_webflow_draft/);
    assert.match(prompt, /create_wordpress_draft/);
    const run = read("lib/agent/run-session.ts");
    assert.match(run, /CREATE_WEBFLOW_DRAFT_TOOL_NAME/);
  });
});
