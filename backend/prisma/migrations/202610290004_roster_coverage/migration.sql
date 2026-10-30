ALTER TABLE "season_teams"
  ADD COLUMN "playerPagesTotal" INTEGER,
  ADD COLUMN "playerPagesImported" INTEGER,
  ADD COLUMN "playersSyncedAt" TIMESTAMPTZ(3);
