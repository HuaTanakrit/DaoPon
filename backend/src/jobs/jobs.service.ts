import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { ReplayClockService } from '../fixtures/replay-clock.service';
import { replayClock } from '../fixtures/replay-clock';
import { PredictionScoringService } from '../predictions/prediction-scoring.service';
import { ReplayStatsService } from '../players/replay-stats.service';

@Injectable()
export class JobsService {
  constructor(private readonly db: PrismaService, private readonly scoring: PredictionScoringService,
    private readonly stats: ReplayStatsService, private readonly clock: ReplayClockService, private readonly config: ConfigService) {}

  async run(fixtureApiId?: number, scoreOnly = false) {
    const owner = randomUUID(), now = new Date(Date.now());
    const lease = await this.db.client.$queryRaw<Array<{ id: string }>>`
      INSERT INTO worker_leases (id,owner,"lockedUntil") VALUES ('replay-worker',${owner},${new Date(now.getTime() + 120000)})
      ON CONFLICT (id) DO UPDATE SET owner=EXCLUDED.owner,"lockedUntil"=EXCLUDED."lockedUntil"
      WHERE worker_leases."lockedUntil" <= ${now} RETURNING id`;
    if (!lease.length) return { status: 'busy', message: 'Another worker is processing a match' };
    try {
      return await this.clock.run(async () => {
        const scoring = await this.scoring.processDueJob(fixtureApiId);
        // One bounded unit per HTTP invocation; pending account scores take priority.
        const stats = !scoreOnly && ['idle', 'disabled'].includes(scoring.status)
          && this.config.get<boolean>('REPLAY_STATS_SYNC_ENABLED') === true
          ? await this.stats.syncMissing(1, 1, false) : null;
        await this.db.client.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } });
        return { status: 'ok', scoring, stats, clock: replayClock() };
      });
    } catch (error) {
      // An exhausted daily budget is a normal pause, not a broken scheduler URL.
      if (error instanceof HttpException && error.getStatus() === 429) {
        const retryAt = new Date(Date.now()); retryAt.setUTCHours(24, 5, 0, 0);
        return { status: 'deferred', reason: 'provider_quota', retryAt: retryAt.toISOString() };
      }
      throw error;
    } finally {
      await this.db.client.workerLease.deleteMany({ where: { id: 'replay-worker', owner } });
    }
  }
}
