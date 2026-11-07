-- CreateTable
CREATE TABLE "EditorialWatchSearch" (
    "id" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "periodDays" INTEGER NOT NULL,
    "country" TEXT NOT NULL,
    "searchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "articleCount" INTEGER NOT NULL,
    "results" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',

    CONSTRAINT "EditorialWatchSearch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EditorialWatchSearch_searchedAt_idx" ON "EditorialWatchSearch"("searchedAt");
