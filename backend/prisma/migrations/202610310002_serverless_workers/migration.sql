CREATE TABLE "worker_leases" (
  "id" TEXT PRIMARY KEY,
  "owner" TEXT NOT NULL,
  "lockedUntil" TIMESTAMPTZ(3) NOT NULL
);
CREATE TABLE "football_api_state" (
  "keyHash" TEXT PRIMARY KEY,
  "day" TEXT NOT NULL,
  "used" INTEGER NOT NULL DEFAULT 0 CHECK ("used" >= 0),
  "providerRemaining" INTEGER,
  "nextAllowedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE TABLE "rate_limit_buckets" (
  "id" TEXT PRIMARY KEY,
  "count" INTEGER NOT NULL CHECK ("count" >= 0),
  "expiresAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "rate_limit_buckets_expiresAt_idx" ON "rate_limit_buckets" ("expiresAt");
