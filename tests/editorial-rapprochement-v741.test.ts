import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { extractEditorialConcepts } from "../lib/topics/editorial-concepts";
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
  const slug = overrides.slug ?? "article";
  return {
    slug,
    url: overrides.url ?? `https://naxialis.com/${slug}`,
    excerpt: overrides.excerpt ?? null,
    cmsExternalId: overrides.cmsExternalId ?? String(overrides.wpPostId),
    status: overrides.status ?? "publish",
    ...overrides,
  };
}

const AI_SECURITY_SUBJECT = "Sécurité de l'IA | Risques de l'IA générative";

const NOISY_CORPUS: PublishedPostRecord[] = [
  post({
    wpPostId: 101,
    title:
      "Nouvelle alerte PHP : une faille dans la gestion des sessions peut-elle menacer votre site WordPress ?",
    slug: "alerte-php-sessions-wordpress",
    excerpt: "Une vulnérabilité PHP liée aux sessions WordPress.",
  }),
  post({
    wpPostId: 102,
    title:
      "RAG en entreprise : connecter une IA aux documents internes sans exposer les données sensibles.",
    slug: "rag-entreprise-donnees",
    excerpt: "Comment déployer un RAG sans compromettre la confidentialité.",
  }),
  post({
    wpPostId: 103,
    title:
      "Failles critiques PHP d'octobre 2026 : comprendre les risques et protéger son site web.",
    slug: "failles-php-octobre-2026",
    excerpt: "Correctifs PHP et risques pour les sites web.",
  }),
  post({
    wpPostId: 104,
    title: "ChatGPT en entreprise : quels risques pour la confidentialité des données ?",
    slug: "chatgpt-confidentialite-entreprise",
    excerpt: "Protection des données lorsque les équipes utilisent ChatGPT.",
  }),
  post({
    wpPostId: 105,
    title: "Comment sécuriser une API WordPress REST en environnement Headless ?",
    slug: "securiser-api-wordpress-rest-headless",
    excerpt: "Bonnes pratiques pour une API REST WordPress headless.",
  }),
];

