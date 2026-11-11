-- V7.1 : champs additifs pour la demande d’image avec l’article.
ALTER TABLE "ArticleFeaturedImage"
  ADD COLUMN IF NOT EXISTS "visualInstructions" TEXT;

ALTER TABLE "ArticleFeaturedImage"
  ADD COLUMN IF NOT EXISTS "origin" TEXT NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS "ArticleFeaturedImage_status_updatedAt_idx"
  ON "ArticleFeaturedImage"("status", "updatedAt");
