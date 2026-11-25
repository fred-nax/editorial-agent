-- V7.11.2 — Langues éditoriales par défaut (additive, non destructive)
-- WordPress : fr (français / fr-FR)
-- Webflow : en-US
-- Ne touche pas aux générations / sujets existants.

UPDATE "EditorialWorkspace"
SET
  "defaultLanguage" = 'en-US',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'ws_webflow_ai_studio_01'
  AND "defaultLanguage" IN ('fr', 'fr-FR', 'fr_FR');

UPDATE "WorkspaceCmsSettings"
SET
  "defaultLanguage" = 'en-US',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "workspaceId" = 'ws_webflow_ai_studio_01'
  AND (
    "defaultLanguage" IS NULL
    OR "defaultLanguage" IN ('fr', 'fr-FR', 'fr_FR')
  );

UPDATE "EditorialWorkspace"
SET
  "defaultLanguage" = 'fr',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'ws_wordpress_naxialis'
  AND "defaultLanguage" IN ('fr-FR', 'fr_FR');

UPDATE "WorkspaceCmsSettings"
SET
  "defaultLanguage" = 'fr',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "workspaceId" = 'ws_wordpress_naxialis'
  AND "defaultLanguage" IN ('fr-FR', 'fr_FR');
