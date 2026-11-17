-- V7.8.2 — Plugin SEO WordPress sélectionnable (additive).
-- Null / absent = slim_seo (comportement historique Naxialis).
ALTER TABLE "AppSettings" ADD COLUMN "wpSeoPlugin" TEXT;
