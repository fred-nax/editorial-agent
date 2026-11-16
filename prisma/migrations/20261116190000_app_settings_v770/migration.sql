-- V7.7.0 — Configuration OpenAI / WordPress persistée (additive, non destructive).
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "clientName" TEXT,
    "siteName" TEXT,
    "openaiAgentId" TEXT,
    "openaiApiKeyEncrypted" TEXT,
    "wpUrl" TEXT,
    "wpUsername" TEXT,
    "wpAppPasswordEncrypted" TEXT,
    "inventoryWpOrigin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);
