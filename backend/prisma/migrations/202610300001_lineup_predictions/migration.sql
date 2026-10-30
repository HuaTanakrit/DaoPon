CREATE TABLE "lineup_predictions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ownerHash" VARCHAR(64) NOT NULL,
  "fixtureId" INTEGER NOT NULL REFERENCES "fixtures"("id") ON DELETE CASCADE,
  "teamId" INTEGER NOT NULL REFERENCES "teams"("id") ON DELETE RESTRICT,
  "formation" VARCHAR(16) NOT NULL CHECK ("formation" IN ('4-3-3','4-4-2','4-2-3-1','3-5-2')),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL
);
CREATE UNIQUE INDEX "lineup_predictions_ownerHash_fixtureId_teamId_key" ON "lineup_predictions"("ownerHash","fixtureId","teamId");
CREATE INDEX "lineup_predictions_fixtureId_teamId_idx" ON "lineup_predictions"("fixtureId","teamId");
CREATE INDEX "lineup_predictions_teamId_idx" ON "lineup_predictions"("teamId");
CREATE TABLE "prediction_picks" (
  "predictionId" TEXT NOT NULL REFERENCES "lineup_predictions"("id") ON DELETE CASCADE,
  "playerId" INTEGER NOT NULL REFERENCES "players"("id") ON DELETE RESTRICT,
  "slot" INTEGER NOT NULL CHECK ("slot" BETWEEN 0 AND 10),
  PRIMARY KEY ("predictionId", "slot")
);
CREATE UNIQUE INDEX "prediction_picks_predictionId_playerId_key" ON "prediction_picks"("predictionId","playerId");
CREATE INDEX "prediction_picks_playerId_idx" ON "prediction_picks"("playerId");
