-- V7.9.0 — Suivi multi-CMS (additif, non destructif).
-- Null cmsDestination = wordpress (générations historiques).
ALTER TABLE "ArticleGeneration" ADD COLUMN "cmsDestination" TEXT;
ALTER TABLE "ArticleGeneration" ADD COLUMN "cmsExternalId" TEXT;

CREATE INDEX "ArticleGeneration_cmsDestination_idx" ON "ArticleGeneration"("cmsDestination");
CREATE INDEX "ArticleGeneration_cmsDestination_cmsExternalId_idx" ON "ArticleGeneration"("cmsDestination", "cmsExternalId");
