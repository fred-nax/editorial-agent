-- AlterTable
ALTER TABLE "ArticleGeneration" ADD COLUMN     "progressMessage" TEXT,
ADD COLUMN     "progressStage" TEXT,
ADD COLUMN     "progressUpdatedAt" TIMESTAMP(3);