describe("V7.4.1 — précision des rapprochements éditoriaux", () => {
  it("n’associe pas la sécurité de l’IA aux failles PHP", () => {
    const matches = findEditorialRapprochements(AI_SECURITY_SUBJECT, NOISY_CORPUS);
    assert.equal(
      matches.some((item) => /php/i.test(item.title) && !/ia|chatgpt|rag|llm/i.test(item.title)),
      false
    );
    assert.equal(
      scorePublishedPost(AI_SECURITY_SUBJECT, null, NOISY_CORPUS[0]!) === null,
      true
    );
    assert.equal(
      scorePublishedPost(AI_SECURITY_SUBJECT, null, NOISY_CORPUS[2]!) === null,
      true
    );
  });

  it("n’associe pas la sécurité de l’IA aux sessions WordPress", () => {
    assert.equal(
      scorePublishedPost(AI_SECURITY_SUBJECT, null, NOISY_CORPUS[0]!),
      null
    );
  });

  it("peut rapprocher risques IA générative et sécurité des modèles LLM", () => {
    const matches = findEditorialRapprochements(
      "Risques de l'IA générative",
      [
        post({
          wpPostId: 201,
          title: "Sécurité des modèles LLM : menaces et contre-mesures",
          slug: "securite-modeles-llm",
          excerpt: "Protéger les grands modèles de langage en production.",
        }),
      ]
    );
    assert.ok(matches.length >= 1);
    assert.ok(
      matches[0]?.kind === "close" ||
        matches[0]?.kind === "probable_duplicate" ||
        matches[0]?.kind === "complementary"
    );
  });

  it("rapproche sécuriser un agent IA d’un article sur les vulnérabilités des agents", () => {
    const matches = findEditorialRapprochements("Sécuriser un agent IA", [
      post({
        wpPostId: 202,
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

  it("rapproche API WordPress sans remonter automatiquement la sécurité LLM", () => {
    const corpus = [
      post({
        wpPostId: 203,
        title: "Sécuriser l’API REST WordPress : authentification et permissions",
        slug: "securiser-api-rest-wordpress",
        excerpt: "Contrôles d’accès pour une API WordPress headless.",
      }),
      post({
        wpPostId: 204,
        title: "Sécurité des modèles LLM : guide pratique",
        slug: "securite-modeles-llm-guide",
        excerpt: "Menaces propres aux grands modèles de langage.",
      }),
    ];
    const matches = findEditorialRapprochements(
      "Sécuriser une API WordPress",
      corpus
    );
    assert.ok(matches.some((item) => item.wpPostId === 203));
    assert.equal(
      matches.some((item) => item.wpPostId === 204),
      false
    );
  });

  it("peut rapprocher confidentialité ChatGPT et protection des données IA", () => {
    const matches = findEditorialRapprochements(
      "Confidentialité ChatGPT",
      [
        post({
          wpPostId: 205,
          title: "Protéger les données dans les outils d’IA générative",
          slug: "proteger-donnees-ia-generative",
          excerpt: "Confidentialité et gouvernance lorsque l’on utilise ChatGPT.",
        }),
      ]
    );
    assert.ok(matches.length >= 1);
  });

  it("peut classer le RAG comme complémentaire d’un sujet sécurité IA", () => {
    const match = scorePublishedPost(
      AI_SECURITY_SUBJECT,
      null,
      NOISY_CORPUS[1]!
    );
    assert.ok(match);
    assert.equal(match!.kind, "complementary");
  });

  it("un simple mot « risque » ou « sécurité » ne suffit pas", () => {
    assert.equal(
      scorePublishedPost("Les risques en entreprise", null, {
        wpPostId: 301,
        title: "Comprendre les risques du télétravail",
        slug: "risques-teletravail",
        url: "https://naxialis.com/risques-teletravail",
        excerpt: "Guide des risques organisationnels.",
      }),
      null
    );
    assert.equal(
      scorePublishedPost("La sécurité des sites web", null, {
        wpPostId: 302,
        title: "Sécurité des e-mails professionnels",
        slug: "securite-emails",
        url: "https://naxialis.com/securite-emails",
        excerpt: "Bonnes pratiques de sécurité messagerie.",
      }),
      null
    );
  });

  it("reconnaît les synonymes techniques (GenAI / LLM / agent IA)", () => {
    const gen = extractEditorialConcepts("Risques de l’IA générative et GenAI");
    assert.ok(gen.conceptIds.includes("gen_ai"));
    const llm = extractEditorialConcepts("Sécurité des large language models");
    assert.ok(llm.conceptIds.includes("llm"));
    const agent = extractEditorialConcepts("AI agent security checklist");
    assert.ok(agent.conceptIds.includes("ai_agent"));
  });

  it("conserve les sujets transversaux WordPress + agent IA", () => {
    const matches = findEditorialRapprochements(
      "Sécuriser un agent IA intégré à WordPress",
      [
        post({
          wpPostId: 206,
          title: "Agents IA et WordPress : points de vigilance sécurité",
          slug: "agents-ia-wordpress-securite",
          excerpt: "Intégrer un agent IA à WordPress sans exposer l’API.",
        }),
      ]
    );
    assert.ok(matches.length >= 1);
  });

  it("ne remplit pas artificiellement cinq résultats pour un sujet inédit", () => {
    const matches = findEditorialRapprochements(
      "Réglementation maritime des phares islandais en 1820",
      NOISY_CORPUS
    );
    assert.equal(matches.length, 0);
  });

  it("sur le corpus bruyant, exclut PHP/API WP et garde les signaux IA", () => {
    const matches = findEditorialRapprochements(AI_SECURITY_SUBJECT, NOISY_CORPUS);
    const ids = new Set(matches.map((item) => item.wpPostId));
    assert.equal(ids.has(101), false);
    assert.equal(ids.has(103), false);
    assert.equal(ids.has(105), false);
    assert.ok(ids.has(102) || ids.has(104));
    assert.ok(matches.length <= 5);
    assert.ok(matches.every((item) => !/termes : securi/i.test(item.explanation)));
  });

  it("moteur local sans OpenAI ; IA facultative ; publish only ; API compat", () => {
    const engine = readSource("lib/topics/editorial-similarity.ts");
    assert.doesNotMatch(engine, /openai|responses\.create/i);
    assert.match(engine, /status:\s*"publish"/);
    assert.match(engine, /extractEditorialConcepts/);

    const ai = readSource("lib/topics/editorial-similarity-ai.ts");
    assert.match(ai, /candidats fournis/);
    assert.match(ai, /npm_lifecycle_event === "test"/);

    const panel = readSource("components/EditorialRapprochementPanel.tsx");
    assert.match(
      panel,
      /Aucun contenu présentant un rapprochement significatif/
    );
    assert.doesNotMatch(
      panel,
      /useEffect\(\(\) => \{[\s\S]{0,60}analyze-similarity/
    );

    const route = readSource("app/api/topics/check-duplicates/route.ts");
    assert.match(route, /handleCheckDuplicates/);
    assert.match(route, /mode === "editorial"|wantsEditorial/);
  });
});
