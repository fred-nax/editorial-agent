-- V7.13.1 — Références CMS Webflow (catégories / auteurs) + défauts workspace.
-- Migration additive uniquement.

ALTER TABLE "WorkspaceCmsSettings"
  ADD COLUMN IF NOT EXISTS "webflowDefaultCategoryItemId" TEXT,
  ADD COLUMN IF NOT EXISTS "webflowDefaultAuthorItemId" TEXT,
  ADD COLUMN IF NOT EXISTS "webflowReferencesSyncedAt" TIMESTAMP(3);

ALTER TABLE "Topic"
  ADD COLUMN IF NOT EXISTS "webflowCategoryItemId" TEXT,
  ADD COLUMN IF NOT EXISTS "webflowAuthorItemId" TEXT;

CREATE TABLE IF NOT EXISTS "WebflowCmsReference" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "collectionId" TEXT NOT NULL,
  "webflowItemId" TEXT NOT NULL,
  "cmsLocaleId" TEXT NOT NULL DEFAULT '',
  "name" TEXT NOT NULL,
  "slug" TEXT,
  "isDraft" BOOLEAN NOT NULL DEFAULT false,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "missingAt" TIMESTAMP(3),
  "lastModifiedAt" TIMESTAMP(3),
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebflowCmsReference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebflowCmsReference_workspaceId_kind_collectionId_webflowItemId_cmsLocaleId_key"
  ON "WebflowCmsReference"("workspaceId", "kind", "collectionId", "webflowItemId", "cmsLocaleId");

CREATE INDEX IF NOT EXISTS "WebflowCmsReference_workspaceId_kind_idx"
  ON "WebflowCmsReference"("workspaceId", "kind");

CREATE INDEX IF NOT EXISTS "WebflowCmsReference_workspaceId_kind_missingAt_idx"
  ON "WebflowCmsReference"("workspaceId", "kind", "missingAt");

CREATE INDEX IF NOT EXISTS "WebflowCmsReference_collectionId_idx"
  ON "WebflowCmsReference"("collectionId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WebflowCmsReference_workspaceId_fkey'
  ) THEN
    ALTER TABLE "WebflowCmsReference"
      ADD CONSTRAINT "WebflowCmsReference_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "EditorialWorkspace"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
