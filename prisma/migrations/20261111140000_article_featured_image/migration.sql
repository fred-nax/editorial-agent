-- Image à la une : table additive, sans modification des données existantes.
CREATE TABLE IF NOT EXISTS "ArticleFeaturedImage" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/webp',
    "byteSize" INTEGER,
    "prompt" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "aspectRatio" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "altText" TEXT,
    "altModel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "wpMediaId" INTEGER,
    "wpMediaUrl" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleFeaturedImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ArticleFeaturedImage_generationId_createdAt_idx"
  ON "ArticleFeaturedImage"("generationId", "createdAt");

CREATE INDEX IF NOT EXISTS "ArticleFeaturedImage_status_idx"
  ON "ArticleFeaturedImage"("status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ArticleFeaturedImage_generationId_fkey'
  ) THEN
    ALTER TABLE "ArticleFeaturedImage"
      ADD CONSTRAINT "ArticleFeaturedImage_generationId_fkey"
      FOREIGN KEY ("generationId") REFERENCES "ArticleGeneration"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
