-- Indications éditoriales facultatives saisies à la génération (nullable, additif).
ALTER TABLE "ArticleGeneration" ADD COLUMN IF NOT EXISTS "editorialContext" JSONB;
