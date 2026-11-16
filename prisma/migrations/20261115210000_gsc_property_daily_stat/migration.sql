-- V7.6.1b — Totaux GSC quotidiens au niveau propriété (additif).
-- Ne touche pas aux tables GSC/GA4/éditoriales existantes.

CREATE TABLE "GscPropertyDailyStat" (
    "id" TEXT NOT NULL,
    "propertyUrl" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "clicks" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impressions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hasData" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GscPropertyDailyStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GscPropertyDailyStat_propertyUrl_date_key"
  ON "GscPropertyDailyStat"("propertyUrl", "date");

CREATE INDEX "GscPropertyDailyStat_propertyUrl_date_idx"
  ON "GscPropertyDailyStat"("propertyUrl", "date");
