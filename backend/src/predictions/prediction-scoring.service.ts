import { BadGatewayException, HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { FootballApiService } from '../football-api/football-api.service';
import { ApiFixture, ApiLineup } from '../football-api/types';
import { SyncJob } from '../generated/prisma/client';
import { replayClock, replayDateToReal } from '../fixtures/replay-clock';
import { scoreNames, scoreResult } from './scoring';

@Injectable()
export class PredictionScoringService {
  private readonly logger = new Logger(PredictionScoringService.name);
  private readonly workerId = randomUUID();
  private busy = false;
  constructor(private readonly db: PrismaService, private readonly api: FootballApiService, private readonly config: ConfigService) {}

  async rescheduleForClock() {
    const pending = await this.db.client.fixture.findMany({ where: { kickoffAt: { not: null },
      OR: [{ predictions: { some: { userId: { not: null }, score: null } } }, { scorePredictions: { some: { points: null } } }] },
      select: { id: true, kickoffAt: true } });
    for (const fixture of pending) {
      const runAt = replayDateToReal(new Date(fixture.kickoffAt!.getTime() + 3 * 3600000));
      await this.db.client.syncJob.upsert({ where: { fixtureId_kind: { fixtureId: fixture.id, kind: 'LINEUPS' } },
        create: { fixtureId: fixture.id, kind: 'LINEUPS', runAt }, update: {} });
      await this.db.client.syncJob.updateMany({ where: { fixtureId: fixture.id, kind: 'LINEUPS', status: { not: 'RUNNING' } },
        data: { runAt, status: 'PENDING', attempts: 0, lastError: null, completedAt: null } });
    }
  }

  @Interval(60000)
  async processDueJob(preferredFixtureApiId?: number) {
    if (this.busy || !this.db.configured || this.config.get<boolean>('PREDICTION_SCORING_ENABLED') !== true) return;
    this.busy = true;
    let job: SyncJob | undefined;
    try {
      const now = new Date(Date.now());
      // Recover jobs for imported guest predictions and fixture reschedules.
      const pending = await this.db.client.fixture.findMany({
        where: { OR: [{ predictions: { some: { userId: { not: null }, score: null } } }, { scorePredictions: { some: { points: null } } }], kickoffAt: { not: null }, status: { notIn: ['CANC', 'PST', 'ABD', 'AWD', 'WO'] } },
        select: { id: true, kickoffAt: true },
      });
      for (const fixture of pending) {
        const runAt = replayDateToReal(new Date(fixture.kickoffAt!.getTime() + 3 * 3600000));
        const existing = await this.db.client.syncJob.findUnique({ where: { fixtureId_kind: { fixtureId: fixture.id, kind: 'LINEUPS' } } });
        if (!existing) await this.db.client.syncJob.create({ data: { fixtureId: fixture.id, kind: 'LINEUPS', runAt } });
        else if (['CANCELLED', 'SUCCEEDED'].includes(existing.status)) await this.db.client.syncJob.update({ where: { id: existing.id }, data: { status: 'PENDING', runAt, attempts: 0 } });
        else if (replayClock().mode !== 'DEMO' && existing.status === 'PENDING' && existing.runAt.getTime() < runAt.getTime()) {
          await this.db.client.syncJob.update({ where: { id: existing.id }, data: { runAt } });
        }
      }
      await this.db.client.$executeRaw`UPDATE sync_jobs SET status='FAILED',"lockedBy"=NULL,"lockedUntil"=NULL,"updatedAt"=${now}
        WHERE kind='LINEUPS' AND attempts >= "maxAttempts" AND (status='PENDING' OR (status='RUNNING' AND "lockedUntil"<=${now}))`;
      const claimed = await this.db.client.$queryRaw<SyncJob[]>`
        WITH due AS (
          SELECT id FROM sync_jobs WHERE kind='LINEUPS' AND "runAt" <= ${now} AND attempts < "maxAttempts"
            AND (${preferredFixtureApiId ?? null}::int IS NULL OR "fixtureId"=(SELECT id FROM fixtures WHERE "apiId"=${preferredFixtureApiId ?? null}))
            AND (status='PENDING' OR (status='RUNNING' AND "lockedUntil" <= ${now}))
          ORDER BY "runAt",id FOR UPDATE SKIP LOCKED LIMIT 1
        ) UPDATE sync_jobs j SET status='RUNNING',attempts=attempts+1,"lockedBy"=${this.workerId},
          "lockedUntil"=${new Date(now.getTime() + 10 * 60000)},"updatedAt"=${now}
          FROM due WHERE j.id=due.id RETURNING j.*`;
      job = claimed[0];
      if (!job) return;
      const fixture = await this.db.client.fixture.findUniqueOrThrow({ where: { id: job.fixtureId }, include: { homeTeam: true, awayTeam: true } });
      if (['CANC', 'PST', 'ABD', 'AWD', 'WO'].includes(fixture.status)) {
        await this.release(job.id, { status: 'CANCELLED' }); return;
      }
      const dueAt = fixture.kickoffAt ? fixture.kickoffAt.getTime() + 3 * 3600000 : Infinity;
      if (Date.parse(replayClock().replayNow) < dueAt) {
        await this.release(job.id, { status: 'PENDING', runAt: replayDateToReal(new Date(dueAt)) }); return;
      }
      const [pendingXi, pendingScores] = await this.db.client.$transaction([
        this.db.client.lineupPrediction.count({ where: { fixtureId: fixture.id, userId: { not: null }, score: null } }),
        this.db.client.scorePrediction.count({ where: { fixtureId: fixture.id, points: null } }),
      ]);
      if (!pendingXi && !pendingScores) { await this.release(job.id, { status: 'SUCCEEDED', completedAt: now, lastError: null }); return; }
      if (this.api.quotaRemaining !== null && this.api.quotaRemaining <= 5) {
        const nextReset = new Date(now); nextReset.setUTCHours(24, 5, 0, 0);
        await this.release(job.id, { status: 'PENDING', runAt: nextReset, attempts: Math.max(0, job.attempts - 1), lastError: 'Waiting for daily API quota reset' }); return;
      }
      let matchData: (ApiFixture & { lineups?: ApiLineup[] }) | undefined;
      let finalResult: { home: number; away: number; status: string } | null = null;
      if (pendingScores) {
        matchData = (await this.api.get<ApiFixture & { lineups?: ApiLineup[] }>('/fixtures', { id: fixture.apiId })).response[0];
        if (!matchData || matchData.fixture.id !== fixture.apiId || matchData.league.id !== 39 || matchData.league.season !== 2024
          || matchData.teams.home.id !== fixture.homeTeam.apiId || matchData.teams.away.id !== fixture.awayTeam.apiId) {
          throw new BadGatewayException('Fixture result identity does not match');
        }
        const { home, away } = matchData.goals;
        if (['FT', 'AET', 'PEN'].includes(matchData.fixture.status.short) && home !== null && away !== null
          && Number.isInteger(home) && Number.isInteger(away) && home >= 0 && away >= 0 && home <= 99 && away <= 99) {
          finalResult = { home, away, status: matchData.fixture.status.short };
        }
      }
      const lineups: ApiLineup[] = pendingXi ? (Array.isArray(matchData?.lineups) ? matchData.lineups
        : (await this.api.get<ApiLineup>('/fixtures/lineups', { fixture: fixture.apiId })).response) : [];
      const expected = new Set([fixture.homeTeam.apiId, fixture.awayTeam.apiId]);
      const starterIds = lineups.flatMap((lineup) => (lineup.startXI || []).map((entry) => entry.player.id));
      const lineupsReady = lineups.length === 2 && new Set(lineups.map((l) => l.team.id)).size === 2
        && lineups.every((l) => expected.has(l.team.id) && l.startXI?.length === 11)
        && starterIds.every((id) => Number.isInteger(id) && id > 0) && new Set(starterIds).size === 22;
      await this.db.client.$transaction(async (tx) => {
        const [locked] = await tx.$queryRaw<Array<{ kickoffAt: Date | null; status: string }>>`
          SELECT "kickoffAt",status FROM fixtures WHERE id=${fixture.id} FOR UPDATE`;
        if (!locked?.kickoffAt || ['CANC', 'PST', 'ABD', 'AWD', 'WO'].includes(locked.status)
          || Date.parse(replayClock().replayNow) < locked.kickoffAt.getTime() + 3 * 3600000) throw new BadGatewayException('Fixture schedule changed');
        const lease = await tx.syncJob.updateMany({ where: { id: job!.id, lockedBy: this.workerId, status: 'RUNNING' },
          data: { lockedUntil: new Date(now.getTime() + 10 * 60000) } });
        if (!lease.count) return;
        if (pendingXi && lineupsReady) {
          const entries = lineups.flatMap((l) => [...l.startXI, ...(l.substitutes || [])]);
          const profiles = JSON.stringify(entries.map((e) => ({ apiId: e.player.id, name: e.player.name || 'Unknown' })));
          await tx.$executeRaw`INSERT INTO players ("apiId",name,"updatedAt")
            SELECT p."apiId",p.name,${now} FROM jsonb_to_recordset(${profiles}::jsonb) AS p("apiId" int,name text)
            ON CONFLICT ("apiId") DO UPDATE SET name=EXCLUDED.name,"updatedAt"=EXCLUDED."updatedAt"`;
          const players = await tx.player.findMany({ where: { apiId: { in: entries.map((e) => e.player.id) } }, select: { id: true, apiId: true } });
          const internal = new Map(players.map((p) => [p.apiId, p.id]));
          await tx.fixtureLineup.deleteMany({ where: { fixtureId: fixture.id } });
          for (const lineup of lineups) {
            const teamId = lineup.team.id === fixture.homeTeam.apiId ? fixture.homeTeamId : fixture.awayTeamId;
            await tx.fixtureLineup.create({ data: { fixtureId: fixture.id, teamId, formation: lineup.formation, syncedAt: now } });
            await tx.lineupPlayer.createMany({ data: [
              ...lineup.startXI.map((e) => ({ e, isStarter: true })),
              ...(lineup.substitutes || []).map((e) => ({ e, isStarter: false })),
            ].map(({ e, isStarter }) => ({ fixtureId: fixture.id, teamId, playerId: internal.get(e.player.id)!,
              isStarter, shirtNumber: e.player.number, position: e.player.pos, grid: e.player.grid })) });
            const actual = lineup.startXI.map((e) => e.player.id);
            const predictions = await tx.lineupPrediction.findMany({ where: { fixtureId: fixture.id, teamId, userId: { not: null }, score: null,
              submittedReplayAt: { lt: locked.kickoffAt } }, include: { picks: { select: { player: { select: { apiId: true } } } } } });
            for (const prediction of predictions) {
              const score = scoreNames(prediction.picks.map((p) => p.player.apiId), actual);
              await tx.lineupPrediction.updateMany({ where: { id: prediction.id, score: null }, data: { ...score, scoredAt: now } });
            }
          }
          await tx.fixture.update({ where: { id: fixture.id }, data: { lineupsSyncedAt: now } });
        }
        if (finalResult) {
          const result = finalResult;
          const predictions = await tx.scorePrediction.findMany({ where: { fixtureId: fixture.id, points: null,
            submittedReplayAt: { lt: locked.kickoffAt } } });
          for (const prediction of predictions) {
            await tx.scorePrediction.updateMany({ where: { id: prediction.id, points: null }, data: {
              points: scoreResult(prediction.homeGoals, prediction.awayGoals, result.home, result.away),
              actualHomeGoals: result.home, actualAwayGoals: result.away, scoredAt: now,
            } });
          }
          await tx.fixture.update({ where: { id: fixture.id }, data: { homeGoals: result.home, awayGoals: result.away, status: result.status } });
        }
        const remainingXi = await tx.lineupPrediction.count({ where: { fixtureId: fixture.id, userId: { not: null }, score: null } });
        const remainingScores = await tx.scorePrediction.count({ where: { fixtureId: fixture.id, points: null } });
        const complete = remainingXi === 0 && remainingScores === 0;
        await tx.syncJob.updateMany({ where: { id: job!.id, status: 'RUNNING', lockedBy: this.workerId }, data: {
          status: complete ? 'SUCCEEDED' : job!.attempts >= job!.maxAttempts ? 'FAILED' : 'PENDING',
          completedAt: complete ? now : null, lockedBy: null, lockedUntil: null,
          runAt: complete ? job!.runAt : new Date(now.getTime() + Math.min(60, 5 * job!.attempts) * 60000),
          lastError: complete ? null : 'Waiting for complete starting XI or confirmed final score',
        } });
      }, { timeout: 30000 });
    } catch (error) {
      if (job) {
        const status = error instanceof HttpException ? error.getStatus() : 500;
        const retry = new Date(Date.now() + Math.min(60, 5 * job.attempts) * 60000);
        if (status === 429) { retry.setTime(Date.now()); retry.setUTCHours(24, 5, 0, 0); }
        await this.release(job.id, { status: status === 422 ? 'UNSUPPORTED' : job.attempts >= job.maxAttempts ? 'FAILED' : 'PENDING',
          runAt: retry, lastError: `Starting lineup sync failed (HTTP ${status})` }).catch(() => undefined);
      }
      this.logger.warn('A lineup scoring job will be retried or needs administrator attention.');
    } finally { this.busy = false; }
  }

  private release(id: number, data: Record<string, unknown>) {
    return this.db.client.syncJob.updateMany({ where: { id, lockedBy: this.workerId, status: 'RUNNING' },
      data: { ...data, lockedBy: null, lockedUntil: null } });
  }
}
