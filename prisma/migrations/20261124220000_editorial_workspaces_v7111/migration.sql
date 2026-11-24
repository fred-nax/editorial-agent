-- V7.11.1 — Espaces éditoriaux (additive, non destructive)
-- Ne DROP aucune table GEO (Visibility*). Ne touche pas 20261103173400_drop_ai_visibility_monitor.

-- ---------------------------------------------------------------------------
-- 1. Tables espaces + settings + journal d'ambiguïtés
-- ---------------------------------------------------------------------------

CREATE TABLE "EditorialWorkspace" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cmsProvider" TEXT NOT NULL,
    "siteUrl" TEXT,
    "siteLabel" TEXT,
    "defaultLanguage" TEXT NOT NULL DEFAULT 'fr',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EditorialWorkspace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EditorialWorkspace_slug_key" ON "EditorialWorkspace"("slug");
CREATE INDEX "EditorialWorkspace_cmsProvider_enabled_idx" ON "EditorialWorkspace"("cmsProvider", "enabled");

CREATE TABLE "WorkspaceCmsSettings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "openaiAgentId" TEXT,
    "wpUrl" TEXT,
    "wpUsername" TEXT,
    "wpAppPasswordEncrypted" TEXT,
    "inventoryWpOrigin" TEXT,
    "inventoryValid" BOOLEAN NOT NULL DEFAULT true,
    "wpCategoriesJson" TEXT,
    "wpAllowedCategoryIds" TEXT,
    "wpDefaultCategoryId" INTEGER,
    "wpCategoriesSyncedAt" TIMESTAMP(3),
    "wpCategoriesOrigin" TEXT,
    "wpSeoPlugin" TEXT,
    "webflowApiTokenEncrypted" TEXT,
    "webflowSiteId" TEXT,
    "webflowCollectionId" TEXT,
    "webflowFieldMappingJson" TEXT,
    "defaultLanguage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceCmsSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceCmsSettings_workspaceId_key" ON "WorkspaceCmsSettings"("workspaceId");

ALTER TABLE "WorkspaceCmsSettings"
  ADD CONSTRAINT "WorkspaceCmsSettings_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "EditorialWorkspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WorkspaceMigrationIssue" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" JSONB,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceMigrationIssue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkspaceMigrationIssue_entityType_entityId_idx"
  ON "WorkspaceMigrationIssue"("entityType", "entityId");
CREATE INDEX "WorkspaceMigrationIssue_resolved_idx"
  ON "WorkspaceMigrationIssue"("resolved");

ALTER TABLE "WorkspaceMigrationIssue"
  ADD CONSTRAINT "WorkspaceMigrationIssue_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "EditorialWorkspace"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Espaces initiaux (IDs stables)
INSERT INTO "EditorialWorkspace" ("id", "slug", "name", "cmsProvider", "siteUrl", "siteLabel", "defaultLanguage", "enabled", "createdAt", "updatedAt")
VALUES
  (
    'ws_wordpress_naxialis',
    'wordpress-naxialis',
    'WordPress naxialis.com',
    'wordpress',
    'https://naxialis.com',
    'naxialis.com',
    'fr',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'ws_webflow_ai_studio_01',
    'webflow-ai-studio-01',
    'Webflow Naxialis AI Studio 01',
    'webflow',
    NULL,
    'Naxialis AI Studio 01',
    'fr',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

-- Copie dual-read : settings CMS depuis AppSettings (si présent)
INSERT INTO "WorkspaceCmsSettings" (
  "id", "workspaceId", "openaiAgentId",
  "wpUrl", "wpUsername", "wpAppPasswordEncrypted",
  "inventoryWpOrigin", "inventoryValid",
  "wpCategoriesJson", "wpAllowedCategoryIds", "wpDefaultCategoryId",
  "wpCategoriesSyncedAt", "wpCategoriesOrigin", "wpSeoPlugin",
  "defaultLanguage", "createdAt", "updatedAt"
)
SELECT
  'wcs_wordpress_naxialis',
  'ws_wordpress_naxialis',
  s."openaiAgentId",
  s."wpUrl", s."wpUsername", s."wpAppPasswordEncrypted",
  s."inventoryWpOrigin", COALESCE(s."inventoryValid", true),
  s."wpCategoriesJson", s."wpAllowedCategoryIds", s."wpDefaultCategoryId",
  s."wpCategoriesSyncedAt", s."wpCategoriesOrigin", s."wpSeoPlugin",
  'fr', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AppSettings" s
WHERE s."id" = 'default'
UNION ALL
SELECT
  'wcs_webflow_ai_studio_01',
  'ws_webflow_ai_studio_01',
  s."openaiWebflowAgentId",
  NULL, NULL, NULL,
  NULL, true,
  NULL, NULL, NULL,
  NULL, NULL, NULL,
  'fr', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "AppSettings" s
WHERE s."id" = 'default';

-- Si AppSettings absent : lignes settings vides
INSERT INTO "WorkspaceCmsSettings" ("id", "workspaceId", "defaultLanguage", "createdAt", "updatedAt")
SELECT v.id, v.ws, 'fr', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
  ('wcs_wordpress_naxialis', 'ws_wordpress_naxialis'),
  ('wcs_webflow_ai_studio_01', 'ws_webflow_ai_studio_01')
) AS v(id, ws)
WHERE NOT EXISTS (
  SELECT 1 FROM "WorkspaceCmsSettings" w WHERE w."workspaceId" = v.ws
);

