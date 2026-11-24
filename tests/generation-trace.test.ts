import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { buildArticlePrompt } from "../lib/agent/prompt";
import {
  REPORT_DISCLAIMER,
  SEARCH_IS_NOT_CONSULTATION,
  UNRECORDED_TRACE_MESSAGE,
  buildGenerationReport,
} from "../lib/generation-report";
import {
  MAX_TRACE_PAGES,
  MAX_TRACE_QUERIES,
  assembleGenerationTrace,
  attachObservedEvents,
  completedTraceUpdate,
  contextSnapshot,
  createEventTraceState,
  eventTraceFromState,
  failedTraceUpdate,
  observeAgentEvent,
} from "../lib/generation-trace";
import {
  MAX_GENERATION_NOTES_LENGTH,
  buildGenerationMessage,
} from "../lib/topics/build-generation-context";

const SUBJECT =
  "Comment superviser les agents IA en entreprise : bonnes pratiques et risques";
const ANGLE =
  "Expliquer aux PME comment surveiller les actions des agents IA, mettre en place une traçabilité, définir les validations humaines et limiter les risques opérationnels.";

function veilleInput() {
  return {
    subject: SUBJECT,
    origin: "veille" as const,
    angle: ANGLE,
    notes: "Peu d'entreprises observent le comportement réel de leurs agents.",
    sourceTitle:
      "Agents IA en production : seules 27 % des entreprises voient vraiment ce qu'ils font",
    sourceName: "Exemple",
    sourceUrl: "https://exemple.fr/agents-ia-production",
    sourcePublishedOn: "2026-10-28",
    sourceKind: "news" as const,
  };
}

function searchEvent(query: string, id = "ws_search") {
  return {
    type: "agent.session.turn.item.done",
    item: {
      type: "web_search_call",
      id,
      action: { type: "search", query, queries: null, url: "https://exemple.fr/inventee" },
    },
  };
}

function pageEvent(
  via: "open_page" | "find_in_page",
  url: string | null,
  id: string
) {
  return {
    type: "agent.session.turn.item.done",
    item: {
      type: "web_search_call",
      id,
      action: { type: via, url },
    },
  };
}

