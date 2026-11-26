import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { parseFeaturedImageRequest } from "../lib/images/request";

function readSource(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
}

describe("V7.1 — option image avec l’article", () => {
  it("option absente ou désactivée → null (comportement historique)", () => {
    assert.equal(parseFeaturedImageRequest({ subject: "x" }), null);
    assert.equal(
      parseFeaturedImageRequest({ featuredImage: { enabled: false } }),
      null
    );
  });

  it("option activée → demande normalisée et validée", () => {
    const request = parseFeaturedImageRequest({
      featuredImage: {
        enabled: true,
        style: "flat_design",
        aspectRatio: "16:9",
        instructions: "  Lumière douce  ",
      },
    });
    assert.deepEqual(request, {
      enabled: true,
      style: "flat_design",
      aspectRatio: "16:9",
      visualInstructions: "Lumière douce",
      size: "1536x864",
    });
  });

  it("refuse un style ou format invalide", () => {
    assert.throws(
      () =>
        parseFeaturedImageRequest({
          featuredImage: { enabled: true, style: "neon" },
        }),
      /style/i
    );
    assert.throws(
      () =>
        parseFeaturedImageRequest({
          featuredImage: { enabled: true, aspectRatio: "1:1" },
        }),
      /format/i
    );
  });

  it("persiste la demande et enchaîne après article completed uniquement", () => {
    const generation = readSource("lib/generation.ts");
    assert.match(generation, /createPendingFeaturedImageRequest/);
    assert.match(generation, /enqueueFeaturedImageAfterArticle/);
    assert.match(generation, /cancelPendingFeaturedImagesForFailedArticle/);
    assert.doesNotMatch(generation, /featuredImageRequest.*generationMessage/);
    assert.doesNotMatch(generation, /runAgentSession\([\s\S]*featured/);

    const pipeline = readSource("lib/images/pipeline.ts");
    assert.match(pipeline, /status: "pending"/);
    assert.match(pipeline, /pending" → generating|status: "generating"/);
    assert.match(pipeline, /FEATURED_IMAGE_INTERRUPTED_ERROR/);
    assert.match(pipeline, /enqueuePendingFeaturedImage/);
    assert.doesNotMatch(pipeline, /setWordPressFeaturedMedia|uploadWordPressMedia/);

    const route = readSource("app/api/generate/route.ts");
    assert.match(route, /parseFeaturedImageRequest/);
    assert.match(route, /featuredImageRequest/);
  });

  it("ne relance pas aveuglément une génération image interrompue", () => {
    const pipeline = readSource("lib/images/pipeline.ts");
    assert.match(pipeline, /generating/);
    assert.match(pipeline, /FEATURED_IMAGE_INTERRUPTED_ERROR/);
    assert.match(
      pipeline,
      /status: "failed"[\s\S]*FEATURED_IMAGE_INTERRUPTED_ERROR/
    );
    // Seules les demandes encore pending sont requeue.
    assert.match(pipeline, /status: "pending"/);
    assert.match(pipeline, /requeueCandidates/);
  });

  it("échec article annule l’image ; échec image laisse l’article completed", () => {
    const generation = readSource("lib/generation.ts");
    // V7.16.1 AI-007 : annulation image seulement si aucun brouillon CMS.
    assert.match(
      generation,
      /if \(!draftAlreadyCreated\)[\s\S]*cancelPendingFeaturedImagesForFailedArticle/
    );
    assert.match(
      generation,
      /draftAlreadyCreated \? "completed" : "failed"/
    );
    assert.match(
      generation,
      /status: "completed"[\s\S]*enqueueFeaturedImageAfterArticle/
    );
    const pipeline = readSource("lib/images/pipeline.ts");
    assert.match(pipeline, /Article non terminé/);
  });

  it("UI full expose la checkbox ; embedded reste inchangé", () => {
    const form = readSource("components/ArticleForm.tsx");
    assert.match(form, /Générer également une image à la une/);
    assert.match(form, /isFull && generateFeaturedImage|wantFeatured = isFull/);
    assert.match(form, /\{isFull \? \(/);
    assert.match(form, /tab=featured/);
    assert.match(form, /Article et image prêts/);
    assert.match(form, /Génération de l’image en cours/);
    assert.doesNotMatch(
      form,
      /layout === "embedded"[\s\S]*generateFeaturedImage/
    );
  });

  it("boot et recovery requeue les pending sans upload WordPress auto", () => {
    const boot = readSource("lib/boot.ts");
    assert.match(boot, /recoverFeaturedImageJobs/);
    const recovery = readSource("lib/generation-recovery.ts");
    assert.match(recovery, /recoverFeaturedImageJobs/);
    const wordpress = readSource("lib/wordpress.ts");
    assert.doesNotMatch(wordpress, /featured_media|featuredImage/);
    const pipeline = readSource("lib/images/pipeline.ts");
    assert.doesNotMatch(pipeline, /featured_media/);
  });

  it("migration V7.1 additive et volume Docker conservé", () => {
    const migration = readSource(
      "prisma/migrations/20261111160000_featured_image_auto_request/migration.sql"
    );
    assert.match(migration, /ADD COLUMN IF NOT EXISTS "visualInstructions"/);
    assert.match(migration, /ADD COLUMN IF NOT EXISTS "origin"/);
    assert.doesNotMatch(migration, /DROP /i);
    const compose = readSource("docker-compose.yml");
    assert.match(compose, /featured_images_data/);
    const schema = readSource("prisma/schema.prisma");
    assert.match(schema, /visualInstructions/);
    assert.match(schema, /origin\s+String/);
  });

  it("dotenv chargé via db pour les tests topic-from-veille", () => {
    const db = readSource("lib/db.ts");
    assert.match(db, /import "dotenv\/config"/);
  });
});
