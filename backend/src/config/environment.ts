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
  const backgroundJobs = String(env.BACKGROUND_JOBS_ENABLED ?? (env.VERCEL ? 'false' : 'true'));
  if (!['true', 'false'].includes(backgroundJobs)) throw new Error('BACKGROUND_JOBS_ENABLED must be true or false');
  const cronSecret = String(env.CRON_SECRET ?? '');
  if (cronSecret && cronSecret.length < 32) throw new Error('CRON_SECRET must have at least 32 characters');
  const dailyLimit = Number(env.FOOTBALL_DAILY_LIMIT ?? 100);
  if (!Number.isInteger(dailyLimit) || dailyLimit < 6 || dailyLimit > 1000000) throw new Error('FOOTBALL_DAILY_LIMIT must be an integer >= 6');
  if (env.VERCEL && autoSync === 'true') throw new Error('Use replay jobs on Vercel; AUTO_SYNC_ENABLED must be false');
  if (env.VERCEL && backgroundJobs === 'true') throw new Error('BACKGROUND_JOBS_ENABLED must be false on Vercel');
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
    BACKGROUND_JOBS_ENABLED: backgroundJobs === 'true',
    CRON_SECRET: cronSecret,
    FOOTBALL_DAILY_LIMIT: dailyLimit,
    DATABASE_URL: databaseUrl,
    FRONTEND_URL: String(env.FRONTEND_URL ?? 'http://localhost:3000'),
  };
}
