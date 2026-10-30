-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SyncJobKind" AS ENUM ('LINEUPS', 'FINAL_STATS', 'RECONCILE');

-- CreateEnum
CREATE TYPE "SyncJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'UNSUPPORTED');

-- CreateTable
CREATE TABLE "leagues" (
    "id" SERIAL NOT NULL,
    "apiId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "logoUrl" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "leagues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" SERIAL NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "startsOn" DATE,
    "endsOn" DATE,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "coverage" JSONB,
    "accessVerifiedAt" TIMESTAMPTZ(3),
    "fixturesSyncedAt" TIMESTAMPTZ(3),

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" SERIAL NOT NULL,
    "apiId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" SERIAL NOT NULL,
    "apiId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "birthDate" DATE,
    "nationality" TEXT,
    "heightCm" INTEGER,
    "weightKg" INTEGER,
    "photoUrl" TEXT,
    "profileSyncedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coaches" (
    "id" SERIAL NOT NULL,
    "apiId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "photoUrl" TEXT,

    CONSTRAINT "coaches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixtures" (
    "id" SERIAL NOT NULL,
    "apiId" INTEGER NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "homeTeamId" INTEGER NOT NULL,
    "awayTeamId" INTEGER NOT NULL,
    "kickoffAt" TIMESTAMPTZ(3),
    "round" TEXT,
    "status" TEXT NOT NULL,
    "elapsed" INTEGER,
    "extraMinutes" INTEGER,
    "referee" TEXT,
    "venueApiId" INTEGER,
    "venueName" TEXT,
    "venueCity" TEXT,
    "homeGoals" INTEGER,
    "awayGoals" INTEGER,
    "homeHalftimeGoals" INTEGER,
    "awayHalftimeGoals" INTEGER,
    "homeFulltimeGoals" INTEGER,
    "awayFulltimeGoals" INTEGER,
    "homeExtraTimeGoals" INTEGER,
    "awayExtraTimeGoals" INTEGER,
    "homePenaltyGoals" INTEGER,
    "awayPenaltyGoals" INTEGER,
    "fixtureSyncedAt" TIMESTAMPTZ(3),
    "lineupsSyncedAt" TIMESTAMPTZ(3),
    "playerStatsSyncedAt" TIMESTAMPTZ(3),
    "eventsSyncedAt" TIMESTAMPTZ(3),
    "rawPayload" JSONB,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fixtures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fixture_lineups" (
    "fixtureId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "coachId" INTEGER,
    "formation" TEXT,
    "rawPayload" JSONB,
    "syncedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fixture_lineups_pkey" PRIMARY KEY ("fixtureId","teamId")
);

-- CreateTable
CREATE TABLE "lineup_players" (
    "fixtureId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "isStarter" BOOLEAN NOT NULL,
    "shirtNumber" INTEGER,
    "position" TEXT,
    "grid" TEXT,

    CONSTRAINT "lineup_players_pkey" PRIMARY KEY ("fixtureId","playerId")
);

-- CreateTable
CREATE TABLE "player_match_stats" (
    "fixtureId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "minutes" INTEGER,
    "shirtNumber" INTEGER,
    "position" TEXT,
    "rating" DECIMAL(10,6),
    "isCaptain" BOOLEAN,
    "isSubstitute" BOOLEAN,
    "goals" INTEGER,
    "assists" INTEGER,
    "goalsConceded" INTEGER,
    "saves" INTEGER,
    "shotsTotal" INTEGER,
    "shotsOnTarget" INTEGER,
    "passesTotal" INTEGER,
    "keyPasses" INTEGER,
    "passesAccuracy" TEXT,
    "tacklesTotal" INTEGER,
    "interceptions" INTEGER,
    "yellowCards" INTEGER,
    "redCards" INTEGER,
    "rawStatistics" JSONB NOT NULL,
    "syncedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "player_match_stats_pkey" PRIMARY KEY ("fixtureId","playerId")
);

-- CreateTable
CREATE TABLE "player_season_stats" (
    "seasonId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "appearances" INTEGER,
    "starts" INTEGER,
    "minutes" INTEGER,
    "position" TEXT,
    "rating" DECIMAL(10,6),
    "goals" INTEGER,
    "assists" INTEGER,
    "goalsConceded" INTEGER,
    "saves" INTEGER,
    "yellowCards" INTEGER,
    "yellowRedCards" INTEGER,
    "redCards" INTEGER,
    "rawStatistics" JSONB NOT NULL,
    "syncedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "player_season_stats_pkey" PRIMARY KEY ("seasonId","teamId","playerId")
);

-- CreateTable
CREATE TABLE "match_events" (
    "fixtureId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "teamId" INTEGER,
    "playerId" INTEGER,
    "relatedPlayerId" INTEGER,
    "playerName" TEXT,
    "relatedPlayerName" TEXT,
    "minute" INTEGER,
    "extraMinute" INTEGER,
    "type" TEXT NOT NULL,
    "detail" TEXT,
    "comments" TEXT,
    "rawPayload" JSONB NOT NULL,

    CONSTRAINT "match_events_pkey" PRIMARY KEY ("fixtureId","sequence")
);

-- CreateTable
CREATE TABLE "sync_jobs" (
    "id" SERIAL NOT NULL,
    "fixtureId" INTEGER NOT NULL,
    "kind" "SyncJobKind" NOT NULL,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'PENDING',
    "runAt" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "lockedUntil" TIMESTAMPTZ(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leagues_apiId_key" ON "leagues"("apiId");

-- CreateIndex
CREATE UNIQUE INDEX "seasons_leagueId_year_key" ON "seasons"("leagueId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "teams_apiId_key" ON "teams"("apiId");

-- CreateIndex
CREATE UNIQUE INDEX "players_apiId_key" ON "players"("apiId");

-- CreateIndex
CREATE UNIQUE INDEX "coaches_apiId_key" ON "coaches"("apiId");

-- CreateIndex
CREATE UNIQUE INDEX "fixtures_apiId_key" ON "fixtures"("apiId");

-- CreateIndex
CREATE INDEX "fixtures_seasonId_kickoffAt_idx" ON "fixtures"("seasonId", "kickoffAt");

-- CreateIndex
CREATE INDEX "fixtures_homeTeamId_kickoffAt_idx" ON "fixtures"("homeTeamId", "kickoffAt");

-- CreateIndex
CREATE INDEX "fixtures_awayTeamId_kickoffAt_idx" ON "fixtures"("awayTeamId", "kickoffAt");

-- CreateIndex
CREATE INDEX "fixtures_status_kickoffAt_idx" ON "fixtures"("status", "kickoffAt");

-- CreateIndex
CREATE INDEX "fixture_lineups_teamId_idx" ON "fixture_lineups"("teamId");

-- CreateIndex
CREATE INDEX "fixture_lineups_coachId_idx" ON "fixture_lineups"("coachId");

-- CreateIndex
CREATE INDEX "lineup_players_fixtureId_teamId_idx" ON "lineup_players"("fixtureId", "teamId");

-- CreateIndex
CREATE INDEX "lineup_players_playerId_idx" ON "lineup_players"("playerId");

-- CreateIndex
CREATE INDEX "player_match_stats_playerId_fixtureId_idx" ON "player_match_stats"("playerId", "fixtureId");

-- CreateIndex
CREATE INDEX "player_match_stats_teamId_fixtureId_idx" ON "player_match_stats"("teamId", "fixtureId");

-- CreateIndex
CREATE INDEX "player_season_stats_seasonId_goals_idx" ON "player_season_stats"("seasonId", "goals");

-- CreateIndex
CREATE INDEX "player_season_stats_seasonId_assists_idx" ON "player_season_stats"("seasonId", "assists");

-- CreateIndex
CREATE INDEX "player_season_stats_playerId_seasonId_idx" ON "player_season_stats"("playerId", "seasonId");

-- CreateIndex
CREATE INDEX "player_season_stats_teamId_idx" ON "player_season_stats"("teamId");

-- CreateIndex
CREATE INDEX "match_events_fixtureId_type_idx" ON "match_events"("fixtureId", "type");

-- CreateIndex
CREATE INDEX "match_events_teamId_idx" ON "match_events"("teamId");

-- CreateIndex
CREATE INDEX "match_events_playerId_idx" ON "match_events"("playerId");

-- CreateIndex
CREATE INDEX "match_events_relatedPlayerId_idx" ON "match_events"("relatedPlayerId");

-- CreateIndex
CREATE INDEX "sync_jobs_status_runAt_idx" ON "sync_jobs"("status", "runAt");

-- CreateIndex
CREATE INDEX "sync_jobs_status_lockedUntil_idx" ON "sync_jobs"("status", "lockedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "sync_jobs_fixtureId_kind_key" ON "sync_jobs"("fixtureId", "kind");

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixture_lineups" ADD CONSTRAINT "fixture_lineups_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "fixtures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixture_lineups" ADD CONSTRAINT "fixture_lineups_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixture_lineups" ADD CONSTRAINT "fixture_lineups_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coaches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineup_players" ADD CONSTRAINT "lineup_players_fixtureId_teamId_fkey" FOREIGN KEY ("fixtureId", "teamId") REFERENCES "fixture_lineups"("fixtureId", "teamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lineup_players" ADD CONSTRAINT "lineup_players_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_match_stats" ADD CONSTRAINT "player_match_stats_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "fixtures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_match_stats" ADD CONSTRAINT "player_match_stats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_match_stats" ADD CONSTRAINT "player_match_stats_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_season_stats" ADD CONSTRAINT "player_season_stats_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_season_stats" ADD CONSTRAINT "player_season_stats_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_season_stats" ADD CONSTRAINT "player_season_stats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "fixtures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_relatedPlayerId_fkey" FOREIGN KEY ("relatedPlayerId") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "fixtures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

