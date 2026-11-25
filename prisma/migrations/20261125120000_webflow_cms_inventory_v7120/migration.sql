-- V7.12.0 — Inventaire CMS Webflow (additif uniquement).
-- Ne touche PAS aux tables GEO / Visibility*.
-- Ne réapplique PAS 20261103173400_drop_ai_visibility_monitor.
-- Aucune modification de WordPressPost / WordPressSyncRun.

CREATE TABLE "WebflowCmsItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "webflowItemId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "url" TEXT,
    "status" TEXT NOT NULL,
    "isDraft" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "excerpt" TEXT,
    "contentHtml" TEXT,
    "contentText" TEXT,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "featuredImageUrl" TEXT,
    "featuredImageAlt" TEXT,
    "categoryRef" TEXT,
    "authorRef" TEXT,
    "createdOnAt" TIMESTAMP(3),
    "lastUpdatedAt" TIMESTAMP(3),
    "lastPublishedAt" TIMESTAMP(3),
    "missingAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebflowCmsItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebflowSyncRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "siteId" TEXT,
    "collectionId" TEXT,
    "fetchedCount" INTEGER NOT NULL DEFAULT 0,
    "upsertedCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "unchangedCount" INTEGER NOT NULL DEFAULT 0,
    "missingCount" INTEGER NOT NULL DEFAULT 0,
    "expectedTotal" INTEGER,
    "storedCount" INTEGER,
    "pagesFetched" INTEGER,
    "totalPages" INTEGER,
    "liveFetchedCount" INTEGER,
    "statusBreakdown" JSONB,
    "diagnosticNote" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "WebflowSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebflowCmsItem_workspaceId_collectionId_webflowItemId_key"
  ON "WebflowCmsItem"("workspaceId", "collectionId", "webflowItemId");

CREATE INDEX "WebflowCmsItem_workspaceId_slug_idx"
  ON "WebflowCmsItem"("workspaceId", "slug");

CREATE INDEX "WebflowCmsItem_workspaceId_status_idx"
  ON "WebflowCmsItem"("workspaceId", "status");

CREATE INDEX "WebflowCmsItem_workspaceId_lastUpdatedAt_idx"
  ON "WebflowCmsItem"("workspaceId", "lastUpdatedAt");

CREATE INDEX "WebflowCmsItem_collectionId_idx"
  ON "WebflowCmsItem"("collectionId");

CREATE INDEX "WebflowSyncRun_workspaceId_startedAt_idx"
  ON "WebflowSyncRun"("workspaceId", "startedAt");

ALTER TABLE "WebflowCmsItem"
  ADD CONSTRAINT "WebflowCmsItem_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "EditorialWorkspace"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WebflowSyncRun"
  ADD CONSTRAINT "WebflowSyncRun_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "EditorialWorkspace"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
