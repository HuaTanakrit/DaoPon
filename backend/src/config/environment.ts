export function validateEnvironment(env: Record<string, unknown>) {
  const port = Number(env.PORT ?? 3001);
  const season = Number(env.AUTO_SYNC_SEASON ?? 2024);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  if (!Number.isInteger(season) || season < 2000 || season > 2100) {
    throw new Error('AUTO_SYNC_SEASON must be a valid season start year');
  }
  const autoSync = String(env.AUTO_SYNC_ENABLED ?? 'false');
  const replayStatsSync = String(env.REPLAY_STATS_SYNC_ENABLED ?? 'false');
  const predictionScoring = String(env.PREDICTION_SCORING_ENABLED ?? 'false');
  const demoEnabled = String(env.DEMO_CONTROLS_ENABLED ?? 'false');
  if (!['true', 'false'].includes(demoEnabled)) throw new Error('DEMO_CONTROLS_ENABLED must be true or false');
  if (demoEnabled === 'true' && String(env.DEMO_CONTROL_TOKEN ?? '').length < 32) throw new Error('Demo control requires a private token of at least 32 characters');
  if (!['true', 'false'].includes(predictionScoring)) throw new Error('PREDICTION_SCORING_ENABLED must be true or false');
  if (!['true', 'false'].includes(replayStatsSync)) throw new Error('REPLAY_STATS_SYNC_ENABLED must be true or false');
  if (!['true', 'false'].includes(autoSync)) {
    throw new Error('AUTO_SYNC_ENABLED must be true or false');
  }
  const databaseUrl = String(env.DATABASE_URL ?? '').trim();
  if (databaseUrl && !/^postgres(?:ql)?:\/\//.test(databaseUrl)) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string');
  }
  if ((autoSync === 'true' || replayStatsSync === 'true' || predictionScoring === 'true') && (!databaseUrl || !env.API_FOOTBALL_KEY)) {
    throw new Error('Automatic sync requires DATABASE_URL and API_FOOTBALL_KEY');
  }
  return {
    ...env,
    PORT: port,
    AUTO_SYNC_SEASON: season,
    AUTO_SYNC_ENABLED: autoSync === 'true',
    REPLAY_STATS_SYNC_ENABLED: replayStatsSync === 'true',
    PREDICTION_SCORING_ENABLED: predictionScoring === 'true',
    DEMO_CONTROLS_ENABLED: demoEnabled === 'true',
    DATABASE_URL: databaseUrl,
    FRONTEND_URL: String(env.FRONTEND_URL ?? 'http://localhost:3000'),
  };
}
