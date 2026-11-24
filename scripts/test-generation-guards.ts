import "dotenv/config";
import { db } from "../lib/db.js";
import type { RunAgentSessionResult } from "../lib/agent/run-session.js";
import { processArticleGeneration } from "../lib/generation.js";
import { recoverStaleGenerations } from "../lib/generation-recovery.js";
import { INTERRUPTED_ERROR } from "../lib/generation-errors.js";
import { WORKSPACE_IDS } from "../lib/workspace/constants.js";

const WS = WORKSPACE_IDS.wordpress;

function mockResult(subject: string): RunAgentSessionResult {
  return {
    success: true,
    sessionId: "sess_test_local",
    subject,
    cmsDestination: "wordpress",
    cms: {
      destination: "wordpress",
      externalId: "1",
      status: "draft",
      title: "Titre de test",
      link: "https://example.com/?p=1",
      metaTitle: "Meta title de test",
      metaDescription: "Meta description de test",
      slug: "titre-de-test",
      excerpt: "Extrait de test",
    },
    wordpress: {
      postId: 1,
      status: "draft",
      title: "Titre de test",
      link: "https://example.com/?p=1",
      categories: [],
      metaTitle: "Meta title de test",
      metaDescription: "Meta description de test",
      slug: "titre-de-test",
      excerpt: "Extrait de test",
    },
    detectedCategories: [{ categoryId: 146, name: "PIM et ERP" }],
    model: null,
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
    reasoningTokens: null,
    totalTokens: null,
    estimatedCost: null,
    usageCollection: {
      source: null,
      attempt: 0,
      retries: 0,
      delayMs: 0,
      raw: null,
    },
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const queued = await db.articleGeneration.create({
  data: { workspaceId: WS, subject: "Test claim queued", status: "queued" },
});

const first = processArticleGeneration(queued.id, {
  run: async (subject) => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return mockResult(subject);
  },
});
const second = processArticleGeneration(queued.id, {
  run: async () => {
    throw new Error("Le second appel n’aurait pas dû s’exécuter.");
  },
});

await Promise.all([first, second]);

const afterRace = await db.articleGeneration.findUnique({
  where: { id: queued.id },
});
assert(afterRace?.status === "completed", "La génération concurrente n’est pas completed.");
assert(afterRace.wpPostId === 1, "Le premier claim n’a pas persisté le résultat.");
assert(afterRace.slug === "titre-de-test", "Le slug mock n’a pas été persisté.");
assert(afterRace.excerpt === "Extrait de test", "L’extrait mock n’a pas été persisté.");

await processArticleGeneration(queued.id, {
  run: async () => {
    throw new Error("Une génération completed n’aurait pas dû relancer.");
  },
});
const afterCompleted = await db.articleGeneration.findUnique({
  where: { id: queued.id },
});
assert(
  afterCompleted?.status === "completed",
  "Une génération completed a changé de statut."
);

for (const status of ["running", "failed"] as const) {
  const row = await db.articleGeneration.create({
    data: { workspaceId: WS, subject: `Test claim ${status}`, status },
  });
  await processArticleGeneration(row.id, {
    run: async () => {
      throw new Error(`Une génération ${status} n’aurait pas dû relancer.`);
    },
  });
  const stored = await db.articleGeneration.findUnique({ where: { id: row.id } });
  assert(stored?.status === status, `Une génération ${status} a été relancée.`);
}

const successTopic = await db.topic.create({
  data: { workspaceId: WS, subject: "Topic mock succès", status: "generating" },
});
const successGeneration = await db.articleGeneration.create({
  data: {
    workspaceId: WS,
    subject: successTopic.subject,
    status: "queued",
    topicId: successTopic.id,
  },
});
await processArticleGeneration(successGeneration.id, {
  run: async (subject) => mockResult(subject),
});
const completedTopic = await db.topic.findUnique({
  where: { id: successTopic.id },
});
assert(completedTopic?.status === "completed", "Le Topic n’est pas passé à completed.");

const failTopic = await db.topic.create({
  data: { workspaceId: WS, subject: "Topic mock échec", status: "generating" },
});
const failGeneration = await db.articleGeneration.create({
  data: {
    workspaceId: WS,
    subject: failTopic.subject,
    status: "queued",
    topicId: failTopic.id,
  },
});
await processArticleGeneration(failGeneration.id, {
  run: async () => {
    throw new Error("Erreur volontaire Topic.");
  },
});
const pendingTopic = await db.topic.findUnique({ where: { id: failTopic.id } });
const failedGeneration = await db.articleGeneration.findUnique({
  where: { id: failGeneration.id },
});
assert(pendingTopic?.status === "pending", "Le Topic n’est pas revenu à pending.");
assert(failedGeneration?.status === "failed", "La génération Topic n’est pas failed.");
assert(failedGeneration.error, "L’erreur Topic n’a pas été enregistrée.");
assert(failedGeneration.durationMs !== null, "durationMs manquant sur l’échec Topic.");

const stale = await db.articleGeneration.create({
  data: { workspaceId: WS, subject: "Génération stale", status: "running" },
});
await db.$executeRaw`
  UPDATE "ArticleGeneration"
  SET "updatedAt" = NOW() - INTERVAL '31 minutes'
  WHERE id = ${stale.id}
`;
const recovered = await recoverStaleGenerations();
const staleAfter = await db.articleGeneration.findUnique({
  where: { id: stale.id },
});
assert(recovered >= 1, "recoverStaleGenerations n’a rien récupéré.");
assert(staleAfter?.status === "failed", "La génération stale n’est pas failed.");
assert(
  staleAfter.error === INTERRUPTED_ERROR,
  "Le message d’interruption n’est pas celui attendu."
);
assert(
  staleAfter.progressStage === "failed",
  "progressStage n’est pas failed après recovery."
);
assert(
  staleAfter.progressMessage === "Génération interrompue.",
  "progressMessage d’interruption inattendu."
);

console.log("claim", queued.id, afterCompleted?.status);
console.log("topicSuccess", successTopic.id, completedTopic?.status);
console.log("topicFailure", failTopic.id, pendingTopic?.status, failedGeneration.status);
console.log("stale", stale.id, staleAfter.status);
console.log("ok");
