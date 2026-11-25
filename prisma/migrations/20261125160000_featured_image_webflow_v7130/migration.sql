-- V7.13.0 — Image à la une Webflow (additive, non destructive)
ALTER TABLE "ArticleFeaturedImage" ADD COLUMN IF NOT EXISTS "webflowAssetId" TEXT;
ALTER TABLE "ArticleFeaturedImage" ADD COLUMN IF NOT EXISTS "webflowAssetUrl" TEXT;
ALTER TABLE "ArticleFeaturedImage" ADD COLUMN IF NOT EXISTS "cmsTransferStatus" TEXT;

CREATE INDEX IF NOT EXISTS "ArticleFeaturedImage_webflowAssetId_idx"
  ON "ArticleFeaturedImage"("webflowAssetId");
