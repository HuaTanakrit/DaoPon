CREATE TABLE "users" (
 "id" TEXT PRIMARY KEY, "email" VARCHAR(254) NOT NULL UNIQUE,
 "displayName" VARCHAR(40) NOT NULL, "passwordHash" TEXT NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "auth_sessions" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 "tokenHash" VARCHAR(64) NOT NULL UNIQUE, "expiresAt" TIMESTAMPTZ(3) NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions"("userId");
CREATE INDEX "auth_sessions_expiresAt_idx" ON "auth_sessions"("expiresAt");
ALTER TABLE "lineup_predictions"
 ADD COLUMN "userId" TEXT REFERENCES users(id) ON DELETE CASCADE,
 ADD COLUMN "submittedReplayAt" TIMESTAMPTZ(3),
 ADD COLUMN "score" INTEGER CHECK (score BETWEEN 0 AND 11),
 ADD COLUMN "scoredAt" TIMESTAMPTZ(3),
 ADD COLUMN "matchedPlayerApiIds" INTEGER[] NOT NULL DEFAULT '{}';
UPDATE "lineup_predictions" SET "submittedReplayAt" = (("updatedAt" AT TIME ZONE 'Asia/Bangkok') - INTERVAL '2 years') AT TIME ZONE 'Asia/Bangkok';
ALTER TABLE "lineup_predictions" ALTER COLUMN "submittedReplayAt" SET NOT NULL;
CREATE UNIQUE INDEX "lineup_predictions_userId_fixtureId_teamId_key" ON "lineup_predictions"("userId","fixtureId","teamId");
