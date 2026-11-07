-- AlterTable
ALTER TABLE "Topic" ADD COLUMN "origin" TEXT,
ADD COLUMN "sourceUrl" TEXT,
ADD COLUMN "sourceTitle" TEXT,
ADD COLUMN "sourceName" TEXT,
ADD COLUMN "sourcePublishedOn" TEXT,
ADD COLUMN "sourceKind" TEXT;

-- CreateIndex
CREATE INDEX "Topic_sourceUrl_idx" ON "Topic"("sourceUrl");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_sourceUrl_subject_key" ON "Topic"("sourceUrl", "subject");
