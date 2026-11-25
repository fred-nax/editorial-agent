-- V7.14.0 — Search Console multi-espace (Webflow) : additif, préserve WordPress.

-- Identifiant CMS générique (Webflow item ID) à côté de wpPostId historique.
ALTER TABLE "GscPageDailyStat" ADD COLUMN IF NOT EXISTS "cmsExternalId" TEXT;
CREATE INDEX IF NOT EXISTS "GscPageDailyStat_cmsExternalId_idx"
  ON "GscPageDailyStat"("cmsExternalId");

-- Domaine public / activation GSC côté paramètres CMS workspace (Webflow).
ALTER TABLE "WorkspaceCmsSettings" ADD COLUMN IF NOT EXISTS "gscPublicSiteUrl" TEXT;

-- Rattacher les stats GSC orphelines (workspaceId NULL) à WordPress
-- uniquement lorsque la propriété correspond à la sélection WordPress connue.
UPDATE "GscPropertyDailyStat" AS s
SET "workspaceId" = 'ws_wordpress_naxialis'
FROM "GooglePropertySelection" AS sel
WHERE s."workspaceId" IS NULL
  AND sel."workspaceId" = 'ws_wordpress_naxialis'
  AND sel."gscPropertyUrl" IS NOT NULL
  AND s."propertyUrl" = sel."gscPropertyUrl";

UPDATE "GscPageDailyStat" AS s
SET "workspaceId" = 'ws_wordpress_naxialis'
FROM "GooglePropertySelection" AS sel
WHERE s."workspaceId" IS NULL
  AND sel."workspaceId" = 'ws_wordpress_naxialis'
  AND sel."gscPropertyUrl" IS NOT NULL
  AND s."propertyUrl" = sel."gscPropertyUrl";

UPDATE "GscQueryDailyStat" AS s
SET "workspaceId" = 'ws_wordpress_naxialis'
FROM "GooglePropertySelection" AS sel
WHERE s."workspaceId" IS NULL
  AND sel."workspaceId" = 'ws_wordpress_naxialis'
  AND sel."gscPropertyUrl" IS NOT NULL
  AND s."propertyUrl" = sel."gscPropertyUrl";

UPDATE "GoogleSyncRun" AS r
SET "workspaceId" = 'ws_wordpress_naxialis'
WHERE r."workspaceId" IS NULL;
