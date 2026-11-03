-- CreateEnum
CREATE TYPE "VisibilityCampaignStatus" AS ENUM ('pending', 'questions_ready', 'running', 'completed', 'partial', 'failed');
CREATE TYPE "VisibilityResponseStatus" AS ENUM ('pending', 'completed', 'failed');
CREATE TYPE "VisibilityEntityKind" AS ENUM ('target_brand', 'competitor', 'other', 'source');
CREATE TYPE "VisibilityMentionKind" AS ENUM ('mention', 'recommendation', 'negative', 'citation_only');

-- CreateTable
CREATE TABLE "VisibilityBrand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "primaryDomain" TEXT NOT NULL,
    "description" TEXT,
    "sector" TEXT,
    "products" TEXT,
    "country" TEXT NOT NULL DEFAULT 'FR',
    "language" TEXT NOT NULL DEFAULT 'fr',
    "aliases" JSONB,
    "domainAliases" JSONB,
    "knownCompetitors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VisibilityBrand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VisibilityCampaign" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "questionCount" INTEGER NOT NULL,
    "repetitions" INTEGER NOT NULL DEFAULT 1,
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "model" TEXT NOT NULL,
    "instructions" TEXT,
    "status" "VisibilityCampaignStatus" NOT NULL DEFAULT 'pending',
    "analysisVersion" TEXT NOT NULL DEFAULT 'geo-1.0',
    "estimatedCalls" INTEGER,
    "completedCalls" INTEGER NOT NULL DEFAULT 0,
    "validResponses" INTEGER NOT NULL DEFAULT 0,
    "failedResponses" INTEGER NOT NULL DEFAULT 0,
    "mentionRate" DOUBLE PRECISION,
    "recommendationRate" DOUBLE PRECISION,
    "domainCitationRate" DOUBLE PRECISION,
    "metricsSnapshot" JSONB,
    "editorialHints" JSONB,
    "estimatedCostUsd" DOUBLE PRECISION,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VisibilityCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VisibilityQuestion" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "intent" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VisibilityQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VisibilityResponse" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "repetitionIndex" INTEGER NOT NULL DEFAULT 1,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "VisibilityResponseStatus" NOT NULL DEFAULT 'pending',
    "promptCountry" TEXT,
    "promptLanguage" TEXT,
    "responseText" TEXT,
    "rawPayload" JSONB,
    "citations" JSONB,
    "durationMs" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCostUsd" DOUBLE PRECISION,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "VisibilityResponse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VisibilityEntity" (
    "id" TEXT NOT NULL,
    "brandId" TEXT,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "kind" "VisibilityEntityKind" NOT NULL DEFAULT 'other',
    "aliases" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VisibilityEntity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VisibilityMention" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "kind" "VisibilityMentionKind" NOT NULL DEFAULT 'mention',
    "appearanceOrder" INTEGER,
    "excerpt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VisibilityMention_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VisibilityCitation" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "title" TEXT,
    "url" TEXT NOT NULL,
    "domain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VisibilityCitation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VisibilityBrand_name_idx" ON "VisibilityBrand"("name");
CREATE INDEX "VisibilityBrand_primaryDomain_idx" ON "VisibilityBrand"("primaryDomain");
CREATE INDEX "VisibilityCampaign_brandId_idx" ON "VisibilityCampaign"("brandId");
CREATE INDEX "VisibilityCampaign_status_idx" ON "VisibilityCampaign"("status");
CREATE INDEX "VisibilityCampaign_createdAt_idx" ON "VisibilityCampaign"("createdAt");
CREATE INDEX "VisibilityQuestion_campaignId_idx" ON "VisibilityQuestion"("campaignId");
CREATE INDEX "VisibilityResponse_campaignId_idx" ON "VisibilityResponse"("campaignId");
CREATE INDEX "VisibilityResponse_questionId_idx" ON "VisibilityResponse"("questionId");
CREATE INDEX "VisibilityResponse_status_idx" ON "VisibilityResponse"("status");
CREATE INDEX "VisibilityEntity_brandId_idx" ON "VisibilityEntity"("brandId");
CREATE INDEX "VisibilityEntity_name_idx" ON "VisibilityEntity"("name");
CREATE INDEX "VisibilityEntity_domain_idx" ON "VisibilityEntity"("domain");
CREATE INDEX "VisibilityEntity_kind_idx" ON "VisibilityEntity"("kind");
CREATE INDEX "VisibilityMention_responseId_idx" ON "VisibilityMention"("responseId");
CREATE INDEX "VisibilityMention_entityId_idx" ON "VisibilityMention"("entityId");
CREATE INDEX "VisibilityMention_kind_idx" ON "VisibilityMention"("kind");
CREATE INDEX "VisibilityCitation_responseId_idx" ON "VisibilityCitation"("responseId");
CREATE INDEX "VisibilityCitation_domain_idx" ON "VisibilityCitation"("domain");

ALTER TABLE "VisibilityCampaign" ADD CONSTRAINT "VisibilityCampaign_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "VisibilityBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisibilityQuestion" ADD CONSTRAINT "VisibilityQuestion_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "VisibilityCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisibilityResponse" ADD CONSTRAINT "VisibilityResponse_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "VisibilityCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisibilityResponse" ADD CONSTRAINT "VisibilityResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "VisibilityQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisibilityEntity" ADD CONSTRAINT "VisibilityEntity_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "VisibilityBrand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VisibilityMention" ADD CONSTRAINT "VisibilityMention_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "VisibilityResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisibilityMention" ADD CONSTRAINT "VisibilityMention_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "VisibilityEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