UPDATE "WorkspaceCmsSettings" w
SET
  "webflowApiTokenEncrypted" = s."webflowApiTokenEncrypted",
  "webflowSiteId" = s."webflowSiteId",
  "webflowCollectionId" = s."webflowCollectionId",
  "webflowFieldMappingJson" = s."webflowFieldMappingJson",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "AppSettings" s
WHERE w."workspaceId" = 'ws_webflow_ai_studio_01'
  AND s."id" = 'default';

-- ---------------------------------------------------------------------------
-- 2. Colonnes workspaceId (nullable d'abord)
-- ---------------------------------------------------------------------------

ALTER TABLE "ArticleGeneration" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "ArticleFeaturedImage" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Topic" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "EditorialWatchSearch" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "WordPressPost" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "WordPressSyncRun" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "CustomTheme" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "ResearchConfig" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "OpportunitySearchRun" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "SeoOpportunity" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "GoogleSyncRun" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "GscPropertyDailyStat" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "GscPageDailyStat" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "GscQueryDailyStat" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Ga4PageDailyStat" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Ga4PageSourceDailyStat" ADD COLUMN "workspaceId" TEXT;

-- GooglePropertySelection : passer de singleton à 1 sélection / espace
ALTER TABLE "GooglePropertySelection" ADD COLUMN "workspaceId" TEXT;

-- ---------------------------------------------------------------------------
-- 3. Backfill déterministe
-- ---------------------------------------------------------------------------

-- Générations : webflow → WS Webflow ; sinon → WS WordPress
UPDATE "ArticleGeneration"
SET "workspaceId" = CASE
  WHEN lower(coalesce("cmsDestination", '')) = 'webflow' THEN 'ws_webflow_ai_studio_01'
  ELSE 'ws_wordpress_naxialis'
END
WHERE "workspaceId" IS NULL;

-- Images : héritent de la génération
UPDATE "ArticleFeaturedImage" i
SET "workspaceId" = g."workspaceId"
FROM "ArticleGeneration" g
WHERE i."generationId" = g."id"
  AND i."workspaceId" IS NULL;

-- Topics liés à une génération : espace de la génération
UPDATE "Topic" t
SET "workspaceId" = g."workspaceId"
FROM "ArticleGeneration" g
WHERE g."topicId" = t."id"
  AND t."workspaceId" IS NULL;

-- Topics liés à plusieurs espaces distincts → ambigu (ne pas assigner)
INSERT INTO "WorkspaceMigrationIssue" ("id", "workspaceId", "entityType", "entityId", "reason", "details", "resolved", "createdAt")
SELECT
  'wmi_topic_multi_' || t."id",
  NULL,
  'Topic',
  t."id",
  'topic_linked_to_multiple_workspaces',
  jsonb_build_object(
    'subject', t."subject",
    'workspaceIds', (
      SELECT jsonb_agg(DISTINCT g."workspaceId")
      FROM "ArticleGeneration" g
      WHERE g."topicId" = t."id" AND g."workspaceId" IS NOT NULL
    )
  ),
  false,
  CURRENT_TIMESTAMP
FROM "Topic" t
WHERE (
  SELECT COUNT(DISTINCT g."workspaceId")
  FROM "ArticleGeneration" g
  WHERE g."topicId" = t."id" AND g."workspaceId" IS NOT NULL
) > 1;

-- Annuler l'assignation des topics multi-espaces
UPDATE "Topic" t
SET "workspaceId" = NULL
WHERE EXISTS (
  SELECT 1 FROM "WorkspaceMigrationIssue" i
  WHERE i."entityType" = 'Topic' AND i."entityId" = t."id"
    AND i."reason" = 'topic_linked_to_multiple_workspaces'
);

-- Topics sans génération : historique vérifié → WordPress (décision produit)
UPDATE "Topic"
SET "workspaceId" = 'ws_wordpress_naxialis'
WHERE "workspaceId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "WorkspaceMigrationIssue" i
    WHERE i."entityType" = 'Topic' AND i."entityId" = "Topic"."id"
      AND i."resolved" = false
  );