describe("rapport de génération", () => {
  it("fige le contexte de veille transmis", () => {
    const input = veilleInput();
    const snapshot = contextSnapshot(input);
    const message = buildGenerationMessage(input);
    assert.equal(snapshot.veilleContextTransmitted, true);
    assert.equal(snapshot.origin, "veille");
    assert.equal(snapshot.subject, SUBJECT);
    assert.equal(snapshot.angle, ANGLE);
    assert.match(snapshot.notes ?? "", /Peu d'entreprises observent/);
    assert.equal(snapshot.sourceUrl, "https://exemple.fr/agents-ia-production");
    assert.match(snapshot.sourceTitle ?? "", /27 %/);
    assert.equal(snapshot.sourceName, "Exemple");
    assert.equal(snapshot.sourcePublishedOn, "2026-10-28");
    assert.equal(snapshot.sourceKind, "news");
    assert.match(message, /https:\/\/exemple\.fr\/agents-ia-production/);
  });

  it("n'enregistre pas de contexte documentaire pour un sujet manuel sans indications", () => {
    const input = {
      subject: SUBJECT,
      origin: null,
      sourceUrl: "https://exemple.fr/ne-doit-pas-partir",
    };
    const message = buildGenerationMessage(input);
    const snapshot = contextSnapshot(input);
    assert.equal(message, SUBJECT);
    assert.equal(buildArticlePrompt(message), buildArticlePrompt(SUBJECT));
    assert.equal(snapshot.veilleContextTransmitted, false);
    assert.equal(snapshot.editorialContextTransmitted, false);
    assert.equal(snapshot.angle, null);
    assert.equal(snapshot.notes, null);
    assert.equal(snapshot.sourceUrl, null);
  });

  it("enregistre les indications éditoriales sans source documentaire", () => {
    const input = {
      subject: "Agents IA pour automatiser la relation client",
      origin: null,
      angle: "Montrer le gain de temps pour une PME.",
      notes: "Opportunité issue du SEO.",
      audience: "Dirigeants de PME",
      sourceUrl: "https://exemple.fr/seo",
    };
    const message = buildGenerationMessage(input);
    const snapshot = contextSnapshot(input);
    assert.match(message, /Indications éditoriales facultatives/);
    assert.equal(snapshot.subject, input.subject);
    assert.equal(snapshot.veilleContextTransmitted, false);
    assert.equal(snapshot.editorialContextTransmitted, true);
    assert.equal(snapshot.sourceUrl, null);
    assert.equal(snapshot.angle, input.angle);
    assert.equal(snapshot.notes, input.notes);
    assert.equal(snapshot.audience, "Dirigeants de PME");
  });

  it("collecte les requêtes web_search et ignore une URL posée sur la recherche", () => {
    const state = createEventTraceState();
    observeAgentEvent(state, {
      type: "agent.session.created",
      session: { id: "sess_trace_1" },
    });
    observeAgentEvent(state, searchEvent("agents IA PME"));
    const trace = eventTraceFromState(state);
    assert.equal(trace.webSearch.observed, true);
    assert.deepEqual(trace.webSearch.queries, ["agents IA PME"]);
    assert.equal(trace.pages.items.length, 0);
    assert.equal(trace.ids.sessionId, "sess_trace_1");
    assert.deepEqual(trace.ids.webSearchCallIds, ["ws_search"]);
  });

  it("collecte les URL de open_page et find_in_page", () => {
    const state = createEventTraceState();
    observeAgentEvent(
      state,
      pageEvent("open_page", "https://exemple.fr/page-ouverte", "ws_open")
    );
    observeAgentEvent(
      state,
      pageEvent("find_in_page", "https://exemple.fr/page-cherchee", "ws_find")
    );
    const trace = eventTraceFromState(state);
    assert.deepEqual(trace.pages.items, [
      { url: "https://exemple.fr/page-ouverte", via: "open_page" },
      { url: "https://exemple.fr/page-cherchee", via: "find_in_page" },
    ]);
  });

  it("n'invente pas d'URL quand l'événement n'en fournit pas", () => {
    const state = createEventTraceState();
    observeAgentEvent(state, searchEvent("https://exemple.fr/pas-une-consultation", "ws_q"));
    observeAgentEvent(state, pageEvent("open_page", null, "ws_empty"));
    observeAgentEvent(state, pageEvent("find_in_page", "   ", "ws_blank"));
    observeAgentEvent(state, {
      type: "agent.session.turn.output_text.done",
      text: "Source citée : https://exemple.fr/dans-le-texte",
    });
    observeAgentEvent(state, {
      type: "agent.session.turn.item.done",
      item: {
        type: "function_call",
        name: "create_wordpress_draft",
        arguments: JSON.stringify({
          content: "<p>https://exemple.fr/dans-le-brouillon</p>",
          secret: "sk-test-secret",
        }),
      },
    });
    const trace = eventTraceFromState(state);
    assert.equal(trace.pages.items.length, 0);
    assert.deepEqual(trace.webSearch.queries, [
      "https://exemple.fr/pas-une-consultation",
    ]);
    assert.equal(JSON.stringify(trace).includes("sk-test-secret"), false);
    assert.equal(JSON.stringify(trace).includes("dans-le-brouillon"), false);
    assert.equal(JSON.stringify(trace).includes("dans-le-texte"), false);
  });

  it("déduplique les événements et limite le volume", () => {
    const state = createEventTraceState();
    observeAgentEvent(state, searchEvent("requête répétée", "ws_same"));
    observeAgentEvent(state, {
      type: "agent.session.turn.item.added",
      item: searchEvent("requête répétée", "ws_same").item,
    });
    observeAgentEvent(
      state,
      pageEvent("open_page", "https://user:pass@exemple.fr/ouverte", "ws_open")
    );
    observeAgentEvent(
      state,
      pageEvent("open_page", "https://exemple.fr/ouverte", "ws_open_again")
    );
    for (let index = 0; index < MAX_TRACE_QUERIES + 5; index += 1) {
      observeAgentEvent(state, searchEvent(`requête ${index}`, `ws_q_${index}`));
    }
    for (let index = 0; index < MAX_TRACE_PAGES + 5; index += 1) {
      observeAgentEvent(
        state,
        pageEvent("open_page", `https://exemple.fr/p/${index}`, `ws_p_${index}`)
      );
    }
    const trace = eventTraceFromState(state);
    assert.equal(trace.webSearch.queries.filter((query) => query === "requête répétée").length, 1);
    assert.equal(trace.webSearch.queries.length, MAX_TRACE_QUERIES);
    assert.equal(trace.webSearch.truncated, true);
    assert.equal(trace.pages.items.length, MAX_TRACE_PAGES);
    assert.equal(trace.pages.truncated, true);
    assert.equal(
      trace.pages.items.some((page) => page.url.includes("user:pass")),
      false
    );
    assert.equal(
      trace.pages.items.some((page) => page.url === "https://exemple.fr/ouverte"),
      true
    );
  });

  it("ignore le raisonnement interne", () => {
    const state = createEventTraceState();
    observeAgentEvent(state, {
      type: "agent.session.turn.reasoning_summary_text.delta",
      delta: "RAISONNEMENT_INTERNE_SECRET",
    });
    const trace = eventTraceFromState(state);
    assert.equal(JSON.stringify(trace).includes("RAISONNEMENT_INTERNE_SECRET"), false);
    assert.equal(trace.webSearch.observed, false);
  });

  it("conserve les traces partielles quand la génération échoue", () => {
    const state = createEventTraceState();
    observeAgentEvent(state, searchEvent("contrôle des agents", "ws_partial"));
    observeAgentEvent(
      state,
      pageEvent("open_page", "https://exemple.fr/ouverte-avant-echec", "ws_partial_page")
    );
    const error = new Error("Tour OpenAI échoué.");
    attachObservedEvents(
      error,
      eventTraceFromState(state, "sess_partial"),
      "draft",
      { postId: 88, link: "https://naxialis.com/?p=88" }
    );
    const stored = failedTraceUpdate(contextSnapshot(veilleInput()), error);
    assert.equal(stored.trace.context.sourceUrl, "https://exemple.fr/agents-ia-production");
    assert.deepEqual(stored.trace.webSearch.queries, ["contrôle des agents"]);
    assert.equal(stored.trace.pages.items[0]?.url, "https://exemple.fr/ouverte-avant-echec");
    assert.equal(stored.trace.ids.sessionId, "sess_partial");
    assert.equal(stored.wpStatus, "draft");
    assert.equal(stored.wpPostId, 88);
    assert.equal(stored.wpUrl, "https://naxialis.com/?p=88");
    assert.equal(error.message, "Tour OpenAI échoué.");
  });

  it("affiche le rapport d'une génération terminée sans événement web", () => {
    const context = contextSnapshot({
      subject: SUBJECT,
      origin: "veille",
      angle: ANGLE,
    });
    const stored = completedTraceUpdate(context, null, "draft");
    assert.equal(stored.trace.version, 1);
    assert.equal(stored.trace.context.subject, SUBJECT);
    assert.equal(stored.trace.context.angle, ANGLE);
    assert.deepEqual(stored.trace.webSearch.queries, []);
    assert.deepEqual(stored.trace.pages.items, []);
    assert.equal(stored.trace.webSearch.observed, false);
    assert.equal(stored.wpStatus, "draft");
    const report = buildGenerationReport({
      trace: stored.trace,
      status: "completed",
      wpPostId: 6146,
      wpUrl: "https://naxialis.com/?p=6146",
      wpStatus: stored.wpStatus,
    });
    assert.equal(report.recorded, true);
    assert.equal(report.unrecordedMessage, null);
    assert.equal(
      report.contextLines.find((line) => line.label === "Titre demandé")?.value,
      SUBJECT
    );
    assert.deepEqual(report.queries, []);
    assert.deepEqual(report.pages, []);
    assert.equal(report.queriesNote, "Aucun appel web_search observé.");
    assert.equal(report.wordpress.statusAtCreation, "draft");
    assert.equal(report.wordpress.id, "#6146");
    const page = readFileSync(
      resolve("app/(protected)/articles/[id]/page.tsx"),
      "utf8"
    );
    const database = readFileSync(resolve("lib/db.ts"), "utf8");
    assert.match(page, /trace=\{article\.trace\}/);
    assert.match(page, /wpStatus=\{article\.wpStatus\}/);
    assert.ok(
      database.indexOf("prismaToken === PRISMA_CLIENT_TOKEN") <
        database.indexOf("const importedMatches")
    );
  });

  it("enregistre le statut WordPress renvoyé, pas une valeur imposée ensuite", () => {
    const context = contextSnapshot({ subject: SUBJECT, origin: null });
    const draft = completedTraceUpdate(context, null, "draft");
    const other = completedTraceUpdate(context, null, "future");
    assert.equal(draft.wpStatus, "draft");
    assert.equal(other.wpStatus, "future");
    assert.equal(draft.trace.context.veilleContextTransmitted, false);
    assert.equal(draft.trace.webSearch.observed, false);
  });

  it("affiche l'absence de traces sans conclure qu'aucune recherche n'a eu lieu", () => {
    const report = buildGenerationReport({
      trace: null,
      status: "completed",
      wpPostId: 42,
      wpUrl: "https://naxialis.com/?p=42",
      wpStatus: null,
    });
    assert.equal(report.recorded, false);
    assert.equal(report.unrecordedMessage, UNRECORDED_TRACE_MESSAGE);
    assert.equal(report.queriesNote, null);
    assert.equal(report.pagesNote, null);
    assert.equal(report.searchObserved, null);
    assert.equal(report.wordpress.id, "#42");
    assert.equal(report.wordpress.url, "https://naxialis.com/?p=42");
    assert.equal(report.wordpress.statusAtCreation, "non enregistré");
    assert.match(report.statusNote, /moment de la création/);
    assert.match(report.statusNote, /actuel/);
    assert.equal(report.disclaimer, REPORT_DISCLAIMER);
  });

  it("distingue les requêtes observées des pages ouvertes", () => {
    const trace = assembleGenerationTrace(contextSnapshot(veilleInput()), {
      webSearch: {
        observed: true,
        queries: ["supervision des agents IA"],
        truncated: false,
      },
      pages: {
        items: [{ url: "https://exemple.fr/ouverte", via: "open_page" }],
        truncated: false,
      },
      ids: { sessionId: "sess_report", webSearchCallIds: ["ws_1"] },
    });
    const report = buildGenerationReport({
      trace,
      status: "completed",
      wpPostId: 7,
      wpUrl: "https://naxialis.com/?p=7",
      wpStatus: "draft",
    });
    assert.equal(report.recorded, true);
    assert.equal(report.unrecordedMessage, null);
    assert.equal(
      report.contextLines.find((line) => line.label === "URL transmise")?.value,
      "https://exemple.fr/agents-ia-production"
    );
    assert.deepEqual(report.queries, ["supervision des agents IA"]);
    assert.equal(report.pages[0]?.url, "https://exemple.fr/ouverte");
    assert.equal(report.pages[0]?.via, "open_page");
    assert.equal(report.searchIsNotConsultation, SEARCH_IS_NOT_CONSULTATION);
    assert.equal(report.wordpress.statusAtCreation, "draft");
    assert.doesNotMatch(report.disclaimer, /toutes les affirmations ont été vérifiées/);
  });

  it("tronque les notes réellement transmises et écarte une URL non http", () => {
    const notes = "note ".repeat(800);
    const snapshot = contextSnapshot({
      subject: SUBJECT,
      origin: "veille",
      notes,
      sourceUrl: "javascript:alert(1)",
    });
    assert.equal(snapshot.sourceUrl, null);
    assert.ok((snapshot.notes ?? "").length <= MAX_GENERATION_NOTES_LENGTH + 1);
    assert.equal((snapshot.notes ?? "").endsWith("…"), true);
  });

  it("ne modifie pas l'agent et n'ajoute pas d'appel OpenAI", () => {
    const session = readFileSync(resolve("lib/agent/run-session.ts"), "utf8");
    const wordpress = readFileSync(resolve("lib/wordpress.ts"), "utf8");
    const generation = readFileSync(resolve("lib/generation.ts"), "utf8");
    const trace = readFileSync(resolve("lib/generation-trace.ts"), "utf8");
    const tools = readFileSync(resolve("lib/agent/tools.ts"), "utf8");
    const prompt = readFileSync(resolve("lib/agent/prompt.ts"), "utf8");
    const calls =
      session.match(
        /(?:openai|client)\.beta\.agents\.[A-Za-z0-9_.]+/g
      ) ?? [];
    assert.deepEqual(
      [...new Set(calls.map((c) => c.replace(/^client\./, "openai.")))].sort(),
      [
        "openai.beta.agents.sessions.create",
        "openai.beta.agents.sessions.events.create",
        "openai.beta.agents.sessions.retrieve",
        "openai.beta.agents.sessions.turns.list",
      ].sort()
    );
    assert.doesNotMatch(session, /sessions\.items|agents\.update/);
    // V7.9.1 : agent + outils issus du registre CMS (pas de bascule silencieuse).
    assert.match(session, /resolveEditorialAgentForDestination/);
    assert.match(session, /agent_id:\s*editorialAgent\.agentId/);
    assert.match(session, /tools:\s*editorialAgent\.tools/);
    assert.match(session, /buildArticlePrompt/);
    assert.match(session, /observeAgentEvent/);
    assert.match(wordpress, /status:\s*"draft"/);
    assert.doesNotMatch(wordpress, /status:\s*"publish"/);
    assert.match(generation, /status: "completed"/);
    assert.match(generation, /status: "failed"/);
    assert.match(generation, /completedTraceUpdate/);
    assert.match(generation, /failedTraceUpdate/);
    assert.doesNotMatch(trace, /openai|fetch\(|sessions\.items|createWordPressDraft/);
    assert.match(tools, /web_search/);
    assert.match(tools, /create_wordpress_draft/);
    assert.doesNotMatch(prompt, /generation-trace|sessions\.items/);
  });
});
