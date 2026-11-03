import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractSubjectThemes,
  normalizeInternalUrl,
  sanitizeInternalLinks,
  selectInternalLinks,
  type CatalogEntry,
} from "../lib/agent/internal-links";
import { buildArticlePrompt } from "../lib/agent/prompt";

function entry(
  partial: Partial<CatalogEntry> &
    Pick<CatalogEntry, "wpPostId" | "title" | "url" | "slug">
): CatalogEntry {
  return {
    excerpt: partial.excerpt ?? "",
    categories: partial.categories ?? [],
    tags: partial.tags ?? [],
    theme: partial.theme ?? "général",
    publishedAt: partial.publishedAt ?? new Date("2026-01-01"),
    status: "publish",
    ...partial,
  };
}

const CATALOG: CatalogEntry[] = [
  entry({
    wpPostId: 1,
    title: "Sécuriser une API WordPress REST en headless",
    url: "https://naxialis.com/securiser-api-wordpress-rest-headless",
    slug: "securiser-api-wordpress-rest-headless",
    excerpt: "Authentification, permissions et bonnes pratiques API.",
    theme: "API / intégrations",
  }),
  entry({
    wpPostId: 2,
    title: "Agent IA pour entreprise : usages et exemples",
    url: "https://naxialis.com/agent-ia-entreprise",
    slug: "agent-ia-entreprise",
    excerpt: "Agents autonomes, outils et orchestration MCP.",
    theme: "agents IA / MCP",
  }),
  entry({
    wpPostId: 3,
    title: "Failles critiques PHP : protéger son site web",
    url: "https://naxialis.com/failles-critiques-php-octobre-2026",
    slug: "failles-critiques-php-octobre-2026",
    excerpt: "CVE PHP, sessions et cybersécurité WordPress.",
    theme: "sécurité / cybersécurité",
  }),
  entry({
    wpPostId: 4,
    title: "DMARC, SPF et DKIM : sécuriser vos emails",
    url: "https://naxialis.com/dmarc-spf-dkim-securite-email",
    slug: "dmarc-spf-dkim-securite-email",
    excerpt: "Authentification email et lutte contre le phishing.",
    theme: "email / deliverability",
  }),
  entry({
    wpPostId: 5,
    title: "Automatiser la facturation avec Make et Pennylane",
    url: "https://naxialis.com/automatisation-facturation-pennylane",
    slug: "automatisation-facturation-pennylane",
    excerpt: "Factures électroniques et workflows comptables.",
    theme: "automatisation",
  }),
  entry({
    wpPostId: 6,
    title: "Applications SaaS B2B sur mesure",
    url: "https://naxialis.com/applications-saas-b2b",
    slug: "applications-saas-b2b",
    excerpt: "Développement d'applications métier SaaS.",
    theme: "SaaS / développement web",
  }),
  entry({
    wpPostId: 7,
    title: "Connecter WordPress à Brevo",
    url: "https://naxialis.com/wordpress-brevo",
    slug: "wordpress-brevo",
    excerpt: "Newsletter et synchronisation des contacts.",
    theme: "email / deliverability",
  }),
  entry({
    wpPostId: 8,
    title: "Sécurité MCP et agents IA : risques et contrôles",
    url: "https://naxialis.com/securite-mcp-agents-ia",
    slug: "securite-mcp-agents-ia",
    excerpt: "Contrôles d'accès, outils MCP et surface d'attaque.",
    theme: "agents IA / MCP",
  }),
];