-- Veille / inventaire / sync WP / thèmes / configs / opportunités → WordPress
UPDATE "EditorialWatchSearch" SET "workspaceId" = 'ws_wordpress_naxialis' WHERE "workspaceId" IS NULL;
UPDATE "WordPressPost" SET "workspaceId" = 'ws_wordpress_naxialis' WHERE "workspaceId" IS NULL;
UPDATE "WordPressSyncRun" SET "workspaceId" = 'ws_wordpress_naxialis' WHERE "workspaceId" IS NULL;
UPDATE "CustomTheme" SET "workspaceId" = 'ws_wordpress_naxialis' WHERE "workspaceId" IS NULL;
UPDATE "ResearchConfig" SET "workspaceId" = 'ws_wordpress_naxialis' WHERE "workspaceId" IS NULL;
UPDATE "OpportunitySearchRun" SET "workspaceId" = 'ws_wordpress_naxialis' WHERE "workspaceId" IS NULL;
UPDATE "SeoOpportunity" SET "workspaceId" = 'ws_wordpress_naxialis' WHERE "workspaceId" IS NULL;

-- Google historique → WordPress
UPDATE "GooglePropertySelection"
SET "workspaceId" = 'ws_wordpress_naxialis'
WHERE "workspaceId" IS NULL;

UPDATE "GoogleSyncRun"
SET "workspaceId" = 'ws_wordpress_naxialis'
WHERE "workspaceId" IS NULL;

UPDATE "GscPropertyDailyStat" SET "workspaceId" = 'ws_wordpress_naxialis' WHERE "workspaceId" IS NULL;
UPDATE "GscPageDailyStat" SET "workspaceId" = 'ws_wordpress_naxialis' WHERE "workspaceId" IS NULL;
UPDATE "GscQueryDailyStat" SET "workspaceId" = 'ws_wordpress_naxialis' WHERE "workspaceId" IS NULL;
UPDATE "Ga4PageDailyStat" SET "workspaceId" = 'ws_wordpress_naxialis' WHERE "workspaceId" IS NULL;
UPDATE "Ga4PageSourceDailyStat" SET "workspaceId" = 'ws_wordpress_naxialis' WHERE "workspaceId" IS NULL;

-- Images orphelines (pas de génération) → issue, pas d'assignation silencieuse
INSERT INTO "WorkspaceMigrationIssue" ("id", "workspaceId", "entityType", "entityId", "reason", "details", "resolved", "createdAt")
SELECT
  'wmi_image_orphan_' || i."id",
  NULL,
  'ArticleFeaturedImage',
  i."id",
  'featured_image_without_generation_workspace',
  jsonb_build_object('generationId', i."generationId"),
  false,
  CURRENT_TIMESTAMP
FROM "ArticleFeaturedImage" i
WHERE i."workspaceId" IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Garde : refuser NOT NULL s'il reste des ambiguïtés critiques
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  null_gens INT;
  null_topics INT;
  null_images INT;
  null_posts INT;
  null_themes INT;
  null_ops INT;
  null_watch INT;
  null_sync INT;
  null_research INT;
  null_runs INT;
  open_issues INT;
