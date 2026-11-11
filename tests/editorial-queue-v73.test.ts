import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { decideTopicDeletion } from "../lib/topics/delete";

function readSource(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

describe("V7.3 — file éditoriale", () => {
  it("autorise la suppression d’un sujet pending sans génération", () => {
    assert.deepEqual(
      decideTopicDeletion({ status: "pending", linkedGenerationCount: 0 }),
      { ok: true }
    );
    assert.deepEqual(
      decideTopicDeletion({ status: "archived", linkedGenerationCount: 0 }),
      { ok: true }
    );
  });

  it("refuse la suppression pendant une génération", () => {
    const decision = decideTopicDeletion({
      status: "generating",
      linkedGenerationCount: 0,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.equal(decision.status, 409);
      assert.match(decision.error, /génération/i);
    }
  });

  it("refuse la suppression si une génération est liée (préférer archiver)", () => {
    const decision = decideTopicDeletion({
      status: "pending",
      linkedGenerationCount: 1,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.equal(decision.status, 409);
      assert.match(decision.error, /Archivez/i);
    }
  });

  it("refuse la suppression d’un sujet completed", () => {
    const decision = decideTopicDeletion({
      status: "completed",
      linkedGenerationCount: 0,
    });
    assert.equal(decision.ok, false);
  });

  it("API DELETE est authentifiée et sans cascade Prisma sur ArticleGeneration", () => {
    const route = readSource("app/api/topics/[id]/route.ts");
    assert.match(route, /requireAuth/);
    assert.match(route, /decideTopicDeletion/);
    assert.match(route, /articleGeneration\.count/);
    assert.match(route, /db\.topic\.delete/);
    assert.doesNotMatch(route, /articleGeneration\.delete|deleteMany/);
    assert.doesNotMatch(route, /wpPostId|create_wordpress_draft|WP_APP_PASSWORD/);
  });

  it("PATCH permet subject/priority sur pending et archive avec garde generating", () => {
    const route = readSource("app/api/topics/[id]/route.ts");
    assert.match(route, /Seul un sujet en attente peut être modifié/);
    assert.match(route, /Impossible d’archiver un sujet en cours de génération/);
    assert.match(route, /priority/);
    assert.match(route, /subject/);
  });

  it("UI File éditoriale expose actions, AlertDialog et titres V7.2", () => {
    const page = readSource("app/(protected)/topics/page.tsx");
    assert.match(page, /File éditoriale/);
    assert.match(page, /articleId/);

    const nav = readSource("components/navigation.ts");
    assert.match(nav, /File éditoriale/);

    const queue = readSource("components/TopicQueue.tsx");
    assert.match(queue, /Trash2/);
    assert.match(queue, /Supprimer ce sujet \?/);
    assert.match(queue, /AlertDialog/);
    assert.match(queue, /Suggérer 5 titres/);
    assert.match(queue, /\/api\/titles\/suggest/);
    assert.match(queue, /TitleSuggestionsPicker/);
    assert.match(queue, /Rédiger/);
    assert.match(queue, /\/articles\/new\?/);
    assert.match(queue, /Voir l&apos;article|Voir l'article/);
    assert.match(queue, /Archiver/);
    assert.match(queue, /Modifier/);
    assert.doesNotMatch(queue, /suggestEditorialTitles|OPENAI_API_KEY/);

    const alert = readSource("components/ui/alert-dialog.tsx");
    assert.match(alert, /@base-ui\/react\/alert-dialog/);
  });

  it("préremplit Nouvel article depuis topicId sans casser le mode libre", () => {
    const page = readSource("app/(protected)/articles/new/page.tsx");
    assert.match(page, /topicId/);
    assert.match(page, /preferredTitle/);
    assert.match(page, /ArticleForm/);

    const form = readSource("components/ArticleForm.tsx");
    assert.match(form, /ArticleFormInitial/);
    assert.match(form, /payloadBody\.topicId = topicId/);
    assert.match(form, /\/api\/topics\/\$\{topicId\}/);
  });

  it("ne modifie pas l’agent, WordPress draft ni le schéma Prisma", () => {
    assert.match(readSource("lib/agent/tools.ts"), /create_wordpress_draft/);
    assert.match(readSource("lib/wordpress.ts"), /status:\s*"draft"/);
    assert.doesNotMatch(
      readSource("prisma/schema.prisma"),
      /onDelete:\s*Cascade[\s\S]{0,80}Topic|Topic[\s\S]{0,120}ArticleGeneration/
    );
    assert.doesNotMatch(
      readSource("app/api/topics/[id]/route.ts"),
      /prisma\/migrations/
    );
  });
});
