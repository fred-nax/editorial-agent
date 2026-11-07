import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import { classifyPublication, countByKind, filterArticles } from "../lib/veille/classify";
import {
  confirmArticleDates,
  extractPublishedDate,
  isBlockedAddress,
  lookupPublishedDate,
  PUBLICATION_HTML_LIMIT,
  readPublicationDate,
  type DateProbe,
} from "../lib/veille/publication-date";
import { handleVeilleSearch } from "../lib/veille/search";
import { buildTopicProposal } from "../lib/veille/topic-proposal";
import type { VeilleArticle } from "../lib/veille/types";

const NOW = new Date("2026-11-03T12:00:00.000Z");
const PUBLIC = ["93.184.216.34"];

function article(overrides: Partial<VeilleArticle> = {}): VeilleArticle {
  return {
    title: "Publication",
    sourceName: "Média",
    url: "https://media.example/article",
    summary: "Résumé factuel.",
    event: null,
    kind: "unknown",
    publishedOn: null,
    dateVerified: false,
    ...overrides,
  };
}

function html(head: string): string {
  return `<!doctype html><html><head>${head}</head><body><p>Article</p></body></html>`;
}

describe("classification de la veille", () => {
  it("distingue actualité, étude, guide et inconnu", () => {
    assert.equal(
      classifyPublication({
        title: "La CNIL annonce un décret sur les agents IA",
        url: "https://cnil.fr/actualite/decret",
        summary: "Le texte entre en vigueur le mois prochain.",
        event: "Publication du décret",
      }),
      "news"
    );
    assert.equal(
      classifyPublication({
        title: "Rapport : benchmark des agents IA en entreprise",
        url: "https://institut.example/etudes/benchmark",
        summary: "L’enquête rassemble des statistiques européennes.",
        event: null,
      }),
      "study"
    );
    assert.equal(
      classifyPublication({
        title: "Guide : déployer un agent IA dans une PME",
        url: "https://blog.example/guides/deploiement",
        summary: "Analyse des étapes et retour d’expérience.",
        event: null,
      }),
      "guide"
    );
    assert.equal(
      classifyPublication({
        title: "Les agents IA",
        url: "https://media.example/2026/11/02/note",
        summary: "Un panorama sans catégorie explicite.",
        event: null,
      }),
      "unknown"
    );
  });

  it("ne transforme pas un guide récent en actualité", () => {
    assert.equal(
      classifyPublication({
        title: "Guide complet des agents IA",
        url: "https://media.example/guide-agents",
        summary: "Publié cette semaine.",
        event: null,
        hintedKind: "news",
      }),
      "guide"
    );
  });

  it("accepte l’indice du modèle seulement s’il ne contredit pas le contenu", () => {
    assert.equal(
      classifyPublication({
        title: "Panorama des usages",
        url: "https://media.example/pano",
        summary: "Description générale.",
        event: null,
        hintedKind: "study",
      }),
      "study"
    );
    assert.equal(
      classifyPublication({
        title: "Usages en entreprise",
        url: "https://media.example/usages",
        summary: "Une étude et un guide sont cités sans que le format soit clair.",
        event: null,
        hintedKind: "news",
      }),
      "unknown"
    );
  });

  it("filtre les résultats déjà chargés", () => {
    const items = [
      article({ url: "https://a.example/1", kind: "news" }),
      article({ url: "https://a.example/2", kind: "study" }),
      article({ url: "https://a.example/3", kind: "guide" }),
      article({ url: "https://a.example/4", kind: "unknown" }),
    ];
    assert.equal(filterArticles(items, "all").length, 4);
    assert.deepEqual(
      filterArticles(items, "news").map((item) => item.kind),
      ["news"]
    );
    assert.equal(countByKind(items).guide, 1);
    assert.equal(countByKind(items).unknown, 1);
  });
});