BEGIN
  SELECT COUNT(*) INTO null_gens FROM "ArticleGeneration" WHERE "workspaceId" IS NULL;
  SELECT COUNT(*) INTO null_topics FROM "Topic" WHERE "workspaceId" IS NULL;
  SELECT COUNT(*) INTO null_images FROM "ArticleFeaturedImage" WHERE "workspaceId" IS NULL;
  SELECT COUNT(*) INTO null_posts FROM "WordPressPost" WHERE "workspaceId" IS NULL;
  SELECT COUNT(*) INTO null_themes FROM "CustomTheme" WHERE "workspaceId" IS NULL;
  SELECT COUNT(*) INTO null_ops FROM "SeoOpportunity" WHERE "workspaceId" IS NULL;
  SELECT COUNT(*) INTO null_watch FROM "EditorialWatchSearch" WHERE "workspaceId" IS NULL;
  SELECT COUNT(*) INTO null_sync FROM "WordPressSyncRun" WHERE "workspaceId" IS NULL;
  SELECT COUNT(*) INTO null_research FROM "ResearchConfig" WHERE "workspaceId" IS NULL;
  SELECT COUNT(*) INTO null_runs FROM "OpportunitySearchRun" WHERE "workspaceId" IS NULL;
  SELECT COUNT(*) INTO open_issues FROM "WorkspaceMigrationIssue" WHERE "resolved" = false;

  IF null_gens > 0 OR null_posts > 0 OR null_themes > 0 OR null_ops > 0
     OR null_watch > 0 OR null_sync > 0 OR null_research > 0 OR null_runs > 0 THEN
    RAISE EXCEPTION
      'V7.11.1 backfill incomplete: gens=% topics=% images=% posts=% themes=% ops=% watch=% sync=% research=% runs=% issues=%',
      null_gens, null_topics, null_images, null_posts, null_themes, null_ops, null_watch, null_sync, null_research, null_runs, open_issues;
  END IF;

  IF null_topics > 0 OR null_images > 0 THEN
    RAISE EXCEPTION
      'V7.11.1 ambiguous rows remain (not silently assigned): topics_null=% images_null=% open_issues=% — resolve WorkspaceMigrationIssue then re-run.',
      null_topics, null_images, open_issues;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Contraintes NOT NULL + FK + uniques composites (P0)
-- ---------------------------------------------------------------------------

ALTER TABLE "ArticleGeneration" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "ArticleFeaturedImage" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Topic" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "EditorialWatchSearch" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "WordPressPost" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "WordPressSyncRun" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "CustomTheme" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "ResearchConfig" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "OpportunitySearchRun" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "SeoOpportunity" ALTER COLUMN "workspaceId" SET NOT NULL;

-- GooglePropertySelection : une ligne historique → WordPress
UPDATE "GooglePropertySelection" SET "workspaceId" = 'ws_wordpress_naxialis' WHERE "workspaceId" IS NULL;
ALTER TABLE "GooglePropertySelection" ALTER COLUMN "workspaceId" SET NOT NULL;

-- Drop anciennes uniques globales
DROP INDEX IF EXISTS "WordPressPost_wpPostId_key";
DROP INDEX IF EXISTS "Topic_sourceUrl_subject_key";
DROP INDEX IF EXISTS "SeoOpportunity_fingerprint_key";
DROP INDEX IF EXISTS "CustomTheme_legacyKey_key";
DROP INDEX IF EXISTS "GooglePropertySelection_connectionId_key";

-- FK workspace
ALTER TABLE "ArticleGeneration"
  ADD CONSTRAINT "ArticleGeneration_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "EditorialWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ArticleFeaturedImage"
  ADD CONSTRAINT "ArticleFeaturedImage_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "EditorialWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Topic"
  ADD CONSTRAINT "Topic_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "EditorialWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EditorialWatchSearch"
  ADD CONSTRAINT "EditorialWatchSearch_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "EditorialWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WordPressPost"
  ADD CONSTRAINT "WordPressPost_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "EditorialWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WordPressSyncRun"
  ADD CONSTRAINT "WordPressSyncRun_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "EditorialWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomTheme"
  ADD CONSTRAINT "CustomTheme_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "EditorialWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ResearchConfig"
  ADD CONSTRAINT "ResearchConfig_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "EditorialWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OpportunitySearchRun"
  ADD CONSTRAINT "OpportunitySearchRun_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "EditorialWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SeoOpportunity"
  ADD CONSTRAINT "SeoOpportunity_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "EditorialWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GooglePropertySelection"
  ADD CONSTRAINT "GooglePropertySelection_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "EditorialWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GoogleSyncRun"
  ADD CONSTRAINT "GoogleSyncRun_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "EditorialWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GscPropertyDailyStat"
  ADD CONSTRAINT "GscPropertyDailyStat_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "EditorialWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GscPageDailyStat"
  ADD CONSTRAINT "GscPageDailyStat_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "EditorialWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GscQueryDailyStat"
  ADD CONSTRAINT "GscQueryDailyStat_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "EditorialWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Ga4PageDailyStat"
  ADD CONSTRAINT "Ga4PageDailyStat_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "EditorialWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Ga4PageSourceDailyStat"
  ADD CONSTRAINT "Ga4PageSourceDailyStat_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "EditorialWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Uniques composites
