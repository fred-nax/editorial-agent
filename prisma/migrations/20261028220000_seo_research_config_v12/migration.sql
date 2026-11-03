-- CreateEnum
CREATE TYPE "ResearchMode" AS ENUM ('domains', 'free');

-- CreateEnum
CREATE TYPE "ResearchGoal" AS ENUM ('seo', 'trends', 'problems', 'commercial');

-- CreateTable
CREATE TABLE "CustomTheme" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomTheme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" "ResearchMode" NOT NULL,
    "researchGoal" "ResearchGoal" NOT NULL DEFAULT 'seo',
    "domains" JSONB,
    "customTopic" TEXT,
    "researchInstructions" TEXT,
    "requestedCount" INTEGER NOT NULL DEFAULT 10,
    "customThemeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchConfig_pkey" PRIMARY KEY ("id")
);

-- AlterTable OpportunitySearchRun
ALTER TABLE "OpportunitySearchRun" ADD COLUMN IF NOT EXISTS "mode" "ResearchMode";
ALTER TABLE "OpportunitySearchRun" ADD COLUMN IF NOT EXISTS "researchGoal" "ResearchGoal";
ALTER TABLE "OpportunitySearchRun" ADD COLUMN IF NOT EXISTS "customTopic" TEXT;
ALTER TABLE "OpportunitySearchRun" ADD COLUMN IF NOT EXISTS "researchInstructions" TEXT;
ALTER TABLE "OpportunitySearchRun" ADD COLUMN IF NOT EXISTS "requestedCount" INTEGER;
ALTER TABLE "OpportunitySearchRun" ADD COLUMN IF NOT EXISTS "configSnapshot" JSONB;
ALTER TABLE "OpportunitySearchRun" ADD COLUMN IF NOT EXISTS "configId" TEXT;
ALTER TABLE "OpportunitySearchRun" ADD COLUMN IF NOT EXISTS "customThemeId" TEXT;
ALTER TABLE "OpportunitySearchRun" ADD COLUMN IF NOT EXISTS "skippedExisting" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OpportunitySearchRun" ADD COLUMN IF NOT EXISTS "rejectedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OpportunitySearchRun" ADD COLUMN IF NOT EXISTS "domainBreakdown" JSONB;

-- Indexes
CREATE INDEX IF NOT EXISTS "CustomTheme_active_idx" ON "CustomTheme"("active");
CREATE INDEX IF NOT EXISTS "CustomTheme_name_idx" ON "CustomTheme"("name");
CREATE INDEX IF NOT EXISTS "ResearchConfig_mode_idx" ON "ResearchConfig"("mode");
CREATE INDEX IF NOT EXISTS "ResearchConfig_customThemeId_idx" ON "ResearchConfig"("customThemeId");
CREATE INDEX IF NOT EXISTS "OpportunitySearchRun_status_idx" ON "OpportunitySearchRun"("status");
CREATE INDEX IF NOT EXISTS "OpportunitySearchRun_mode_idx" ON "OpportunitySearchRun"("mode");
CREATE INDEX IF NOT EXISTS "OpportunitySearchRun_configId_idx" ON "OpportunitySearchRun"("configId");
CREATE INDEX IF NOT EXISTS "OpportunitySearchRun_customThemeId_idx" ON "OpportunitySearchRun"("customThemeId");
CREATE INDEX IF NOT EXISTS "OpportunitySearchRun_startedAt_idx" ON "OpportunitySearchRun"("startedAt");

-- ForeignKeys
ALTER TABLE "ResearchConfig" ADD CONSTRAINT "ResearchConfig_customThemeId_fkey" FOREIGN KEY ("customThemeId") REFERENCES "CustomTheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OpportunitySearchRun" ADD CONSTRAINT "OpportunitySearchRun_configId_fkey" FOREIGN KEY ("configId") REFERENCES "ResearchConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OpportunitySearchRun" ADD CONSTRAINT "OpportunitySearchRun_customThemeId_fkey" FOREIGN KEY ("customThemeId") REFERENCES "CustomTheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;
