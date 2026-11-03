-- GEO 1.1 — classification fine, normalisation, snapshots, mentions enrichies
-- Migration non destructive (ajout de colonnes / enums / index).

CREATE TYPE "VisibilityEntityCategory" AS ENUM (
  'target_brand',
  'direct_competitor',
  'indirect_competitor',
  'software_product',
  'institution',
  'information_source',
  'other',
  'unknown'
);

ALTER TABLE "VisibilityCampaign"
  ADD COLUMN IF NOT EXISTS "previousMetricsSnapshot" JSONB;

ALTER TABLE "VisibilityEntity"
  ADD COLUMN IF NOT EXISTS "canonicalName" TEXT,
  ADD COLUMN IF NOT EXISTS "category" "VisibilityEntityCategory" NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS "categoryConfidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "categoryJustification" TEXT,
  ADD COLUMN IF NOT EXISTS "categoryManual" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "normalizedKey" TEXT,
  ADD COLUMN IF NOT EXISTS "parentEntityId" TEXT;

ALTER TABLE "VisibilityMention"
  ADD COLUMN IF NOT EXISTS "confidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "analysisVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "rawName" TEXT;

-- Backfill category depuis kind historique
UPDATE "VisibilityEntity"
SET "category" = CASE
  WHEN "kind" = 'target_brand' THEN 'target_brand'::"VisibilityEntityCategory"
  WHEN "kind" = 'competitor' THEN 'direct_competitor'::"VisibilityEntityCategory"
  WHEN "kind" = 'source' THEN 'information_source'::"VisibilityEntityCategory"
  ELSE 'unknown'::"VisibilityEntityCategory"
END
WHERE "category" = 'unknown'::"VisibilityEntityCategory";

UPDATE "VisibilityEntity"
SET "canonicalName" = "name"
WHERE "canonicalName" IS NULL;

CREATE INDEX IF NOT EXISTS "VisibilityEntity_canonicalName_idx" ON "VisibilityEntity"("canonicalName");
CREATE INDEX IF NOT EXISTS "VisibilityEntity_category_idx" ON "VisibilityEntity"("category");
CREATE INDEX IF NOT EXISTS "VisibilityEntity_normalizedKey_idx" ON "VisibilityEntity"("normalizedKey");
CREATE INDEX IF NOT EXISTS "VisibilityEntity_parentEntityId_idx" ON "VisibilityEntity"("parentEntityId");

ALTER TABLE "VisibilityEntity"
  DROP CONSTRAINT IF EXISTS "VisibilityEntity_parentEntityId_fkey";

ALTER TABLE "VisibilityEntity"
  ADD CONSTRAINT "VisibilityEntity_parentEntityId_fkey"
  FOREIGN KEY ("parentEntityId") REFERENCES "VisibilityEntity"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Déduplication préalable avant contrainte unique (garde la plus ancienne)
DELETE FROM "VisibilityMention" a
USING "VisibilityMention" b
WHERE a."id" > b."id"
  AND a."responseId" = b."responseId"
  AND a."entityId" = b."entityId"
  AND a."kind" = b."kind";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'VisibilityMention_responseId_entityId_kind_key'
  ) THEN
    ALTER TABLE "VisibilityMention"
      ADD CONSTRAINT "VisibilityMention_responseId_entityId_kind_key"
      UNIQUE ("responseId", "entityId", "kind");
  END IF;
END $$;
