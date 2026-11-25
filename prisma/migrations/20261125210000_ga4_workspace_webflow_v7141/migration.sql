-- V7.14.1 — GA4 multi-espace (Webflow) : additif, préserve WordPress.

ALTER TABLE "Ga4PageDailyStat" ADD COLUMN IF NOT EXISTS "cmsExternalId" TEXT;
CREATE INDEX IF NOT EXISTS "Ga4PageDailyStat_cmsExternalId_idx"
  ON "Ga4PageDailyStat"("cmsExternalId");

-- Rattacher les stats GA4 orphelines à WordPress uniquement si la propriété
-- correspond à la sélection WordPress connue (jamais à Webflow).
UPDATE "Ga4PageDailyStat" AS s
SET "workspaceId" = 'ws_wordpress_naxialis'
FROM "GooglePropertySelection" AS sel
WHERE s."workspaceId" IS NULL
  AND sel."workspaceId" = 'ws_wordpress_naxialis'
  AND sel."ga4PropertyId" IS NOT NULL
  AND s."propertyId" = sel."ga4PropertyId";

UPDATE "Ga4PageSourceDailyStat" AS s
SET "workspaceId" = 'ws_wordpress_naxialis'
FROM "GooglePropertySelection" AS sel
WHERE s."workspaceId" IS NULL
  AND sel."workspaceId" = 'ws_wordpress_naxialis'
  AND sel."ga4PropertyId" IS NOT NULL
  AND s."propertyId" = sel."ga4PropertyId";
