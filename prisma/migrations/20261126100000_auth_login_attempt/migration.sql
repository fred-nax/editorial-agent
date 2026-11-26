-- AUTH-001: persistent login rate-limit attempts
CREATE TABLE "AuthLoginAttempt" (
    "id" TEXT NOT NULL,
    "loginKey" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthLoginAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuthLoginAttempt_bucketKey_attemptedAt_idx" ON "AuthLoginAttempt"("bucketKey", "attemptedAt");
CREATE INDEX "AuthLoginAttempt_attemptedAt_idx" ON "AuthLoginAttempt"("attemptedAt");