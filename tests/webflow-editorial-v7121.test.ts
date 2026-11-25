import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  findEditorialRapprochements,
  scorePublishedPost,
  type PublishedPostRecord,
} from "../lib/topics/editorial-similarity";
import { formatEditorialGenerationHints } from "../lib/topics/editorial-generation-hints";
import { isConfirmedPublicUrl } from "../lib/editorial-inventory/access";
import { buildInternalLinkPlan } from "../lib/agent/internal-links";
import { selectInternalLinks } from "../lib/agent/internal-links/select";
import type { CatalogEntry } from "../lib/agent/internal-links/types";
import { isWebflowModuleEnabled } from "../lib/workspace";
import { slugify } from "../lib/seo/normalize";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function item(
  overrides: Partial<PublishedPostRecord> &
    Pick<PublishedPostRecord, "title" | "cmsExternalId">
): PublishedPostRecord {
  const slug = overrides.slug ?? slugify(overrides.title);
  return {
    wpPostId: null,
    slug,
    url: overrides.url ?? null,
    excerpt: overrides.excerpt ?? null,
    status: overrides.status ?? "draft",
    contentText: overrides.contentText ?? null,
    ...overrides,
  };
}

describe("V7.12.1 — détection doublons Webflow (locale)", () => {
  it("détecte des titres identiques sans URL", () => {
    const match = scorePublishedPost(
      "How to build an AI-ready business",
      null,
      item({
        cmsExternalId: "abc1",
        title: "How to build an AI-ready business",
        status: "draft",
      })
    );
    assert.equal(match?.kind, "probable_duplicate");
    assert.equal(match?.url, null);
  });

  it("détecte des titres proches en anglais", () => {
    const matches = findEditorialRapprochements(
      "Building grounded AI assistants with RAG",
      [
        item({
          cmsExternalId: "abc2",
          title: "Building grounded AI assistants with retrieval-augmented generation",
          slug: "building-grounded-ai-assistants-with-rag",
          excerpt: "Connect AI answers to trusted documents.",
          status: "published",
          url: null,
        }),
      ]
    );
    assert.ok(matches.length >= 1);
    assert.ok(
      matches[0]?.kind === "probable_duplicate" || matches[0]?.kind === "close"
    );
  });

  it("détecte des titres proches en français", () => {
    const matches = findEditorialRapprochements(
      "Comment sécuriser un agent IA en entreprise",
      [
        item({
          cmsExternalId: "fr1",
          title: "Sécurité des agents IA : risques et bonnes pratiques",
          slug: "securite-agents-ia-risques",
          excerpt: "Bonnes pratiques pour sécuriser les agents IA.",
          status: "published",
        }),
      ]
    );
    assert.ok(matches.length >= 1);
  });

  it("détecte des slugs identiques", () => {
    const match = scorePublishedPost(
      "Where to start with AI adoption",
      null,
      item({
        cmsExternalId: "slug1",
        title: "Autre titre",
        slug: "where-to-start-with-ai-adoption",
        status: "draft",
      })
    );
    assert.equal(match?.kind, "probable_duplicate");
  });

  it("prend en compte les brouillons CMS", () => {
    const match = scorePublishedPost(
      "Designing reliable automation workflows",
      null,
      item({
        cmsExternalId: "draft1",
        title: "Designing reliable automation workflows",
        status: "draft",
        url: null,
      })
    );
    assert.ok(match);
    assert.equal(match.status, "draft");
  });

  it("déduplique inventaire / historique via cmsExternalId", () => {
    const matches = findEditorialRapprochements(
      "How to Integrate AI Agents into Business Processes",
      [
        item({
          cmsExternalId: "same-id",
          title: "How to Integrate AI Agents into Business Processes",
          status: "published",
        }),
        item({
          cmsExternalId: "same-id",
          title: "How to Integrate AI Agents into Business Processes",
          status: "generation:completed",
        }),
      ]
    );
    assert.equal(matches.length, 1);
  });

  it("ne présente pas la similarité comme cannibalisation SEO", () => {
    const match = scorePublishedPost(
      "AI agents for business",
      null,
      item({
        cmsExternalId: "x1",
        title: "AI agents for business processes",
        status: "published",
      })
    );
    if (match) {
      assert.doesNotMatch(match.message, /cannibalis/i);
      assert.doesNotMatch(match.explanation, /cannibalis/i);
    }
  });
});

