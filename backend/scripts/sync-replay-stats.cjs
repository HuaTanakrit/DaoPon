require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { ReplayStatsService } = require('../dist/players/replay-stats.service');

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    console.log(JSON.stringify(await app.get(ReplayStatsService).syncMissing()));
  } finally { await app.close(); }
})().catch(() => { console.error('REPLAY_STATS_IMPORT_FAILED'); process.exitCode = 1; });