describe("internal links — sélection", () => {
  it("article cybersécurité → liens cybersécurité", () => {
    const plan = selectInternalLinks(
      "Cybersécurité WordPress : comment se protéger des failles PHP",
      CATALOG
    );
    assert.ok(plan.selected.length >= 1);
    assert.ok(
      plan.selected.some(
        (item) =>
          item.url.includes("failles") ||
          item.url.includes("securiser-api") ||
          item.title.toLowerCase().includes("sécur")
      )
    );
    assert.ok(
      !plan.selected.some((item) => item.url.includes("facturation")),
      "pas de facturation hors sujet"
    );
    assert.ok(
      !plan.selected.some((item) => item.url.includes("applications-saas")),
      "pas de SaaS hors sujet"
    );
  });

  it("article MCP → liens agents IA / API / sécurité", () => {
    const plan = selectInternalLinks(
      "Sécurité MCP pour les agents IA et les outils API",
      CATALOG
    );
    assert.ok(plan.selected.length >= 1);
    const urls = plan.selected.map((item) => item.url).join(" ");
    assert.match(urls, /agent|mcp|secur|api/i);
    assert.ok(!urls.includes("facturation"));
    assert.ok(!urls.includes("wordpress-brevo"));
    assert.ok(!urls.includes("applications-saas"));
  });

  it("article DMARC → liens sécurité email", () => {
    const plan = selectInternalLinks(
      "Mettre en place DMARC pour sécuriser la messagerie d'entreprise",
      CATALOG
    );
    assert.ok(plan.selected.length >= 1);
    assert.ok(
      plan.selected.some(
        (item) =>
          item.url.includes("dmarc") || item.url.includes("brevo")
      )
    );
    assert.ok(!plan.selected.some((item) => item.url.includes("facturation")));
  });

  it("article sans contenu connexe → zéro lien", () => {
    const plan = selectInternalLinks(
      "Réglementation maritime des phares islandais en 1820",
      CATALOG,
      { minScore: 0.35 }
    );
    assert.equal(plan.selected.length, 0);
  });

  it("URL supprimée → non sélectionnée", () => {
    const plan = selectInternalLinks(
      "Sécurité MCP pour les agents IA",
      CATALOG,
      {
        excludeUrls: ["https://naxialis.com/securite-mcp-agents-ia"],
      }
    );
    assert.ok(
      !plan.selected.some((item) =>
        item.url.includes("securite-mcp-agents-ia")
      )
    );
  });

  it("plusieurs articles similaires → sélection pertinente et diversifiée", () => {
    const a = selectInternalLinks(
      "Sécuriser les agents IA MCP en entreprise",
      CATALOG,
      { recentUrls: [] }
    );
    const b = selectInternalLinks(
      "Contrôles d'accès MCP et surface d'attaque des agents",
      CATALOG,
      {
        recentUrls: a.selected.map((item) => item.url),
      }
    );
    assert.ok(a.selected.length >= 1);
    assert.ok(b.selected.length >= 1);
    // Les deux restent dans le cluster agents/sécurité
    for (const plan of [a, b]) {
      assert.ok(
        plan.selected.every(
          (item) =>
            /agent|mcp|secur|api|faille/i.test(item.url + item.title)
        )
      );
    }
  });

  it("aucun doublon dans un même article", () => {
    const withDup = [
      ...CATALOG,
      entry({
        wpPostId: 99,
        title: "Agent IA pour entreprise (miroir)",
        url: "https://naxialis.com/agent-ia-entreprise/",
        slug: "agent-ia-entreprise",
        excerpt: "Agents autonomes MCP.",
      }),
    ];
    const plan = selectInternalLinks("Agents IA MCP sécurité API", withDup);
    const keys = plan.selected.map((item) =>
      item.url.replace(/\/$/, "").toLowerCase()
    );
    assert.equal(keys.length, new Set(keys).size);
  });

  it("n'invente aucune URL hors catalogue", () => {
    const plan = selectInternalLinks("Sécurité MCP agents IA", CATALOG);
    const catalogUrls = new Set(
      CATALOG.map((item) => item.url.replace(/\/$/, "").toLowerCase())
    );
    for (const item of plan.selected) {
      assert.ok(catalogUrls.has(item.url.replace(/\/$/, "").toLowerCase()));
    }
  });

  it("extrait des thèmes MCP / sécurité", () => {
    const themes = extractSubjectThemes("Sécurité MCP des agents IA");
    assert.ok(themes.includes("agents_mcp") || themes.includes("security"));
  });
});

describe("internal links — sanitization", () => {
  it("supprime les URL inventées sans détruire la phrase", () => {
    const html = `<p>Voir <a href="https://naxialis.com/automatisation-facturation-pennylane">la facturation</a> et <a href="https://naxialis.com/securite-mcp-agents-ia">la sécurité MCP</a>.</p>`;
    const result = sanitizeInternalLinks(
      html,
      ["https://naxialis.com/securite-mcp-agents-ia"],
      "naxialis.com"
    );
    assert.match(result.content, /la facturation/);
    assert.doesNotMatch(
      result.content,
      /href="https:\/\/naxialis\.com\/automatisation-facturation/
    );
    assert.match(
      result.content,
      /href="https:\/\/naxialis\.com\/securite-mcp-agents-ia"/
    );
    assert.deepEqual(result.removedUrls.map((u) => u.replace(/\/$/, "")), [
      "https://naxialis.com/automatisation-facturation-pennylane",
    ]);
  });

  it("unwrap les doublons d'URL dans le même HTML", () => {
    const html = `<p><a href="https://naxialis.com/agent-ia-entreprise">un</a> puis <a href="https://naxialis.com/agent-ia-entreprise/">deux</a></p>`;
    const result = sanitizeInternalLinks(
      html,
      ["https://naxialis.com/agent-ia-entreprise"],
      "naxialis.com"
    );
    assert.equal(result.keptUrls.length, 1);
    assert.equal(result.duplicateUrls.length, 1);
    assert.match(result.content, /puis deux/);
    assert.equal(
      (result.content.match(/href="https:\/\/naxialis\.com\/agent-ia-entreprise"/g) ?? [])
        .length,
      1
    );
  });

  it("laisse les liens externes intacts", () => {
    const html = `<p><a href="https://owasp.org/mcp">OWASP</a></p>`;
    const result = sanitizeInternalLinks(html, [], "naxialis.com");
    assert.match(result.content, /href="https:\/\/owasp\.org\/mcp"/);
    assert.equal(result.removedUrls.length, 0);
  });

  it("normalizeInternalUrl retire query/hash/slash", () => {
    assert.equal(
      normalizeInternalUrl(
        "https://naxialis.com/agent-ia-entreprise/?utm=1#x"
      ),
      "https://naxialis.com/agent-ia-entreprise"
    );
  });
});

describe("internal links — prompt", () => {
  it("injecte uniquement les destinations autorisées", () => {
    const plan = selectInternalLinks("Sécurité MCP agents IA", CATALOG);
    const prompt = buildArticlePrompt("Sécurité MCP agents IA", plan);
    assert.match(prompt, /Destinations autorisées|Aucune destination/i);
    assert.match(prompt, /N'invente aucune URL|ne jamais inventer/i);
    for (const item of plan.selected) {
      assert.match(prompt, new RegExp(item.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.doesNotMatch(prompt, /automatisation-facturation-pennylane/);
  });
});
