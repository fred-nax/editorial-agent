import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { decodeHtmlEntities, stripHtml } from "../lib/seo/normalize";
import { extractEditorialIntentions } from "../lib/topics/editorial-intentions";
import {
  findEditorialRapprochements,
  scorePublishedPost,
  type PublishedPostRecord,
} from "../lib/topics/editorial-similarity";

function readSource(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

function post(
  overrides: Partial<PublishedPostRecord> &
    Pick<PublishedPostRecord, "title" | "wpPostId">
): PublishedPostRecord {
  return {
    slug: overrides.slug ?? "article",
    url: overrides.url ?? `https://naxialis.com/${overrides.slug ?? "article"}`,
    excerpt: overrides.excerpt ?? null,
    ...overrides,
  };
}

const AI_SECURITY_SUBJECT = "Sécurité de l'IA | Risques de l'IA générative";

const INTENTION_NOISE: PublishedPostRecord[] = [
  post({
    wpPostId: 401,
    title:
      "Classement 2025 des IA conversationnelles : GPT-4o, Claude, Gemini, Mistral…",
    slug: "classement-ia-conversationnelles",
    excerpt: "Comparatif des modèles conversationnels pour choisir un outil.",
  }),
  post({
    wpPostId: 402,
    title:
      "GPT-6 Astra : ce que le nouveau modèle d'OpenAI change pour les développeurs et les agents IA",
    slug: "gpt-6-astra",
    excerpt: "Nouveautés du modèle pour les développeurs et les agents.",
  }),
  post({
    wpPostId: 403,
    title:
      "Goose, Observer AI et AnythingLLM : comment intégrer des agents IA en entreprise ?",
    slug: "integrer-agents-ia-entreprise",
    excerpt: "Panorama d’outils pour intégrer des agents IA côté métiers.",
  }),
  post({
    wpPostId: 404,
    title:
      "Comment déployer l'intelligence artificielle en entreprise : méthode en 7 étapes",
    slug: "deployer-ia-entreprise",
    excerpt: "Méthode de déploiement IA orientée productivité.",
  }),
  post({
    wpPostId: 405,
    title: "RAG en entreprise : connecter une IA aux documents internes sans exposer les données sensibles.",
    slug: "rag-entreprise-donnees",
    excerpt: "Comment déployer un RAG sans compromettre la confidentialité.",
  }),
  post({
    wpPostId: 406,
    title: "Sécurité des modèles LLM : menaces et contre-mesures",
    slug: "securite-modeles-llm",
    excerpt: "Protéger les grands modèles de langage en production.",
  }),
];

describe("V7.4.2 — intentions éditoriales et titres WordPress", () => {
  it("n’élève pas un classement d’IA conversationnelles en sujet proche", () => {
    const match = scorePublishedPost(
      AI_SECURITY_SUBJECT,
      null,
      INTENTION_NOISE[0]!
    );
    assert.equal(match, null);
  });

  it("exclut une actualité produit IA sans lien sécurité / gouvernance", () => {
    assert.equal(
      scorePublishedPost(AI_SECURITY_SUBJECT, null, INTENTION_NOISE[1]!),
      null
    );
  });

  it("n’associe pas automatiquement intégration d’agents IA à la sécurité IA", () => {
    assert.equal(
      scorePublishedPost(AI_SECURITY_SUBJECT, null, INTENTION_NOISE[2]!),
      null
    );
  });

  it("n’associe pas un tutoriel de déploiement IA sans signal risques / gouvernance", () => {
    assert.equal(
      scorePublishedPost(AI_SECURITY_SUBJECT, null, INTENTION_NOISE[3]!),
      null
    );
  });

  it("peut classer le RAG confidentialité comme complémentaire", () => {
    const match = scorePublishedPost(
      AI_SECURITY_SUBJECT,
      null,
      INTENTION_NOISE[4]!
    );
    assert.ok(match);
    assert.equal(match!.kind, "complementary");
  });

  it("rapproche sécurité des modèles LLM avec intention sécurité partagée", () => {
    const match = scorePublishedPost(
      AI_SECURITY_SUBJECT,
      null,
      INTENTION_NOISE[5]!
    );
    assert.ok(match);
    assert.ok(
      match!.kind === "close" || match!.kind === "probable_duplicate"
    );
  });

  it("sur le corpus d’intention, ne remonte que les rapprochements justifiés", () => {
    const matches = findEditorialRapprochements(
      AI_SECURITY_SUBJECT,
      INTENTION_NOISE
    );
    const ids = new Set(matches.map((item) => item.wpPostId));
    assert.equal(ids.has(401), false);
    assert.equal(ids.has(402), false);
    assert.equal(ids.has(403), false);
    assert.equal(ids.has(404), false);
    assert.ok(ids.has(405) || ids.has(406));
    assert.ok(matches.length <= 5);
  });

  it("détecte les intentions sécurité, comparatif et déploiement", () => {
    assert.ok(
      extractEditorialIntentions(AI_SECURITY_SUBJECT).includes("security_risks")
    );
    assert.ok(
      extractEditorialIntentions(
        "Classement 2025 des IA conversationnelles"
      ).includes("comparison_ranking")
    );
    assert.ok(
      extractEditorialIntentions(
        "Comment déployer l'intelligence artificielle en entreprise"
      ).includes("tutorial_deploy")
    );
  });

  it("conserve le rapprochement agent IA / vulnérabilités (même intention)", () => {
    const matches = findEditorialRapprochements("Sécuriser un agent IA", [
      post({
        wpPostId: 501,
        title: "Vulnérabilités des agents IA : surfaces d’attaque et mitigations",
        slug: "vulnerabilites-agents-ia",
        excerpt: "Comment sécuriser un agent IA face aux injections de prompts.",
      }),
    ]);
    assert.ok(matches.length >= 1);
    assert.ok(
      matches[0]?.kind === "close" || matches[0]?.kind === "probable_duplicate"
    );
  });

  it("conserve l’exclusion PHP / WordPress de la V7.4.1", () => {
    assert.equal(
      scorePublishedPost(AI_SECURITY_SUBJECT, null, {
        wpPostId: 502,
        title:
          "Nouvelle alerte PHP : une faille dans la gestion des sessions peut-elle menacer votre site WordPress ?",
        slug: "alerte-php-sessions",
        url: "https://naxialis.com/alerte-php-sessions",
        excerpt: "Une vulnérabilité PHP liée aux sessions WordPress.",
      }),
      null
    );
  });

  it("décode les entités HTML WordPress sans rendu HTML", () => {
    assert.equal(
      decodeHtmlEntities(
        "Comment déployer l&rsquo;intelligence artificielle en entreprise"
      ),
      "Comment déployer l'intelligence artificielle en entreprise"
    );
    assert.equal(
      decodeHtmlEntities("L&#8217;API REST &amp; Headless"),
      "L'API REST & Headless"
    );
    assert.equal(
      stripHtml("<p>Sécurité de l&#8217;IA &eacute;volutive</p>"),
      "Sécurité de l'IA évolutive"
    );
    // Idempotent
    const once = decodeHtmlEntities("l&rsquo;IA");
    assert.equal(decodeHtmlEntities(once), once);
  });

  it("expose un titre décodé dans le score local", () => {
    const match = scorePublishedPost(
      "Sécurité des agents IA",
      null,
      post({
        wpPostId: 503,
        title: "S&eacute;curit&eacute; des agents IA",
        slug: "securite-des-agents-ia",
      })
    );
    assert.equal(match?.kind, "probable_duplicate");
    assert.equal(match?.title, "Sécurité des agents IA");
    assert.doesNotMatch(match!.title, /&[a-z]+;/i);
  });

  it("moteur local sans OpenAI ; IA facultative avec évaluation d’intention", () => {
    const engine = readSource("lib/topics/editorial-similarity.ts");
    assert.doesNotMatch(engine, /openai|responses\.create/i);
    assert.match(engine, /extractEditorialIntentions/);
    assert.match(engine, /decodeHtmlEntities/);

    const ai = readSource("lib/topics/editorial-similarity-ai.ts");
    assert.match(ai, /intentions de recherche/);
    assert.match(ai, /ne suffit pas pour close/);

    const normalize = readSource("lib/seo/normalize.ts");
    assert.match(normalize, /decodeHtmlEntities/);
    assert.match(normalize, /&rsquo;/);
  });
});
