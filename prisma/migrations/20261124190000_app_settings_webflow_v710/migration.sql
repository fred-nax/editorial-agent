-- V7.10.0 — configuration Webflow (lecture seule) dans AppSettings.
-- Additive uniquement : aucun DROP, aucune modification GEO.

ALTER TABLE "AppSettings" ADD COLUMN "openaiWebflowAgentId" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN "webflowApiTokenEncrypted" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN "webflowSiteId" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN "webflowCollectionId" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN "webflowFieldMappingJson" TEXT;
