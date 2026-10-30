CREATE TABLE "score_predictions" (
 "id" TEXT PRIMARY KEY,
 "userId" TEXT NOT NULL REFERENCES "users"(id) ON DELETE CASCADE,
 "fixtureId" INTEGER NOT NULL REFERENCES "fixtures"(id) ON DELETE CASCADE,
 "teamId" INTEGER NOT NULL REFERENCES "teams"(id) ON DELETE RESTRICT,
 "homeGoals" INTEGER NOT NULL CHECK ("homeGoals" BETWEEN 0 AND 99),
 "awayGoals" INTEGER NOT NULL CHECK ("awayGoals" BETWEEN 0 AND 99),
 "points" INTEGER CHECK ("points" IN (0,1,3)),
 "actualHomeGoals" INTEGER CHECK ("actualHomeGoals" BETWEEN 0 AND 99),
 "actualAwayGoals" INTEGER CHECK ("actualAwayGoals" BETWEEN 0 AND 99),
 "scoredAt" TIMESTAMPTZ(3),
 "submittedReplayAt" TIMESTAMPTZ(3) NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE UNIQUE INDEX "score_predictions_userId_fixtureId_teamId_key" ON "score_predictions"("userId","fixtureId","teamId");
CREATE INDEX "score_predictions_fixtureId_teamId_idx" ON "score_predictions"("fixtureId","teamId");
CREATE INDEX "score_predictions_teamId_idx" ON "score_predictions"("teamId");
