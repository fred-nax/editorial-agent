-- CreateEnum
CREATE TYPE "OpportunityContentType" AS ENUM ('news', 'evergreen', 'commercial');

-- AlterTable WordPressSyncRun diagnostics
ALTER TABLE "WordPressSyncRun" ADD COLUMN IF NOT EXISTS "expectedTotal" INTEGER;
ALTER TABLE "WordPressSyncRun" ADD COLUMN IF NOT EXISTS "storedCount" INTEGER;
ALTER TABLE "WordPressSyncRun" ADD COLUMN IF NOT EXISTS "pagesFetched" INTEGER;
ALTER TABLE "WordPressSyncRun" ADD COLUMN IF NOT EXISTS "totalPages" INTEGER;
ALTER TABLE "WordPressSyncRun" ADD COLUMN IF NOT EXISTS "statusBreakdown" JSONB;
ALTER TABLE "WordPressSyncRun" ADD COLUMN IF NOT EXISTS "diagnosticNote" TEXT;

-- AlterTable SeoOpportunity
ALTER TABLE "SeoOpportunity" ADD COLUMN IF NOT EXISTS "contentType" "OpportunityContentType" NOT NULL DEFAULT 'evergreen';
ALTER TABLE "SeoOpportunity" ADD COLUMN IF NOT EXISTS "fingerprint" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "SeoOpportunity_fingerprint_key" ON "SeoOpportunity"("fingerprint");
CREATE INDEX IF NOT EXISTS "SeoOpportunity_contentType_idx" ON "SeoOpportunity"("contentType");
