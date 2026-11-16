-- V7.8.0 — Catégories WordPress dynamiques (additive).
-- Snapshot + sélection autorisée + défaut, liés à l'origine WP effective.
ALTER TABLE "AppSettings" ADD COLUMN "wpCategoriesJson" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN "wpAllowedCategoryIds" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN "wpDefaultCategoryId" INTEGER;
ALTER TABLE "AppSettings" ADD COLUMN "wpCategoriesSyncedAt" TIMESTAMP(3);
ALTER TABLE "AppSettings" ADD COLUMN "wpCategoriesOrigin" TEXT;
