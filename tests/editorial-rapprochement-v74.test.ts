import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  findEditorialRapprochements,
  isSubjectSignificant,
  parseEditorialSubjectInput,
  scorePublishedPost,
  type PublishedPostRecord,
} from "../lib/topics/editorial-similarity";
import { normalizeAiAssessments } from "../lib/topics/editorial-similarity-ai";
import { EDITORIAL_SIMILARITY_MODEL } from "../lib/topics/editorial-similarity-config";
import type { EditorialMatch } from "../lib/topics/editorial-similarity-types";

function readSource(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

function post(
  overrides: Partial<PublishedPostRecord> & Pick<PublishedPostRecord, "title" | "wpPostId">
): PublishedPostRecord {
  return {
    slug: overrides.slug ?? "article",
    url: overrides.url ?? `https://naxialis.com/${overrides.slug ?? "article"}`,
    excerpt: overrides.excerpt ?? null,
    ...overrides,
  };
}

describe("V7.4 — rapprochements éditoriaux", () => {
  it("détecte un doublon exact malgré accents et casse", () => {
    const match = scorePublishedPost(
      "Sécurité des agents IA",
      null,
      post({
        wpPostId: 1,
        title: "securite des agents ia",
        slug: "securite-des-agents-ia",
      })
    );
    assert.equal(match?.kind, "probable_duplicate");
    assert.match(match!.url, /^https:\/\//);
  });

  it("signale un sujet proche avec formulations différentes", () => {
    const matches = findEditorialRapprochements(
      "Comment sécuriser un agent IA en entreprise",
      [
        post({
          wpPostId: 2,
          title: "Sécurité des agents IA : risques et bonnes pratiques",
          slug: "securite-agents-ia-risques",
          excerpt: "Bonnes pratiques pour sécuriser les agents IA en production.",
        }),
      ]
    );
    assert.ok(matches.length >= 1);
    assert.ok(
      matches[0]?.kind === "probable_duplicate" || matches[0]?.kind === "close"
    );
  });

  it("classe un sujet complémentaire sans le présenter comme cannibalisation", () => {
    const matches = findEditorialRapprochements(
      "OWASP LLM Top 10 pour les équipes produit",
      [
        post({
          wpPostId: 3,
          title: "Sécurité des agents IA : risques et bonnes pratiques",
          slug: "securite-agents-ia",
          excerpt: "Panorama des risques liés aux agents IA.",
        }),
      ]
    );
    if (matches.length > 0) {
      assert.notEqual(matches[0]?.kind, undefined);
      assert.doesNotMatch(matches[0]!.message, /cannibalis/i);
    }
  });

  it("ne renvoie rien pour un sujet sans rapprochement", () => {
    const matches = findEditorialRapprochements(
      "Réglementation maritime des phares islandais en 1820",
      [
        post({
          wpPostId: 4,
          title: "Sécurité des agents IA : risques et bonnes pratiques",
          slug: "securite-agents-ia",
        }),
      ]
    );
    assert.equal(matches.length, 0);
  });

  it("ignore les rapprochements basés seulement sur des mots génériques", () => {
    const matches = findEditorialRapprochements("Guide IA entreprise WordPress", [
      post({
        wpPostId: 5,
        title: "Solution IA digitale pour entreprise",
        slug: "solution-ia-digitale",
        excerpt: "Un guide numérique pour l’entreprise.",
      }),
    ]);
    assert.equal(matches.length, 0);
  });

  it("limite à cinq résultats triés", () => {
    const posts = Array.from({ length: 8 }, (_, index) =>
      post({
        wpPostId: 10 + index,
        title: `Sécurité des agents IA cas ${index + 1}`,
        slug: `securite-agents-ia-${index + 1}`,
        excerpt: "Sécuriser un agent IA en entreprise et ses risques.",
      })
    );
    const matches = findEditorialRapprochements(
      "Comment sécuriser un agent IA en entreprise",
      posts
    );
    assert.ok(matches.length <= 5);
  });

  it("exige une URL http(s) réelle et filtre les sujets trop courts", () => {
    assert.equal(
      scorePublishedPost("Sécurité des agents IA", null, {
        wpPostId: 9,
        title: "Sécurité des agents IA",
        slug: "securite",
        url: "not-a-url",
        excerpt: null,
      }),
      null
    );
    assert.equal(isSubjectSignificant("trop court"), false);
    assert.equal(
      isSubjectSignificant("Comment sécuriser un agent IA en entreprise"),
      true
    );
  });

  it("valide le parsing d’entrée serveur", () => {
    assert.equal(parseEditorialSubjectInput({}).ok, false);
    assert.equal(parseEditorialSubjectInput({ subject: "   " }).ok, false);
    const ok = parseEditorialSubjectInput({
      subject: "  Comment sécuriser un agent IA  ",
      angle: " Angle utile ",
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.subject, "Comment sécuriser un agent IA");
      assert.equal(ok.angle, "Angle utile");
    }
  });

  it("normalise une réponse IA valide et refuse une réponse invalide", () => {
    const candidates: EditorialMatch[] = [
      {
        kind: "close",
        title: "Sécurité des agents IA",
        url: "https://naxialis.com/securite-agents-ia",
        explanation: "Proximité locale",
        message: "msg",
        wpPostId: 42,
        rankScore: 0.6,
      },
    ];
    const normalized = normalizeAiAssessments(
      {
        assessments: [
          {
            wpPostId: 42,
            kind: "probable_duplicate",
            explanation:
              "Les titres décrivent la même intention de sécurisation des agents.",
          },
        ],
      },
      candidates
    );
    assert.equal(normalized[0]?.kind, "probable_duplicate");
    assert.throws(
      () => normalizeAiAssessments({ assessments: [] }, candidates),
      /exploitable/i
    );
    assert.throws(
      () =>
        normalizeAiAssessments(
          {
            assessments: [
              { wpPostId: 99, kind: "close", explanation: "Trop court" },
            ],
          },
          candidates
        ),
      /exploitable/i
    );
  });

  it("API éditoriale et IA sont protégées, sans effet WordPress", () => {
    const check = readSource("app/api/topics/check-duplicates/route.ts");
    assert.match(check, /requireAuth/);
    assert.match(check, /mode === "editorial"|wantsEditorial/);
    assert.match(check, /handleCheckDuplicates/);
    assert.match(check, /checkEditorialRapprochement/);

    const aiRoute = readSource("app/api/topics/analyze-similarity/route.ts");
    assert.match(aiRoute, /requireAuth/);
    assert.match(aiRoute, /analyzeEditorialSimilarityWithAi/);
    assert.doesNotMatch(aiRoute, /create_wordpress_draft|status:\s*"publish"/);

    const aiLib = readSource("lib/topics/editorial-similarity-ai.ts");
    assert.match(aiLib, /npm_lifecycle_event === "test"/);
    assert.match(aiLib, /EDITORIAL_SIMILARITY_MODEL/);

    const engine = readSource("lib/topics/editorial-similarity.ts");
    assert.match(engine, /status:\s*"publish"/);
    assert.doesNotMatch(engine, /create_wordpress_draft/);
  });

  it("UI intègre le panneau sans casser V7.2 / V7.3", () => {
    const panel = readSource("components/EditorialRapprochementPanel.tsx");
    assert.match(panel, /EDITORIAL_CHECK_DEBOUNCE_MS/);
    assert.match(panel, /Analyser plus précisément avec l&apos;IA/);
    assert.match(panel, /Actualiser les articles WordPress/);
    assert.doesNotMatch(panel, /useEffect\(\(\) => \{[\s\S]{0,40}analyze-similarity/);

    const form = readSource("components/ArticleForm.tsx");
    assert.match(form, /EditorialRapprochementPanel/);
    assert.match(form, /TitleSuggestionsPicker/);
    assert.match(form, /Suggérer 5 titres|Suggérer des titres/);

    const queue = readSource("components/TopicQueue.tsx");
    assert.match(queue, /EditorialRapprochementPanel/);
    assert.match(queue, /File|Rédiger|AlertDialog|Trash2/);

    assert.equal(EDITORIAL_SIMILARITY_MODEL.includes("gpt"), true);
    assert.doesNotMatch(
      readSource("prisma/schema.prisma"),
      /EditorialRapprochement|SimilarityCache/
    );
  });

  it("ne modifie pas l’agent ni le brouillon WordPress", () => {
    assert.match(readSource("lib/agent/tools.ts"), /create_wordpress_draft/);
    assert.match(readSource("lib/wordpress.ts"), /status:\s*"draft"/);
  });
});
