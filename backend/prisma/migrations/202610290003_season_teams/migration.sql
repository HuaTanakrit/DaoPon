CREATE TABLE "season_teams" (
    "seasonId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "syncedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "season_teams_pkey" PRIMARY KEY ("seasonId", "teamId")
);
CREATE INDEX "season_teams_teamId_idx" ON "season_teams"("teamId");
ALTER TABLE "season_teams" ADD CONSTRAINT "season_teams_seasonId_fkey"
  FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "season_teams" ADD CONSTRAINT "season_teams_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
