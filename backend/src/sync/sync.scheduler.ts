import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, Interval } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { SyncJob } from '../generated/prisma/client';
import { SyncService } from './sync.service';

@Injectable()
export class SyncScheduler {
  private readonly logger = new Logger(SyncScheduler.name);
  private readonly workerId = randomUUID();
  private busy = false;

  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService,
    private readonly sync: SyncService) {}

  private get enabled() { return this.config.get<boolean>('AUTO_SYNC_ENABLED') === true && this.prisma.configured; }

  @Cron('15 7 * * *', { timeZone: 'Asia/Bangkok', waitForCompletion: true })
  async refreshFixtures() {
    if (!this.enabled) return;
    try { await this.sync.seasonFixtures(this.config.get<number>('AUTO_SYNC_SEASON')!); }
    catch { this.logger.warn('Scheduled fixture refresh failed; check API plan and database availability'); }
  }

  @Interval(60000)
  async processDueJob() {
    if (!this.enabled || this.busy) return;
    this.busy = true;
    let job: SyncJob | undefined;
    try {
      const db = this.prisma.client;
      // Claim persisted jobs atomically; expired leases can be reclaimed after a crash.
      await db.$executeRaw`
        UPDATE sync_jobs SET status = 'FAILED', "lockedBy" = NULL, "lockedUntil" = NULL, "updatedAt" = NOW()
        WHERE attempts >= "maxAttempts" AND (status = 'PENDING' OR (status = 'RUNNING' AND "lockedUntil" <= NOW()))
      `;
      const claimed = await db.$queryRaw<SyncJob[]>`
        WITH due AS (
          SELECT id FROM sync_jobs
          WHERE kind IN ('FINAL_STATS', 'RECONCILE') AND "runAt" <= NOW() AND attempts < "maxAttempts"
            AND (status = 'PENDING' OR (status = 'RUNNING' AND "lockedUntil" <= NOW()))
          ORDER BY "runAt", id FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE sync_jobs AS j SET status = 'RUNNING', attempts = attempts + 1,
          "lockedBy" = ${this.workerId}, "lockedUntil" = NOW() + INTERVAL '10 minutes', "updatedAt" = NOW()
        FROM due WHERE j.id = due.id RETURNING j.*
      `;
      job = claimed[0];
      if (!job) return;
      const fixture = await db.fixture.findUniqueOrThrow({ where: { id: job.fixtureId } });
      const result = await this.sync.match(fixture.apiId);
      if (!result.finished) {
        const cancelled = ['PST', 'CANC', 'ABD'].includes(result.status);
        await db.syncJob.updateMany({ where: { id: job.id, lockedBy: this.workerId, status: 'RUNNING' }, data: {
          status: cancelled ? 'CANCELLED' : 'PENDING', runAt: new Date(Date.now() + 15 * 60000),
          lockedBy: null, lockedUntil: null,
        } });
        return;
      }
      await db.$transaction(async (tx) => {
        const released = await tx.syncJob.updateMany({ where: { id: job!.id, lockedBy: this.workerId, status: 'RUNNING' }, data: {
          status: 'SUCCEEDED', completedAt: new Date(), lockedBy: null, lockedUntil: null, lastError: null,
        } });
        if (released.count && job!.kind === 'FINAL_STATS') {
          await tx.syncJob.upsert({ where: { fixtureId_kind: { fixtureId: job!.fixtureId, kind: 'RECONCILE' } },
            create: { fixtureId: job!.fixtureId, kind: 'RECONCILE', runAt: new Date(Date.now() + 24 * 3600000) }, update: {} });
        }
      });
    } catch (error) {
      if (job) {
        const status = error instanceof HttpException ? error.getStatus() : 500;
        const unsupported = status === 422;
        const runAt = status === 429
          ? new Date(new Date().setUTCHours(24, 5, 0, 0))
          : new Date(Date.now() + Math.min(60, 5 * job.attempts) * 60000);
        await this.prisma.client.syncJob.updateMany({ where: { id: job.id, lockedBy: this.workerId, status: 'RUNNING' }, data: {
          status: unsupported ? 'UNSUPPORTED' : job.attempts >= job.maxAttempts ? 'FAILED' : 'PENDING',
          runAt, lockedBy: null, lockedUntil: null,
          lastError: unsupported ? 'Season is not supported by the API subscription' : `Sync failed (HTTP ${status})`,
        } }).catch(() => undefined);
      }
      this.logger.warn('Sync worker could not finish its current task');
    } finally { this.busy = false; }
  }
}
