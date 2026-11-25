import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import { join, resolve } from "node:path";

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") {
      continue;
    }
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

describe("retrait du module AI Visibility Monitor", () => {
  it("la navigation ne contient plus Visibilité IA", () => {
    const nav = readSource("components/navigation.ts");
    const sidebar = readSource("components/Sidebar.tsx");
    const header = readSource("components/Header.tsx");
    const hrefs = [...nav.matchAll(/href:\s*"([^"]+)"/g)].map(
      (match) => match[1]
    );
    assert.deepEqual(hrefs, [
      "/dashboard",
      "/articles/new",
      "/articles",
      "/topics",
      "/inventory",
      "/analytics",
      "/opportunities",
      "/veille",
      "/settings",
      "/settings/integrations",
    ]);
    assert.doesNotMatch(nav, /Visibilité IA/);
    assert.doesNotMatch(nav, /ai-visibility/);
    assert.doesNotMatch(sidebar, /Visibilité IA/);
    assert.doesNotMatch(sidebar, /ai-visibility/);
    assert.doesNotMatch(header, /ai-visibility/);
    assert.doesNotMatch(header, /Visibilité IA/);
  });

  it("les pages et routes GEO n’existent plus", () => {
    const removed = [
      "app/(protected)/ai-visibility/page.tsx",
      "app/(protected)/ai-visibility/[brandId]/page.tsx",
      "app/(protected)/ai-visibility/[brandId]/campaigns/[campaignId]/page.tsx",
      "app/api/ai-visibility/brands/route.ts",
      "app/api/ai-visibility/brands/[id]/route.ts",
      "app/api/ai-visibility/brands/[id]/campaigns/route.ts",
      "app/api/ai-visibility/brands/delete/route.ts",
      "app/api/ai-visibility/campaigns/[id]/route.ts",
      "app/api/ai-visibility/campaigns/[id]/questions/route.ts",
      "app/api/ai-visibility/campaigns/[id]/run/route.ts",
      "app/api/ai-visibility/campaigns/[id]/reanalyze/route.ts",
      "app/api/ai-visibility/entities/[id]/route.ts",
      "lib/ai-visibility/campaigns.ts",
      "components/AiVisibilityBoard.tsx",
    ];
    for (const path of removed) {
      assert.equal(existsSync(resolve(process.cwd(), path)), false, path);
    }
  });

  it("les routes éditoriales et SEO sont toujours présentes", () => {
    const kept = [
      "app/(protected)/dashboard/page.tsx",
      "app/(protected)/articles/new/page.tsx",
      "app/(protected)/articles/page.tsx",
      "app/(protected)/topics/page.tsx",
      "app/(protected)/opportunities/page.tsx",
      "app/(protected)/settings/page.tsx",
      "app/api/topics/route.ts",
      "app/api/topics/[id]/route.ts",
      "app/api/opportunities/route.ts",
      "app/api/opportunities/[id]/route.ts",
      "app/api/opportunities/search/[id]/route.ts",
      "app/api/generate/route.ts",
      "app/api/wordpress-inventory/sync/route.ts",
    ];
    for (const path of kept) {
      assert.equal(existsSync(resolve(process.cwd(), path)), true, path);
    }
  });

  it("les brouillons WordPress restent en status draft", () => {
    const wordpress = readSource("lib/wordpress.ts");
    const tools = readSource("lib/agent/tools.ts");
    const prompt = readSource("lib/agent/prompt.ts");
    assert.match(wordpress, /status:\s*"draft"/);
    assert.match(tools, /create_wordpress_draft/);
    assert.match(prompt, /create_wordpress_draft/);
    assert.doesNotMatch(wordpress, /status:\s*"publish"/);
  });

  it("le schéma Prisma conserve l’éditorial et retire le GEO", () => {
    const schema = readSource("prisma/schema.prisma");
    for (const model of [
      "ArticleGeneration",
      "Topic",
      "SeoOpportunity",
      "OpportunitySearchRun",
      "WordPressPost",
      "ResearchConfig",
    ]) {
      assert.match(schema, new RegExp(`model ${model} \\{`));
    }
    for (const removed of [
      "VisibilityBrand",
      "VisibilityCampaign",
      "VisibilityQuestion",
      "VisibilityResponse",
      "VisibilityEntity",
      "VisibilityMention",
      "VisibilityCitation",
      "VisibilityCampaignStatus",
      "direct_competitor",
    ]) {
      assert.doesNotMatch(schema, new RegExp(`\\b${removed}\\b`));
    }
  });

  it("aucun source TypeScript applicatif n’importe le module GEO", () => {
    const roots = ["app", "components", "lib", "scripts"].map((dir) =>
      resolve(process.cwd(), dir)
    );
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of walk(root)) {
        if (file.endsWith("geo-module-removed.test.ts")) continue;
        const source = readFileSync(file, "utf8");
        if (
          /ai-visibility|AiVisibility|VisibilityCampaign|VisibilityBrand/.test(
            source
          )
        ) {
          offenders.push(file);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });
});
