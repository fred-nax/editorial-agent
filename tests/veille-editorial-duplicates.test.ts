import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import {
  suggestionDuplicateLabel,
  SUGGESTION_SOURCE_LABELS,
} from "../components/VeilleSuggestionDialog";
import { handleCreateTopic, type TopicStore } from "../lib/topics/create";
import {
  checkProposals,
  handleCheckDuplicates,
  hasSimilar,
  queueHasExact,
  resolveInventoryCoverage,
  type CorpusRecord,
  type DuplicateCheckBody,
  type EditorialCorpus,
  type ProposalInput,
} from "../lib/veille/editorial-duplicates";

function record(overrides: Partial<CorpusRecord> & Pick<CorpusRecord, "source" | "title">): CorpusRecord {
  return {
    subject: overrides.subject ?? overrides.title,
    angle: null,
    intent: null,
    url: null,
    slug: null,
    wpPostId: null,
    topicId: null,
    generationTopicId: null,
    ...overrides,
  };
}

function corpus(records: CorpusRecord[], coverage: EditorialCorpus["coverage"] = "available"): EditorialCorpus {
  return {
    records,
    coverage,
    coverageNote:
      coverage === "available"
        ? "Inventaire WordPress disponible pour la comparaison locale."
        : "Vérification partielle.",
    verified: coverage !== "unavailable",
  };
}

function proposal(overrides: Partial<ProposalInput> & Pick<ProposalInput, "title">): ProposalInput {
  return { angle: null, intent: null, ...overrides };
}

function memoryStore() {
  const created: unknown[] = [];
  const store: TopicStore = {
    async findExactSource() {
      return null;
    },
    async create(data) {
      created.push(data);
      return { ...data, id: "topic_1", status: "pending", priority: 0 };
    },
  };
  return { store, created };
}

const veilleBody = {
  subject: "Comment superviser les agents IA",
  angle: "Mettre en place une supervision humaine",
  notes: "Un résumé documentaire.",
  category: "agents IA",
  origin: "veille" as const,
  sourceUrl: "https://exemple.fr/supervision-agents",
  sourceTitle: "Publication source différente",
  sourceName: "Exemple",
  sourcePublishedOn: "2026-11-01",
  sourceKind: "news",
};

