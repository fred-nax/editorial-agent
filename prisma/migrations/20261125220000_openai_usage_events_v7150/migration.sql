-- V7.15.0 — Registre centralisé des consommations OpenAI (additif).
-- Aucune colonne de coût historique n’est modifiée ni supprimée.

CREATE TABLE IF NOT EXISTS "OpenAiUsageEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "operationType" TEXT NOT NULL,
    "operationKey" TEXT,
    "generationId" TEXT,
    "featuredImageId" TEXT,
    "requestedModel" TEXT,
    "usedModel" TEXT,
    "endpoint" TEXT NOT NULL,
    "responseId" TEXT,
    "requestId" TEXT,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'succeeded',
    "inputTokens" INTEGER,
    "cachedInputTokens" INTEGER,
    "outputTokens" INTEGER,
    "reasoningTokens" INTEGER,
    "totalTokens" INTEGER,
    "textInputTokens" INTEGER,
    "imageInputTokens" INTEGER,
    "imageOutputTokens" INTEGER,
    "toolCallCount" INTEGER,
    "estimatedCostUsd" DECIMAL(18,8),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "pricingVersion" TEXT NOT NULL,
    "completeness" TEXT NOT NULL,
    "costSource" TEXT NOT NULL DEFAULT 'local_estimate',
    "idempotencyKey" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenAiUsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OpenAiUsageEvent_idempotencyKey_key"
  ON "OpenAiUsageEvent"("idempotencyKey");

CREATE INDEX IF NOT EXISTS "OpenAiUsageEvent_workspaceId_consumedAt_idx"
  ON "OpenAiUsageEvent"("workspaceId", "consumedAt");

CREATE INDEX IF NOT EXISTS "OpenAiUsageEvent_workspaceId_operationType_consumedAt_idx"
  ON "OpenAiUsageEvent"("workspaceId", "operationType", "consumedAt");

CREATE INDEX IF NOT EXISTS "OpenAiUsageEvent_workspaceId_completeness_idx"
  ON "OpenAiUsageEvent"("workspaceId", "completeness");

CREATE INDEX IF NOT EXISTS "OpenAiUsageEvent_generationId_operationType_idx"
  ON "OpenAiUsageEvent"("generationId", "operationType");

CREATE INDEX IF NOT EXISTS "OpenAiUsageEvent_featuredImageId_idx"
  ON "OpenAiUsageEvent"("featuredImageId");

CREATE INDEX IF NOT EXISTS "OpenAiUsageEvent_operationKey_idx"
  ON "OpenAiUsageEvent"("operationKey");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OpenAiUsageEvent_workspaceId_fkey'
  ) THEN
    ALTER TABLE "OpenAiUsageEvent"
      ADD CONSTRAINT "OpenAiUsageEvent_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "EditorialWorkspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OpenAiUsageEvent_generationId_fkey'
  ) THEN
    ALTER TABLE "OpenAiUsageEvent"
      ADD CONSTRAINT "OpenAiUsageEvent_generationId_fkey"
      FOREIGN KEY ("generationId") REFERENCES "ArticleGeneration"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OpenAiUsageEvent_featuredImageId_fkey'
  ) THEN
    ALTER TABLE "OpenAiUsageEvent"
      ADD CONSTRAINT "OpenAiUsageEvent_featuredImageId_fkey"
      FOREIGN KEY ("featuredImageId") REFERENCES "ArticleFeaturedImage"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
