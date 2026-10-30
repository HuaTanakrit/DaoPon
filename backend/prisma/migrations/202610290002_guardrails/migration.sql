-- PostgreSQL checks that Prisma's schema language cannot express directly.
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_different_teams"
  CHECK ("homeTeamId" <> "awayTeamId");
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_nonnegative_scores"
  CHECK (
    "homeGoals" >= 0 AND "awayGoals" >= 0
    AND "homeHalftimeGoals" >= 0 AND "awayHalftimeGoals" >= 0
    AND "homeFulltimeGoals" >= 0 AND "awayFulltimeGoals" >= 0
    AND "homeExtraTimeGoals" >= 0 AND "awayExtraTimeGoals" >= 0
    AND "homePenaltyGoals" >= 0 AND "awayPenaltyGoals" >= 0
  );
ALTER TABLE "player_match_stats" ADD CONSTRAINT "match_stats_valid_values"
  CHECK ("minutes" >= 0 AND "goals" >= 0 AND "assists" >= 0
    AND "yellowCards" >= 0 AND "redCards" >= 0
    AND ("rating" IS NULL OR ("rating" >= 0 AND "rating" <= 10)));
ALTER TABLE "player_season_stats" ADD CONSTRAINT "season_stats_valid_values"
  CHECK ("appearances" >= 0 AND "starts" >= 0 AND "minutes" >= 0
    AND "goals" >= 0 AND "assists" >= 0
    AND ("rating" IS NULL OR ("rating" >= 0 AND "rating" <= 10)));
ALTER TABLE "match_events" ADD CONSTRAINT "events_nonnegative_sequence"
  CHECK ("sequence" >= 0);
ALTER TABLE "sync_jobs" ADD CONSTRAINT "jobs_valid_attempts"
  CHECK ("attempts" >= 0 AND "maxAttempts" > 0);