describe("doublons éditoriaux de la veille", () => {
  it("reconnaît un titre identique, y compris la casse et les accents", () => {
    const same = checkProposals(
      [proposal({ title: "Sécurité des agents IA" })],
      corpus([record({ source: "topic", title: "Sécurité des agents IA", topicId: "topic_a" })])
    );
    assert.equal(same[0]?.level, "exact");
    assert.equal(queueHasExact(same[0]!), true);

    const folded = checkProposals(
      [proposal({ title: "Sécurité des agents IA" })],
      corpus([record({ source: "wordpress", title: "securite des agents ia", url: "https://naxialis.com/securite", wpPostId: 12, slug: "securite-des-agents-ia" })])
    );
    assert.equal(folded[0]?.level, "exact");
    assert.equal(folded[0]?.matches[0]?.source, "wordpress");
    assert.equal(queueHasExact(folded[0]!), false);
  });

  it("signale des titres proches avec la même intention, sans les traiter comme exacts", () => {
    const result = checkProposals(
      [
        proposal({
          title: "Comment superviser les agents IA",
          intent: "Mettre en place une supervision humaine des actions",
        }),
      ],
      corpus([
        record({
          source: "topic",
          title: "Superviser les agents IA en entreprise",
          angle: "Mettre en place une supervision humaine des actions",
          topicId: "topic_b",
        }),
      ])
    );
    assert.equal(result[0]?.level, "similar");
    assert.equal(result[0]?.matches[0]?.level, "similar");
    assert.match(result[0]?.matches[0]?.explanation ?? "", /intention|angle|termes/i);
  });

  it("ne signale pas une simple thématique commune", () => {
    const result = checkProposals(
      [
        proposal({
          title: "Choisir un hébergement pour des agents IA",
          intent: "Comparer les offres d'hébergement",
        }),
      ],
      corpus([
        record({
          source: "topic",
          title: "Former les équipes à l'usage des agents IA",
          angle: "Construire un parcours de formation interne",
          intent: "Organiser la montée en compétence des salariés",
          topicId: "topic_c",
        }),
      ])
    );
    assert.equal(result[0]?.level, "none");
    assert.equal(result[0]?.matches.length, 0);
  });

  it("retrouve un doublon de file, WordPress et historique, puis déduplique", () => {
    const queue = checkProposals(
      [proposal({ title: "Checklist de clôture comptable" })],
      corpus([record({ source: "topic", title: "Checklist de clôture comptable", topicId: "topic_d" })])
    );
    assert.equal(queue[0]?.matches[0]?.source, "topic");

    const history = checkProposals(
      [proposal({ title: "Préparer un plan de reprise" })],
      corpus([
        record({
          source: "generation",
          title: "Préparer un plan de reprise",
          url: "https://naxialis.com/?p=80",
          wpPostId: 80,
          generationTopicId: "topic_old",
        }),
      ])
    );
    assert.equal(history[0]?.matches[0]?.source, "generation");

    const duplicated = checkProposals(
      [proposal({ title: "Préparer un plan de reprise" })],
      corpus([
        record({
          source: "wordpress",
          title: "Préparer un plan de reprise",
          url: "https://naxialis.com/plan-reprise",
          wpPostId: 80,
          slug: "preparer-un-plan-de-reprise",
        }),
        record({
          source: "generation",
          title: "Préparer un plan de reprise",
          url: "https://naxialis.com/?p=80",
          wpPostId: 80,
          generationTopicId: "topic_old",
        }),
        record({
          source: "topic",
          title: "Préparer un plan de reprise",
          topicId: "topic_old",
        }),
      ])
    );
    assert.equal(duplicated[0]?.matches.length, 2);
    assert.deepEqual(
      duplicated[0]?.matches.map((match) => match.source),
      ["wordpress", "topic"]
    );
  });

  it("compare trois propositions dans le même corpus", () => {
    const results = checkProposals(
      [
        proposal({ title: "Checklist de clôture comptable" }),
        proposal({
          title: "Comment superviser les agents IA",
          intent: "Mettre en place une supervision humaine des actions",
        }),
        proposal({
          title: "Choisir un hébergement pour des agents IA",
          intent: "Comparer les offres d'hébergement",
        }),
      ],
      corpus([
        record({ source: "topic", title: "Checklist de clôture comptable", topicId: "topic_d" }),
        record({
          source: "topic",
          title: "Superviser les agents IA en entreprise",
          angle: "Mettre en place une supervision humaine des actions",
          topicId: "topic_b",
        }),
      ])
    );
    assert.deepEqual(
      results.map((result) => result.level),
      ["exact", "similar", "none"]
    );
    assert.ok(results.every((result) => result.matches.length <= 3));
  });

  it("distingue un inventaire disponible, partiel et indisponible", () => {
    const available = resolveInventoryCoverage({
      count: 80,
      running: false,
      truncated: false,
      lastSync: {
        status: "completed",
        mode: "full",
        expectedTotal: 80,
        fetchedCount: 80,
        diagnosticNote: null,
      },
    });
    const partial = resolveInventoryCoverage({
      count: 40,
      running: false,
      truncated: false,
      lastSync: {
        status: "completed",
        mode: "full",
        expectedTotal: 80,
        fetchedCount: 40,
        diagnosticNote: null,
      },
    });
    const failed = resolveInventoryCoverage({
      count: 0,
      running: false,
      truncated: false,
      lastSync: {
        status: "failed",
        mode: "full",
        expectedTotal: null,
        fetchedCount: 0,
        diagnosticNote: null,
      },
    });
    const limited = resolveInventoryCoverage({
      count: 2500,
      running: false,
      truncated: true,
      lastSync: {
        status: "completed",
        mode: "full",
        expectedTotal: 2500,
        fetchedCount: 2500,
        diagnosticNote: null,
      },
    });
    const incremental = resolveInventoryCoverage({
      count: 89,
      running: false,
      truncated: false,
      lastSync: {
        status: "completed",
        mode: "incremental",
        expectedTotal: 5,
        fetchedCount: 4,
        diagnosticNote:
          "Incohérence WP pour « draft » (context=edit) : X-WP-Total=2, récupérés=1. Sync incrémentale.",
      },
    });
    assert.equal(available.coverage, "available");
    assert.equal(available.verified, true);
    assert.equal(partial.coverage, "partial");
    assert.match(partial.coverageNote, /80 articles annoncés/);
    assert.match(partial.coverageNote, /pas établie/);
    assert.equal(failed.coverage, "unavailable");
    assert.equal(failed.verified, false);
    assert.equal(limited.coverage, "partial");
    assert.equal(incremental.coverage, "partial");
    assert.match(incremental.coverageNote, /incrémentale/);
    assert.match(incremental.coverageNote, /pas établie/);
  });

  it("affiche les badges et les états de couverture sans présenter une vérification partielle comme complète", () => {
    const availableNone: DuplicateCheckBody = {
      coverage: "available",
      coverageNote: "Inventaire disponible.",
      verified: true,
      results: [{ level: "none", matches: [] }],
    };
    const partialNone: DuplicateCheckBody = {
      coverage: "partial",
      coverageNote: "Vérification partielle.",
      verified: true,
      results: [{ level: "none", matches: [] }],
    };
    const similar: DuplicateCheckBody = {
      coverage: "partial",
      coverageNote: "Vérification partielle.",
      verified: true,
      results: [
        {
          level: "similar",
          matches: [
            {
              level: "similar",
              source: "topic",
              title: "Superviser les agents IA",
              url: null,
              explanation: "les titres se recouvrent fortement.",
              wpPostId: null,
              topicId: "topic_a",
            },
          ],
        },
      ],
    };
    assert.deepEqual(suggestionDuplicateLabel(availableNone.results[0], availableNone, false, false), {
      kind: "none",
      text: "Aucun rapprochement détecté.",
    });
    assert.deepEqual(suggestionDuplicateLabel(partialNone.results[0], partialNone, false, false), {
      kind: "partial",
      text: "Vérification partielle.",
    });
    assert.deepEqual(suggestionDuplicateLabel(similar.results[0], similar, false, false), {
      kind: "badge",
      text: "similar",
    });
    assert.deepEqual(
      suggestionDuplicateLabel(undefined, null, false, true),
      { kind: "pending", text: "Vérification des doublons…" }
    );
    assert.deepEqual(
      suggestionDuplicateLabel(undefined, null, true, false),
      { kind: "unavailable", text: "Vérification indisponible." }
    );
    assert.equal(SUGGESTION_SOURCE_LABELS.topic, "File éditoriale");
    assert.equal(SUGGESTION_SOURCE_LABELS.wordpress, "WordPress");
    assert.equal(SUGGESTION_SOURCE_LABELS.generation, "Historique");

    const dialog = readFileSync(resolve("components/VeilleSuggestionDialog.tsx"), "utf8");
    assert.match(dialog, /Doublon exact/);
    assert.match(dialog, /Sujet proche/);
    assert.match(dialog, /border-orange-200 bg-orange-50/);
    assert.match(dialog, /border-red-200 bg-red-50/);
    assert.match(dialog, /File éditoriale/);
    assert.doesNotMatch(dialog, /Aucun rapprochement significatif détecté/);
  });

  it("refuse le doublon exact de la file et confirme seulement un sujet proche", async () => {
    const { store, created } = memoryStore();
    const exact = await handleCreateTopic(
      new Request("http://local/api/topics", {
        method: "POST",
        body: JSON.stringify({ ...veilleBody, confirmSimilar: true }),
      }),
      {
        authenticated: true,
        store,
        async assess() {
          return {
            queueExact: true,
            similar: false,
            matches: [
              {
                level: "exact",
                source: "topic",
                title: veilleBody.subject,
                url: null,
                explanation: "Le titre normalisé est identique à un titre ou à un sujet déjà enregistré.",
                wpPostId: null,
                topicId: "topic_file",
              },
            ],
            coverage: "available",
            coverageNote: "Inventaire disponible.",
          };
        },
      }
    );
    assert.equal(exact.status, 409);
    assert.equal(exact.body.code, "exact_topic");
    assert.equal(exact.body.requiresConfirmation, false);
    assert.equal(created.length, 0);

    let calls = 0;
    const first = await handleCreateTopic(
      new Request("http://local/api/topics", {
        method: "POST",
        body: JSON.stringify(veilleBody),
      }),
      {
        authenticated: true,
        store,
        async assess(input) {
          calls += 1;
          assert.equal(input.title, veilleBody.subject);
          return {
            queueExact: false,
            similar: true,
            matches: [
              {
                level: "similar",
                source: "wordpress",
                title: "Superviser les agents IA",
                url: "https://naxialis.com/supervision",
                explanation: "les titres se recouvrent fortement.",
                wpPostId: 4,
                topicId: null,
              },
            ],
            coverage: "partial",
            coverageNote: "Vérification partielle.",
          };
        },
      }
    );
    assert.equal(first.status, 409);
    assert.equal(first.body.code, "similar");
    assert.equal(first.body.requiresConfirmation, true);
    assert.equal(created.length, 0);

    const renamed = { ...veilleBody, subject: "Former les équipes à l'usage des agents IA" };
    const second = await handleCreateTopic(
      new Request("http://local/api/topics", {
        method: "POST",
        body: JSON.stringify({ ...renamed, confirmSimilar: true }),
      }),
      {
        authenticated: true,
        store,
        async assess(input) {
          calls += 1;
          assert.equal(input.title, renamed.subject);
          return {
            queueExact: false,
            similar: input.title === veilleBody.subject,
            matches: [],
            coverage: "available",
            coverageNote: "Inventaire disponible.",
          };
        },
      }
    );
    assert.equal(second.status, 201);
    assert.equal(second.body.topic?.subject, renamed.subject);
    assert.equal(created.length, 1);
    assert.equal(calls, 2);
  });

  it("avertit sans bloquer un doublon exact WordPress ou historique", async () => {
    const folded = checkProposals(
      [proposal({ title: "Sécurité des agents IA" })],
      corpus([
        record({
          source: "wordpress",
          title: "Sécurité des agents IA",
          url: "https://naxialis.com/securite",
          wpPostId: 12,
          slug: "securite-des-agents-ia",
        }),
        record({
          source: "generation",
          title: "Autre sujet distant",
          subject: "Autre sujet distant",
        }),
      ])
    );
    assert.equal(folded[0]?.level, "exact");
    assert.equal(queueHasExact(folded[0]!), false);
    assert.equal(hasSimilar(folded[0]!), false);

    const { store, created } = memoryStore();
    const createdWp = await handleCreateTopic(
      new Request("http://local/api/topics", {
        method: "POST",
        body: JSON.stringify(veilleBody),
      }),
      {
        authenticated: true,
        store,
        async assess() {
          return {
            queueExact: false,
            similar: false,
            matches: folded[0]!.matches,
            coverage: "available",
            coverageNote: "Inventaire disponible.",
          };
        },
      }
    );
    assert.equal(createdWp.status, 201);
    assert.equal(created.length, 1);

    const history = checkProposals(
      [proposal({ title: "Guide MCP pour les agents" })],
      corpus([
        record({
          source: "generation",
          title: "Guide MCP pour les agents",
          subject: "Guide MCP pour les agents",
          url: "https://naxialis.com/mcp",
          wpPostId: 99,
        }),
      ])
    );
    assert.equal(history[0]?.level, "exact");
    assert.equal(queueHasExact(history[0]!), false);
  });

  it("invalide la confirmation après modification et évite les doubles soumissions", () => {
    const dialog = readFileSync(resolve("components/TopicProposalDialog.tsx"), "utf8");
    assert.match(dialog, /savingRef/);
    assert.match(dialog, /setPendingSimilar\(null\)/);
    assert.match(dialog, /editSubject/);
    assert.match(dialog, /editAngle/);
    assert.match(dialog, /confirmSimilar: true/);
    assert.match(dialog, /exact_topic/);
    assert.match(dialog, /requiresConfirmation/);
    assert.match(dialog, /disabled=\{saving \|\| pendingSimilar !== null\}/);
    assert.match(dialog, /Doublon exact hors file/);
    assert.match(dialog, /File éditoriale/);
    assert.match(dialog, /Confirmer l’ajout du sujet proche/);
  });

  it("laisse inchangés les sujets manuels et le passage SEO vers la file", async () => {
    const { store, created } = memoryStore();
    let assessed = 0;
    const manual = await handleCreateTopic(
      new Request("http://local/api/topics", {
        method: "POST",
        body: JSON.stringify({ subject: "Sujet saisi à la main" }),
      }),
      {
        authenticated: true,
        store,
        async assess() {
          assessed += 1;
          throw new Error("ne doit pas vérifier un sujet manuel");
        },
      }
    );
    assert.equal(manual.status, 201);
    assert.equal(manual.body.topic?.origin, null);
    assert.equal(assessed, 0);
    assert.equal(created.length, 1);
    const queue = readFileSync(resolve("lib/seo/queue.ts"), "utf8");
    const scoring = readFileSync(resolve("lib/seo/scoring.ts"), "utf8");
    const engine = readFileSync(resolve("lib/veille/editorial-duplicates.ts"), "utf8");
    const corpus = readFileSync(resolve("lib/veille/editorial-corpus.ts"), "utf8");
    assert.doesNotMatch(queue, /editorial-duplicates|assessVeilleProposal/);
    assert.doesNotMatch(scoring, /editorial-duplicates/);
    assert.doesNotMatch(engine, /openai|processWordPressInventorySync|contentText|from ["']\.\.\/db/);
    assert.doesNotMatch(corpus, /openai|processWordPressInventorySync|contentText/);
    assert.match(engine, /compareEditorialSimilarity/);
    assert.match(corpus, /getWordPressInventoryDiagnostic/);
    assert.match(corpus, /status: \{ not: "archived" \}/);
  });

  it("exige une authentification et isole les erreurs HTTP", async () => {
    const denied = await handleCheckDuplicates(
      new Request("http://local/api/topics/check-duplicates", {
        method: "POST",
        body: JSON.stringify({ proposals: [{ title: "Un titre assez long" }] }),
      }),
      { authenticated: false, async load() { throw new Error("base"); } }
    );
    assert.equal(denied.status, 401);

    let loads = 0;
    const checked = await handleCheckDuplicates(
      new Request("http://local/api/topics/check-duplicates", {
        method: "POST",
        body: JSON.stringify({
          proposals: [
            { title: "Premier titre original" },
            { title: "Deuxième titre original" },
            { title: "Troisième titre original" },
          ],
        }),
      }),
      {
        authenticated: true,
        async load() {
          loads += 1;
          return corpus([]);
        },
      }
    );
    assert.equal(checked.status, 200);
    assert.equal(loads, 1);
    assert.equal(checked.body.results?.length, 3);
    assert.equal(checked.body.verified, true);

    const invalid = await handleCheckDuplicates(
      new Request("http://local/api/topics/check-duplicates", {
        method: "POST",
        body: JSON.stringify({ proposals: [] }),
      }),
      { authenticated: true, async load() { return corpus([]); } }
    );
    assert.equal(invalid.status, 400);

    const broken = await handleCheckDuplicates(
      new Request("http://local/api/topics/check-duplicates", {
        method: "POST",
        body: JSON.stringify({ proposals: [{ title: "Titre vérifiable" }] }),
      }),
      {
        authenticated: true,
        async load() {
          throw new Error("password=secret");
        },
      }
    );
    assert.equal(broken.status, 503);
    assert.equal(broken.body.verified, false);
    assert.equal(broken.body.results, undefined);
    assert.doesNotMatch(broken.body.error ?? "", /password|secret/);

    const { store, created } = memoryStore();
    const createFailed = await handleCreateTopic(
      new Request("http://local/api/topics", {
        method: "POST",
        body: JSON.stringify(veilleBody),
      }),
      {
        authenticated: true,
        store,
        async assess() {
          throw new Error("database password");
        },
      }
    );
    assert.equal(createFailed.status, 503);
    assert.equal(created.length, 0);
    assert.doesNotMatch(createFailed.body.error ?? "", /password/);
  });
});
