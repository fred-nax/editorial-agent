-- AlterTable
ALTER TABLE "ArticleGeneration" ADD COLUMN     "cachedInputTokens" INTEGER,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "reasoningTokens" INTEGER;
