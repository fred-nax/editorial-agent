-- GEO 1.1.1 — bilan de réanalyse (non destructif)
ALTER TABLE "VisibilityCampaign"
  ADD COLUMN IF NOT EXISTS "reanalyzeReport" JSONB;