describe("dates de publication", () => {
  it("retient article:published_time et ignore la date de modification", () => {
    const published = extractPublishedDate(
      html(
        `<meta property="article:modified_time" content="2026-11-02T10:00:00Z">
         <meta property="article:published_time" content="2026-11-01T08:30:00+01:00">`
      ),
      NOW
    );
    assert.equal(published, "2026-11-01");
    assert.equal(
      extractPublishedDate(
        html(
          `<meta property="article:modified_time" content="2026-11-01T10:00:00Z">
           <script type="application/ld+json">{"@type":"NewsArticle","dateModified":"2026-11-01"}</script>`
        ),
        NOW
      ),
      null
    );
  });

  it("lit datePublished en JSON-LD et laisse vide une page sans date", () => {
    assert.equal(
      extractPublishedDate(
        html(
          `<script type="application/ld+json">{"@type":"Report","datePublished":"2026-10-20"}</script>`
        ),
        NOW
      ),
      "2026-10-20"
    );
    assert.equal(extractPublishedDate(html("<title>Sans date</title>"), NOW), null);
  });

  it("vérifie une date sur une URL publique déjà connue", async () => {
    const calls: string[] = [];
    const date = await readPublicationDate("https://media.example/article", NOW, {
      resolveHost: async () => PUBLIC,
      request: async (target) => {
        calls.push(target.url);
        assert.deepEqual(target.addresses, PUBLIC);
        return {
          kind: "response",
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
          body: html(
            `<meta property="article:published_time" content="2026-11-01T08:00:00Z">`
          ),
        };
      },
    });
    assert.equal(date, "2026-11-01");
    assert.deepEqual(calls, ["https://media.example/article"]);
  });

  it("écarte une publication dont la date confirmée est hors période", async () => {
    const result = await confirmArticleDates(
      [article({ kind: "guide", title: "Guide des agents" })],
      30,
      NOW,
      async () => "2020-01-15"
    );
    assert.deepEqual(result.articles, []);
    assert.equal(result.discarded, 1);
  });

  it("conserve la catégorie quand une date récente est confirmée", async () => {
    const result = await confirmArticleDates(
      [article({ kind: "guide" })],
      30,
      NOW,
      async () => "2026-11-01"
    );
    assert.equal(result.articles[0]?.dateVerified, true);
    assert.equal(result.articles[0]?.publishedOn, "2026-11-01");
    assert.equal(result.articles[0]?.kind, "guide");
  });

  it("laisse la date non vérifiée en cas d’absence, de timeout ou de page trop volumineuse", async () => {
    const missing = await readPublicationDate("https://media.example/vide", NOW, {
      resolveHost: async () => PUBLIC,
      request: async () => ({
        kind: "response",
        status: 200,
        headers: { "content-type": "text/html" },
        body: html("<title>Sans date</title>"),
      }),
    });
    const timedOut = await readPublicationDate("https://media.example/lent", NOW, {
      resolveHost: async () => PUBLIC,
      request: async () => ({ kind: "timeout" }),
    });
    const huge = await readPublicationDate("https://media.example/gros", NOW, {
      resolveHost: async () => PUBLIC,
      request: async () => ({
        kind: "response",
        status: 200,
        headers: {
          "content-type": "text/html",
          "content-length": String(PUBLICATION_HTML_LIMIT + 1),
        },
        body: html(
          `<meta property="article:published_time" content="2026-11-01T00:00:00Z">`
        ),
      }),
    });
    const truncated = "x".repeat(PUBLICATION_HTML_LIMIT + 50) +
      `<meta property="article:published_time" content="2026-11-01T00:00:00Z">`;
    const overflow = await readPublicationDate("https://media.example/flux", NOW, {
      resolveHost: async () => PUBLIC,
      request: async () => ({
        kind: "response",
        status: 200,
        headers: { "content-type": "text/html" },
        body: truncated,
      }),
    });
    assert.equal(missing, null);
    assert.equal(timedOut, null);
    assert.equal(huge, null);
    assert.equal(overflow, null);
  });

  it("refuse une URL invalide et une redirection vers une adresse privée", async () => {
    assert.equal(isBlockedAddress("127.0.0.1"), true);
    assert.equal(isBlockedAddress("10.1.2.3"), true);
    assert.equal(isBlockedAddress("192.168.0.8"), true);
    assert.equal(isBlockedAddress("169.254.169.254"), true);
    assert.equal(isBlockedAddress("::1"), true);
    assert.equal(isBlockedAddress("::ffff:127.0.0.1"), true);
    assert.equal(isBlockedAddress("93.184.216.34"), false);

    const calls: string[] = [];
    const probe: DateProbe = {
      resolveHost: async (hostname) =>
        hostname === "media.example" ? PUBLIC : ["10.1.2.3"],
      request: async (target) => {
        calls.push(target.url);
        return {
          kind: "response",
          status: 302,
          headers: { location: "http://127.0.0.1/secret" },
          body: "",
        };
      },
    };
    assert.equal(await readPublicationDate("http://127.0.0.1/admin", NOW, probe), null);
    assert.equal(await readPublicationDate("javascript:alert(1)", NOW, probe), null);
    assert.equal(await readPublicationDate("https://user:pass@media.example/a", NOW, probe), null);
    assert.equal(await readPublicationDate("https://prive.example/secret", NOW, probe), null);
    assert.equal(await readPublicationDate("https://media.example/article", NOW, probe), null);
    assert.deepEqual(calls, ["https://media.example/article"]);
  });

  it("ne contacte pas le réseau pendant les tests", () => {
    assert.throws(
      () => lookupPublishedDate("https://example.com/article", NOW),
      /sites externes/
    );
  });
});

describe("proposition de sujet", () => {
  it("prépare les champs sans écrire en base", () => {
    const proposal = buildTopicProposal(
      article({
        title: "Guide des agents IA",
        kind: "guide",
        event: "Méthode en cinq étapes",
        url: "https://media.example/guide",
      }),
      "agents IA"
    );
    assert.equal(proposal.subject, "Guide des agents IA");
    assert.equal(proposal.category, "agents IA");
    assert.equal(proposal.angle, "Méthode en cinq étapes");
    assert.equal(proposal.sourceUrl, "https://media.example/guide");
    assert.equal(proposal.summary, "Résumé factuel.");
    assert.equal(proposal.kind, "guide");
    const source = readFileSync(resolve("lib/veille/topic-proposal.ts"), "utf8");
    assert.doesNotMatch(source, /prisma|fetch\(|topic\.create/);
  });

  it("ne lance ni la vérification ni OpenAI sans authentification", async () => {
    let lookups = 0;
    const result = await handleVeilleSearch(
      new Request("http://local/api/veille/search", {
        method: "POST",
        body: JSON.stringify({
          theme: "agents IA",
          periodDays: 30,
          country: "FR",
        }),
      }),
      {
        authenticated: false,
        client: {
          async search() {
            throw new Error("OpenAI ne doit pas être appelé");
          },
        },
        confirmDates: async () => {
          lookups += 1;
          return { articles: [], discarded: 0 };
        },
      }
    );
    assert.equal(result.status, 401);
    assert.equal(lookups, 0);
  });
});