CREATE UNIQUE INDEX "WordPressPost_workspaceId_wpPostId_key" ON "WordPressPost"("workspaceId", "wpPostId");
CREATE UNIQUE INDEX "Topic_workspaceId_sourceUrl_subject_key" ON "Topic"("workspaceId", "sourceUrl", "subject");
CREATE UNIQUE INDEX "SeoOpportunity_workspaceId_fingerprint_key" ON "SeoOpportunity"("workspaceId", "fingerprint");
CREATE UNIQUE INDEX "CustomTheme_workspaceId_legacyKey_key" ON "CustomTheme"("workspaceId", "legacyKey");
CREATE UNIQUE INDEX "GooglePropertySelection_workspaceId_key" ON "GooglePropertySelection"("workspaceId");

-- Index de lecture
CREATE INDEX "ArticleGeneration_workspaceId_createdAt_idx" ON "ArticleGeneration"("workspaceId", "createdAt");
CREATE INDEX "ArticleGeneration_workspaceId_status_idx" ON "ArticleGeneration"("workspaceId", "status");
CREATE INDEX "ArticleGeneration_workspaceId_cmsDestination_idx" ON "ArticleGeneration"("workspaceId", "cmsDestination");
CREATE INDEX "ArticleFeaturedImage_workspaceId_status_idx" ON "ArticleFeaturedImage"("workspaceId", "status");
CREATE INDEX "Topic_workspaceId_status_idx" ON "Topic"("workspaceId", "status");
CREATE INDEX "EditorialWatchSearch_workspaceId_searchedAt_idx" ON "EditorialWatchSearch"("workspaceId", "searchedAt");
CREATE INDEX "WordPressPost_workspaceId_slug_idx" ON "WordPressPost"("workspaceId", "slug");
CREATE INDEX "WordPressSyncRun_workspaceId_startedAt_idx" ON "WordPressSyncRun"("workspaceId", "startedAt");
CREATE INDEX "CustomTheme_workspaceId_active_idx" ON "CustomTheme"("workspaceId", "active");
CREATE INDEX "ResearchConfig_workspaceId_mode_idx" ON "ResearchConfig"("workspaceId", "mode");
CREATE INDEX "OpportunitySearchRun_workspaceId_status_idx" ON "OpportunitySearchRun"("workspaceId", "status");
CREATE INDEX "SeoOpportunity_workspaceId_status_idx" ON "SeoOpportunity"("workspaceId", "status");
CREATE INDEX "GoogleSyncRun_workspaceId_startedAt_idx" ON "GoogleSyncRun"("workspaceId", "startedAt");
CREATE INDEX "GooglePropertySelection_connectionId_idx" ON "GooglePropertySelection"("connectionId");
CREATE INDEX "GscPropertyDailyStat_workspaceId_propertyUrl_date_idx" ON "GscPropertyDailyStat"("workspaceId", "propertyUrl", "date");
CREATE INDEX "GscPageDailyStat_workspaceId_propertyUrl_date_idx" ON "GscPageDailyStat"("workspaceId", "propertyUrl", "date");
CREATE INDEX "GscQueryDailyStat_workspaceId_propertyUrl_pageUrlNorm_date_idx" ON "GscQueryDailyStat"("workspaceId", "propertyUrl", "pageUrlNorm", "date");
CREATE INDEX "Ga4PageDailyStat_workspaceId_propertyId_date_idx" ON "Ga4PageDailyStat"("workspaceId", "propertyId", "date");
CREATE INDEX "Ga4PageSource_ws_prop_path_date_idx" ON "Ga4PageSourceDailyStat"("workspaceId", "propertyId", "pageUrlNorm", "date");
