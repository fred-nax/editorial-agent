-- Inventaire WordPress : type de contenu post|page (additif).
-- Les lignes existantes restent des articles (DEFAULT 'post').

ALTER TABLE "WordPressPost"
  ADD COLUMN IF NOT EXISTS "contentType" TEXT NOT NULL DEFAULT 'post';

CREATE INDEX IF NOT EXISTS "WordPressPost_contentType_idx"
  ON "WordPressPost"("contentType");
