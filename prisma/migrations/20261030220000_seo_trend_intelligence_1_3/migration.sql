-- SEO Opportunity Finder 1.3 — Trend Intelligence

CREATE TYPE "TrendType" AS ENUM ('emerging', 'news', 'evergreen', 'unverified');
CREATE TYPE "TrendConfidence" AS ENUM ('low', 'medium', 'high');
CREATE TYPE "EditorialUrgency" AS ENUM ('low', 'medium', 'high');

ALTER TABLE "SeoOpportunity"
  ADD COLUMN IF NOT EXISTS "trendType" "TrendType",
  ADD COLUMN IF NOT EXISTS "trendScore" INTEGER,
  ADD COLUMN IF NOT EXISTS "trendConfidence" "TrendConfidence",
  ADD COLUMN IF NOT EXISTS "trendJustification" TEXT,
  ADD COLUMN IF NOT EXISTS "trendCheckedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "editorialUrgency" "EditorialUrgency",
  ADD COLUMN IF NOT EXISTS "trendSignals" JSONB,
  ADD COLUMN IF NOT EXISTS "trendHistory" JSONB;

CREATE INDEX IF NOT EXISTS "SeoOpportunity_trendType_idx" ON "SeoOpportunity"("trendType");
CREATE INDEX IF NOT EXISTS "SeoOpportunity_editorialUrgency_idx" ON "SeoOpportunity"("editorialUrgency");
