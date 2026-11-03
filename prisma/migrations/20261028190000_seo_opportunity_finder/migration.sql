-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('new', 'reviewed', 'added_to_queue', 'dismissed');

-- CreateTable
CREATE TABLE "WordPressPost" (
    "id" TEXT NOT NULL,
    "wpPostId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "excerpt" TEXT,
    "contentText" TEXT,
    "categories" JSONB,
    "publishedAt" TIMESTAMP(3),
    "modifiedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WordPressPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordPressSyncRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "fetchedCount" INTEGER NOT NULL DEFAULT 0,
    "upsertedCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "WordPressSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunitySearchRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "themes" JSONB,
    "foundCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "OpportunitySearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoOpportunity" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "angle" TEXT,
    "searchIntent" TEXT,
    "theme" TEXT NOT NULL,
    "rationale" TEXT,
    "sources" JSONB,
    "naxialisService" TEXT,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'new',
    "scoreTotal" INTEGER NOT NULL,
    "scoreRelevance" INTEGER NOT NULL,
    "scoreCommercial" INTEGER NOT NULL,
    "scoreIntent" INTEGER NOT NULL,
    "scoreTimeliness" INTEGER NOT NULL,
    "scoreOriginality" INTEGER NOT NULL,
    "scoreRationale" JSONB,
    "similarPosts" JSONB,
    "similarTopics" JSONB,
    "duplicateRisk" TEXT,
    "topicId" TEXT,
    "searchRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WordPressPost_wpPostId_key" ON "WordPressPost"("wpPostId");

-- CreateIndex
CREATE INDEX "WordPressPost_slug_idx" ON "WordPressPost"("slug");

-- CreateIndex
CREATE INDEX "WordPressPost_status_idx" ON "WordPressPost"("status");

-- CreateIndex
CREATE INDEX "WordPressPost_modifiedAt_idx" ON "WordPressPost"("modifiedAt");

-- CreateIndex
CREATE INDEX "SeoOpportunity_status_idx" ON "SeoOpportunity"("status");

-- CreateIndex
CREATE INDEX "SeoOpportunity_theme_idx" ON "SeoOpportunity"("theme");

-- CreateIndex
CREATE INDEX "SeoOpportunity_scoreTotal_idx" ON "SeoOpportunity"("scoreTotal");

-- CreateIndex
CREATE INDEX "SeoOpportunity_searchRunId_idx" ON "SeoOpportunity"("searchRunId");
