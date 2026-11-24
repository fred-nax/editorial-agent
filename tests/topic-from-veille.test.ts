import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import {
  createTopic,
  handleCreateTopic,
  topicCreateMessage,
  TopicCreateError,
  type StoredTopic,
  type TopicCreateData,
  type TopicStore,
} from "../lib/topics/create";
import { buildTopicProposal, toTopicCreateBody } from "../lib/veille/topic-proposal";
import type { VeilleArticle } from "../lib/veille/types";

function article(overrides: Partial<VeilleArticle> = {}): VeilleArticle {
  return {
    title: "Guide des agents IA",
    sourceName: "Les Echos",
    url: "https://lesechos.fr/tech/guide-agents",
    summary: "Une méthode pour déployer un agent dans une PME.",
    event: "Angle opérationnel",
    kind: "guide",
    publishedOn: "2026-11-01",
    dateVerified: true,
    ...overrides,
  };
}

function memoryStore(initial: StoredTopic[] = []) {
  const topics = [...initial];
  const created: TopicCreateData[] = [];
  const store: TopicStore = {
    async findExactSource(sourceUrl, subject) {
      return (
        topics.find(
          (topic) =>
            topic.sourceUrl === sourceUrl &&
            topic.subject.toLowerCase() === subject.toLowerCase()
        ) ?? null
      );
    },
    async create(data) {
      created.push(data);
      const topic: StoredTopic = {
        ...data,
        id: `topic_${topics.length + 1}`,
        status: "pending",
        priority: 0,
      };
      topics.push(topic);
      return topic;
    },
  };
  return { store, topics, created };
}

const veilleBody = () =>
  toTopicCreateBody(buildTopicProposal(article(), "agents IA"), {
    subject: "Guide SEO : agents IA en PME",
    angle: "Montrer les étapes concrètes",
  });