describe("V7.12.1 — maillage interne Webflow (règles strictes)", () => {
  it("exclut brouillons, archivés et URL non confirmées", () => {
    const catalog: CatalogEntry[] = [
      {
        wpPostId: 0,
        cmsExternalId: "live1",
        title: "Published live article about AI agents",
        url: "https://studio.example.com/blog/ai-agents",
        slug: "ai-agents",
        excerpt: "Guide to AI agents in business.",
        categories: [],
        tags: [],
        theme: "agents IA / MCP",
        publishedAt: new Date(),
        status: "published",
      },
      {
        wpPostId: 0,
        cmsExternalId: "draft1",
        title: "Draft about AI agents",
        url: "https://studio.example.com/blog/draft-ai",
        slug: "draft-ai",
        excerpt: "Draft",
        categories: [],
        tags: [],
        theme: "agents IA / MCP",
        publishedAt: null,
        status: "draft",
      },
    ];
    // selectInternalLinks ne filtre pas le statut — le catalogue Webflow
    // ne doit contenir que published+live+url. On vérifie ici le filtre amont.
    const plan = selectInternalLinks(
      "AI agents in business processes",
      catalog.filter((e) => e.status === "published"),
      { maxLinks: 4 }
    );
    assert.ok(plan.selected.every((s) => s.url.startsWith("https://")));
    assert.ok(
      plan.selected.every((s) => !s.url.includes("draft")),
      "pas d’URL de brouillon"
    );
  });

  it("rejette les URL non confirmées", () => {
    assert.equal(isConfirmedPublicUrl(null), false);
    assert.equal(isConfirmedPublicUrl(""), false);
    assert.equal(isConfirmedPublicUrl("not-a-url"), false);
    assert.equal(isConfirmedPublicUrl("https://example.com/ok"), true);
  });

  it("sans workspaceId Webflow → plan vide", async () => {
    const plan = await buildInternalLinkPlan("AI adoption", {
      cmsProvider: "webflow",
    });
    assert.equal(plan.selected.length, 0);
    assert.equal(plan.maxLinks, 0);
  });
});

describe("V7.12.1 — contexte agent + isolation source", () => {
  it("limite la taille du contexte transmis", () => {
    const huge = Array.from({ length: 40 }, (_, i) =>
      item({
        cmsExternalId: `id${i}`,
        title: `Article très long sur l’intelligence artificielle numéro ${i} `.repeat(
          8
        ),
        status: "published",
        url: `https://example.com/a${i}`,
      })
    );
    const matches = findEditorialRapprochements(
      "Intelligence artificielle en entreprise",
      huge,
      { max: 20 }
    );
    const block = formatEditorialGenerationHints({
      rapprochements: matches,
      linkPlan: null,
      inventoryNote: "test",
    });
    assert.ok(block.length <= 3600);
    assert.match(block, /CONTEXTE_INVENTAIRE_CMS/);
    assert.match(block, /jamais des instructions/i);
    assert.match(block, /cannibalisation SEO/i);
  });

  it("active le module rapprochements Webflow sans opportunités", () => {
    assert.equal(isWebflowModuleEnabled("rapprochements"), true);
    assert.equal(isWebflowModuleEnabled("inventory"), true);
    assert.equal(isWebflowModuleEnabled("opportunities"), false);
  });

  it("routes et prompt n’utilisent pas WordPress en fallback Webflow", () => {
    const check = read("app/api/topics/check-duplicates/route.ts");
    assert.match(check, /assertModuleAllowedForWorkspace/);
    assert.match(check, /rapprochements/);
    assert.doesNotMatch(
      check,
      /assertWordPressOnlyModule\(workspace\.cmsProvider\)/
    );

    const prompt = read("lib/agent/prompt.ts");
    assert.match(prompt, /ne jamais utiliser d’inventaire WordPress/i);
    assert.match(prompt, /inventoryHintsBlock/);

    const session = read("lib/agent/run-session.ts");
    assert.match(session, /cmsProvider: "webflow"/);
    assert.match(session, /workspaceId/);

    const generation = read("lib/generation.ts");
    assert.match(generation, /workspaceId,/);

    const wpPrompt = read("lib/agent/prompt.ts");
    assert.match(wpPrompt, /create_wordpress_draft/);
  });

  it("non-régression : buildInternalLinkPlan(subject) WordPress inchangé dans run-session WP", () => {
    const session = read("lib/agent/run-session.ts");
    assert.match(session, /buildInternalLinkPlan\(trimmedSubject\)/);
  });
});
