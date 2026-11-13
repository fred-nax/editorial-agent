-- V7.5 — Catalogue unifié des thématiques SEO (CustomTheme étendu + lien opportunité).
-- Migration strictement additive. Aucune suppression de données.

ALTER TABLE "CustomTheme" ADD COLUMN "legacyKey" TEXT;
ALTER TABLE "CustomTheme" ADD COLUMN "explorationAngles" JSONB;
ALTER TABLE "CustomTheme" ADD COLUMN "defaultQuota" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "CustomTheme" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CustomTheme" ADD COLUMN "naxialisServices" JSONB;

CREATE UNIQUE INDEX "CustomTheme_legacyKey_key" ON "CustomTheme"("legacyKey");
CREATE INDEX "CustomTheme_sortOrder_idx" ON "CustomTheme"("sortOrder");

ALTER TABLE "SeoOpportunity" ADD COLUMN "themeId" TEXT;

CREATE INDEX "SeoOpportunity_themeId_idx" ON "SeoOpportunity"("themeId");

ALTER TABLE "SeoOpportunity"
  ADD CONSTRAINT "SeoOpportunity_themeId_fkey"
  FOREIGN KEY ("themeId") REFERENCES "CustomTheme"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
