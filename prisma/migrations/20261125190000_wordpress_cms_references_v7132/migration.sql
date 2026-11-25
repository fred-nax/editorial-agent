-- V7.13.2 — Catalogue catégories / auteurs WordPress + mode manuel (additif).

-- Topic : choix figés file éditoriale WordPress
ALTER TABLE "Topic" ADD COLUMN IF NOT EXISTS "wpCategorizationMode" TEXT;
ALTER TABLE "Topic" ADD COLUMN IF NOT EXISTS "wpCategoryIds" TEXT;
ALTER TABLE "Topic" ADD COLUMN IF NOT EXISTS "wpAuthorId" INTEGER;

-- WorkspaceCmsSettings : mode + défauts + capacité auteur
ALTER TABLE "WorkspaceCmsSettings" ADD COLUMN IF NOT EXISTS "wpCategorizationMode" TEXT DEFAULT 'automatic';
ALTER TABLE "WorkspaceCmsSettings" ADD COLUMN IF NOT EXISTS "wpManualDefaultCategoryIds" TEXT;
ALTER TABLE "WorkspaceCmsSettings" ADD COLUMN IF NOT EXISTS "wpDefaultAuthorId" INTEGER;
ALTER TABLE "WorkspaceCmsSettings" ADD COLUMN IF NOT EXISTS "wpAuthorsSyncedAt" TIMESTAMP(3);
ALTER TABLE "WorkspaceCmsSettings" ADD COLUMN IF NOT EXISTS "wpAuthorCapability" TEXT;
ALTER TABLE "WorkspaceCmsSettings" ADD COLUMN IF NOT EXISTS "wpApiUserId" INTEGER;
ALTER TABLE "WorkspaceCmsSettings" ADD COLUMN IF NOT EXISTS "wpApiUserName" TEXT;
ALTER TABLE "WorkspaceCmsSettings" ADD COLUMN IF NOT EXISTS "wpApiUserSlug" TEXT;

-- AppSettings : miroir legacy (dual-write)
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "wpCategorizationMode" TEXT DEFAULT 'automatic';
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "wpManualDefaultCategoryIds" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "wpDefaultAuthorId" INTEGER;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "wpAuthorsSyncedAt" TIMESTAMP(3);
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "wpAuthorCapability" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "wpApiUserId" INTEGER;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "wpApiUserName" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "wpApiUserSlug" TEXT;

-- Catalogue WordPressCmsReference
CREATE TABLE IF NOT EXISTS "WordPressCmsReference" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "siteOrigin" TEXT NOT NULL,
    "wpId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "parentWpId" INTEGER,
    "description" TEXT,
    "count" INTEGER,
    "missingAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WordPressCmsReference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WordPressCmsReference_workspaceId_kind_siteOrigin_wpId_key"
  ON "WordPressCmsReference"("workspaceId", "kind", "siteOrigin", "wpId");

CREATE INDEX IF NOT EXISTS "WordPressCmsReference_workspaceId_kind_idx"
  ON "WordPressCmsReference"("workspaceId", "kind");

CREATE INDEX IF NOT EXISTS "WordPressCmsReference_workspaceId_kind_missingAt_idx"
  ON "WordPressCmsReference"("workspaceId", "kind", "missingAt");

CREATE INDEX IF NOT EXISTS "WordPressCmsReference_siteOrigin_idx"
  ON "WordPressCmsReference"("siteOrigin");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WordPressCmsReference_workspaceId_fkey'
  ) THEN
    ALTER TABLE "WordPressCmsReference"
      ADD CONSTRAINT "WordPressCmsReference_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "EditorialWorkspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
