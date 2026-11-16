-- V7.6.1 — Intégration Google Search Console + GA4 (additif, mono-site).
-- Aucune table métier existante n’est altérée ni supprimée.

CREATE TABLE "GoogleConnection" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "googleAccountEmail" TEXT,
    "googleAccountSub" TEXT,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "lastError" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GooglePropertySelection" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "connectionId" TEXT NOT NULL,
    "gscPropertyUrl" TEXT,
    "gscPropertyType" TEXT,
    "gscPermissionLevel" TEXT,
    "ga4AccountId" TEXT,
    "ga4PropertyId" TEXT,
    "ga4PropertyName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GooglePropertySelection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GooglePropertySelection_connectionId_key" ON "GooglePropertySelection"("connectionId");

ALTER TABLE "GooglePropertySelection"
  ADD CONSTRAINT "GooglePropertySelection_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "GoogleConnection"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GoogleSyncRun" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL DEFAULT 'default',
    "status" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "gscUpserted" INTEGER NOT NULL DEFAULT 0,
    "ga4Upserted" INTEGER NOT NULL DEFAULT 0,
    "rangeStart" DATE,
    "rangeEnd" DATE,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "GoogleSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GoogleSyncRun_status_idx" ON "GoogleSyncRun"("status");
CREATE INDEX "GoogleSyncRun_startedAt_idx" ON "GoogleSyncRun"("startedAt");

ALTER TABLE "GoogleSyncRun"
  ADD CONSTRAINT "GoogleSyncRun_connectionId_fkey"
  FOREIGN KEY ("connectionId") REFERENCES "GoogleConnection"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GscPageDailyStat" (
    "id" TEXT NOT NULL,
    "propertyUrl" TEXT NOT NULL,
    "pageUrl" TEXT NOT NULL,
    "pageUrlNorm" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "clicks" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impressions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hasData" BOOLEAN NOT NULL DEFAULT true,
    "wpPostId" INTEGER,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GscPageDailyStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GscPageDailyStat_propertyUrl_pageUrlNorm_date_key"
  ON "GscPageDailyStat"("propertyUrl", "pageUrlNorm", "date");
CREATE INDEX "GscPageDailyStat_propertyUrl_date_idx" ON "GscPageDailyStat"("propertyUrl", "date");
CREATE INDEX "GscPageDailyStat_pageUrlNorm_idx" ON "GscPageDailyStat"("pageUrlNorm");
CREATE INDEX "GscPageDailyStat_wpPostId_idx" ON "GscPageDailyStat"("wpPostId");

CREATE TABLE "GscQueryDailyStat" (
    "id" TEXT NOT NULL,
    "propertyUrl" TEXT NOT NULL,
    "pageUrlNorm" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "clicks" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impressions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GscQueryDailyStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GscQueryDailyStat_propertyUrl_pageUrlNorm_query_date_key"
  ON "GscQueryDailyStat"("propertyUrl", "pageUrlNorm", "query", "date");
CREATE INDEX "GscQueryDailyStat_propertyUrl_pageUrlNorm_date_idx"
  ON "GscQueryDailyStat"("propertyUrl", "pageUrlNorm", "date");

CREATE TABLE "Ga4PageDailyStat" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "pagePath" TEXT NOT NULL,
    "pageUrlNorm" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "totalUsers" INTEGER NOT NULL DEFAULT 0,
    "engagedSessions" INTEGER NOT NULL DEFAULT 0,
    "aiSessions" INTEGER NOT NULL DEFAULT 0,
    "wpPostId" INTEGER,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ga4PageDailyStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Ga4PageDailyStat_propertyId_pageUrlNorm_date_key"
  ON "Ga4PageDailyStat"("propertyId", "pageUrlNorm", "date");
CREATE INDEX "Ga4PageDailyStat_propertyId_date_idx" ON "Ga4PageDailyStat"("propertyId", "date");
CREATE INDEX "Ga4PageDailyStat_pageUrlNorm_idx" ON "Ga4PageDailyStat"("pageUrlNorm");
CREATE INDEX "Ga4PageDailyStat_wpPostId_idx" ON "Ga4PageDailyStat"("wpPostId");

CREATE TABLE "Ga4PageSourceDailyStat" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "pageUrlNorm" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ga4PageSourceDailyStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Ga4PageSourceDailyStat_propertyId_pageUrlNorm_date_sourceKey_key"
  ON "Ga4PageSourceDailyStat"("propertyId", "pageUrlNorm", "date", "sourceKey");
CREATE INDEX "Ga4PageSourceDailyStat_propertyId_pageUrlNorm_date_idx"
  ON "Ga4PageSourceDailyStat"("propertyId", "pageUrlNorm", "date");