describe("sujet issu de la veille", () => {
  it("prépare un titre et un angle modifiables sans appel OpenAI", () => {
    const proposal = buildTopicProposal(article(), "agents IA");
    const body = toTopicCreateBody(proposal, {
      subject: "Titre corrigé",
      angle: "Angle corrigé",
    });
    assert.equal(body.subject, "Titre corrigé");
    assert.equal(body.angle, "Angle corrigé");
    assert.equal(body.notes, proposal.summary);
    assert.equal(body.origin, "veille");
    assert.equal(body.sourceUrl, "https://lesechos.fr/tech/guide-agents");
    assert.equal(body.sourcePublishedOn, "2026-11-01");
    assert.equal(body.sourceKind, "guide");
    const dialog = readFileSync(resolve("components/TopicProposalDialog.tsx"), "utf8");
    assert.match(dialog, /Ajouter à la file/);
    assert.match(dialog, /Titre SEO proposé/);
    assert.doesNotMatch(dialog, /openai|runAgentSession|createWordPressDraft/i);
  });

  it("enregistre le sujet en attente avec ses métadonnées", async () => {
    const { store, created } = memoryStore();
    const topic = await createTopic(veilleBody(), store);
    assert.equal(topic.status, "pending");
    assert.equal(topic.subject, "Guide SEO : agents IA en PME");
    assert.equal(topic.angle, "Montrer les étapes concrètes");
    assert.equal(topic.notes, "Une méthode pour déployer un agent dans une PME.");
    assert.equal(topic.origin, "veille");
    assert.equal(topic.sourceName, "Les Echos");
    assert.equal(topic.sourceTitle, "Guide des agents IA");
    assert.equal(topic.sourceKind, "guide");
    assert.equal(topic.sourcePublishedOn, "2026-11-01");
    assert.equal(created.length, 1);
  });

  it("refuse un doublon exact et accepte un autre titre pour la même publication", async () => {
    const { store, created } = memoryStore();
    const first = await createTopic(veilleBody(), store);
    await assert.rejects(
      () => createTopic({ ...veilleBody(), subject: "guide seo : agents ia en pme" }, store),
      (error: unknown) => {
        assert.ok(error instanceof TopicCreateError);
        assert.equal(error.status, 409);
        assert.equal(error.topicId, first.id);
        return true;
      }
    );
    assert.equal(created.length, 1);
    const second = await createTopic(
      { ...veilleBody(), subject: "Autre angle : limites des agents IA" },
      store
    );
    assert.equal(second.origin, "veille");
    assert.equal(second.sourceUrl, first.sourceUrl);
    assert.equal(created.length, 2);
  });

  it("valide les données et laisse les sujets manuels inchangés", async () => {
    const { store, created } = memoryStore();
    await assert.rejects(
      () => createTopic({ subject: "  " }, store),
      (error: unknown) => error instanceof TopicCreateError && error.status === 400
    );
    await assert.rejects(
      () => createTopic({ ...veilleBody(), sourceUrl: "javascript:alert(1)" }, store),
      (error: unknown) => error instanceof TopicCreateError && error.status === 400
    );
    await assert.rejects(
      () => createTopic({ ...veilleBody(), sourcePublishedOn: "01/11/2026" }, store),
      (error: unknown) => error instanceof TopicCreateError && error.status === 400
    );
    const manual = await createTopic({ subject: "Sujet saisi à la main" }, store);
    assert.equal(manual.origin, null);
    assert.equal(manual.sourceUrl, null);
    assert.equal(manual.status, "pending");
    assert.equal(created.at(-1)?.sourceKind, null);
  });

  it("refuse la création sans authentification et n’écrit rien", async () => {
    let writes = 0;
    const result = await handleCreateTopic(
      new Request("http://local/api/topics", {
        method: "POST",
        body: JSON.stringify(veilleBody()),
      }),
      {
        authenticated: false,
        store: {
          async findExactSource() {
            return null;
          },
          async create() {
            writes += 1;
            throw new Error("ne doit pas créer");
          },
        },
      }
    );
    assert.equal(result.status, 401);
    assert.equal(writes, 0);
  });

  it("accepte le titre et l’angle réels, puis les annule dans la base", async () => {
    const subject =
      "Comment superviser les agents IA en entreprise : bonnes pratiques et risques";
    const angle =
      "Expliquer aux PME comment surveiller les actions des agents IA, mettre en place une traçabilité, définir les validations humaines et limiter les risques opérationnels.";
    const sourceTitle =
      "Agents IA en production : seules 27 % des entreprises voient vraiment ce qu'ils font";
    const body = toTopicCreateBody(
      buildTopicProposal(
        article({
          title: sourceTitle,
          sourceName: "Le Monde",
          url: "https://exemple.fr/agents-ia-production",
          summary: "Peu d’entreprises observent le comportement réel de leurs agents.",
          event: angle,
          kind: "news",
          publishedOn: "2026-10-28",
          dateVerified: true,
        }),
        "agents IA"
      ),
      { subject, angle }
    );
    assert.equal(body.subject, subject);
    assert.equal(body.angle, angle);
    assert.equal(angle.length < 240, true);

    const { db } = await import("../lib/db");
    let storedId = "";
    await assert.rejects(
      () =>
        db.$transaction(async (tx) => {
          const topic = await createTopic(body, {
            async findExactSource(sourceUrl, nextSubject) {
              const found = await tx.topic.findFirst({
                where: {
                  sourceUrl,
                  subject: { equals: nextSubject, mode: "insensitive" },
                },
              });
              if (!found) {
                return null;
              }
              return {
                id: found.id,
                status: "pending",
                priority: found.priority,
                subject: found.subject,
                angle: found.angle,
                notes: found.notes,
                category: found.category,
                origin: found.origin === "veille" ? "veille" : null,
                sourceUrl: found.sourceUrl,
                sourceTitle: found.sourceTitle,
                sourceName: found.sourceName,
                sourcePublishedOn: found.sourcePublishedOn,
                sourceKind: found.sourceKind,
              };
            },
            async create(data) {
              const created = await tx.topic.create({
                data: {
                  ...data,
                  workspaceId: "ws_wordpress_naxialis",
                  status: "pending",
                },
              });
              storedId = created.id;
              return {
                ...data,
                id: created.id,
                status: "pending" as const,
                priority: created.priority,
              };
            },
          });
          assert.equal(topic.subject, subject);
          assert.equal(topic.angle, angle);
          assert.equal(topic.notes, "Peu d’entreprises observent le comportement réel de leurs agents.");
          assert.equal(topic.sourceUrl, "https://exemple.fr/agents-ia-production");
          assert.equal(topic.sourceTitle, sourceTitle);
          assert.equal(topic.sourceName, "Le Monde");
          assert.equal(topic.sourcePublishedOn, "2026-10-28");
          assert.equal(topic.sourceKind, "news");
          assert.equal(topic.origin, "veille");
          assert.equal(topic.status, "pending");
          throw new Error("rollback");
        }),
      /rollback/
    );
    const left = await db.topic.count({ where: { id: storedId } });
    assert.equal(left, 0);
  });

  it("traduit les statuts HTTP sans exposer une erreur interne", () => {
    assert.match(topicCreateMessage(400, "Le champ angle est trop long."), /trop long/);
    assert.match(topicCreateMessage(400, "Invalid prisma.topic.create()"), /invalides/);
    assert.match(topicCreateMessage(401), /Session expirée/);
    assert.match(topicCreateMessage(409), /déjà présent/);
    assert.match(topicCreateMessage(500, "duplicate key value violates unique constraint"), /Erreur serveur/);
  });

  it("conserve le sujet historisé et transmet le contexte de veille à la génération", () => {
    const generation = readFileSync(resolve("lib/generation.ts"), "utf8");
    const route = readFileSync(resolve("app/api/generate/route.ts"), "utf8");
    const queue = readFileSync(resolve("lib/seo/queue.ts"), "utf8");
    const screen = readFileSync(resolve("components/TopicQueue.tsx"), "utf8");
    const session = readFileSync(resolve("lib/agent/run-session.ts"), "utf8");
    assert.match(generation, /run\(generation\.subject\)/);
    assert.match(generation, /buildGenerationMessage/);
    assert.match(route, /subject = topic\.subject/);
    assert.match(route, /createQueuedGeneration/);
    assert.doesNotMatch(queue, /origin:\s*"veille"|sourceUrl/);
    assert.match(screen, /Veille éditoriale/);
    assert.match(screen, /Contexte de veille transmis à l'agent/);
    assert.match(session, /resolveCategoriesForSubject/);
    assert.match(session, /buildInternalLinkPlan\(trimmedSubject\)/);
    assert.match(session, /generationMessage/);
  });
});
