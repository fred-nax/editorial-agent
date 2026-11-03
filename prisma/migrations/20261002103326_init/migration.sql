-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('pending', 'queued', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "TopicStatus" AS ENUM ('pending', 'generating', 'completed', 'archived');

-- CreateTable
CREATE TABLE "ArticleGeneration" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "title" TEXT,
    "excerpt" TEXT,
    "slug" TEXT,
    "status" "GenerationStatus" NOT NULL,
    "wpPostId" INTEGER,
    "wpUrl" TEXT,
    "categories" JSONB,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "estimatedCost" DOUBLE PRECISION,
    "durationMs" INTEGER,
    "sessionId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "TopicStatus" NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "category" TEXT,
    "angle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);
