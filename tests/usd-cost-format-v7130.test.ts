/**
 * V7.13.0 finalisation — formatage USD + logos CMS sélecteur.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { formatEstimatedCost, formatCost } from "../lib/format";
import { cmsIconSrc } from "../components/workspace/CmsProviderIcon";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("V7.13.0 — formatage coûts USD", () => {
  it("affiche les petits montants avec précision (pas de masque < 0,01)", () => {
    assert.equal(formatEstimatedCost(0.0024), "$0.0024");
    assert.equal(formatEstimatedCost(0.045), "$0.0450");
    assert.equal(formatEstimatedCost(0.1248), "$0.1248");
    assert.equal(formatEstimatedCost(0.17508), "$0.1751");
    assert.equal(formatCost(0.0072), "$0.0072");
  });

  it("utilise 2 décimales au-delà de 1 USD", () => {
    assert.equal(formatEstimatedCost(1.25), "$1.25");
    assert.equal(formatEstimatedCost(12.3456), "$12.35");
  });

  it("distingue coût inconnu, zéro et négatif", () => {
    assert.equal(formatEstimatedCost(null), "Inconnu");
    assert.equal(formatEstimatedCost(undefined), "Inconnu");
    assert.equal(formatEstimatedCost(Number.NaN), "Inconnu");
    assert.equal(formatEstimatedCost(0), "$0.00");
    assert.equal(formatEstimatedCost(-0.045), "-$0.0450");
  });

  it("n’utilise plus le format fr-FR ni le plafond < 0,01 $", () => {
    const source = read("lib/format.ts");
    assert.doesNotMatch(source, /< 0,01 \$/);
    assert.doesNotMatch(source, /minimumFractionDigits:\s*3/);
    assert.match(source, /toFixed\(decimals\)/);
    assert.match(source, /abs < 1 \? 4 : 2/);
  });

  it("dashboard / historique / détail réutilisent formatEstimatedCost", () => {
    assert.match(
      read("app/(protected)/dashboard/page.tsx"),
      /formatEstimatedCost\(llmCostThisMonth/
    );
    assert.match(
      read("app/(protected)/dashboard/page.tsx"),
      /workspaceWhere|scope/
    );
    assert.match(
      read("components/dashboard/recent-generations.tsx"),
      /formatEstimatedCost\(article\.estimatedCost\)/
    );
    assert.match(
      read("components/ArticleHistory.tsx"),
      /formatEstimatedCost\(article\.estimatedCost\)/
    );
    assert.match(
      read("app/(protected)/articles/[id]/page.tsx"),
      /formatEstimatedCost\(article\.estimatedCost\)/
    );
  });
});

describe("V7.13.0 — icônes CMS sélecteur d’espace", () => {
  it("résout les logos fournis dans public/icons/", () => {
    assert.equal(cmsIconSrc("wordpress"), "/icons/wordpress.svg");
    assert.equal(cmsIconSrc("webflow"), "/icons/webflow.svg");
    assert.equal(cmsIconSrc("WordPress"), "/icons/wordpress.svg");
    assert.equal(cmsIconSrc("unknown-cms"), null);
    assert.equal(cmsIconSrc(""), null);
  });

  it("sélecteur et indicateur utilisent CmsProviderIcon (pas Lucide CMS)", () => {
    const selector = read("components/workspace/WorkspaceSelector.tsx");
    assert.match(selector, /CmsProviderIcon/);
    assert.match(selector, /size=\{26\}/);
    assert.match(selector, /size=\{24\}/);
    assert.doesNotMatch(selector, /Globe2|LayoutTemplate/);
    assert.match(selector, /switchWorkspace/);
    assert.match(selector, /Espace éditorial/);

    const indicator = read(
      "components/workspace/ActiveWorkspaceIndicator.tsx"
    );
    assert.match(indicator, /CmsProviderIcon/);
    assert.doesNotMatch(indicator, /Globe2|LayoutTemplate/);

    const icon = read("components/workspace/CmsProviderIcon.tsx");
    assert.match(icon, /\/icons\/wordpress\.svg/);
    assert.match(icon, /\/icons\/webflow\.svg/);
    assert.match(icon, /object-contain/);
    assert.match(icon, /Boxes/);
  });

  it("ne télécharge pas de logos tiers dans le composant", () => {
    const icon = read("components/workspace/CmsProviderIcon.tsx");
    assert.doesNotMatch(icon, /http:\/\/|https:\/\//);
  });
});
