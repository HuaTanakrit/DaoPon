import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { replayClock, shiftBangkokYears, REPLAY_YEAR_OFFSET, replayDateToReal } from '../fixtures/replay-clock';
import { ReplayStatsService } from '../players/replay-stats.service';
import { PlayersQueryDto } from '../players/players.dto';
import { predictionWindow } from './prediction-window';
import { SavePredictionDto, SaveScorePredictionDto } from './predictions.dto';
import { accountOwner, SessionUser } from '../auth/auth.service';

const predictionSelect = {
  formation: true, updatedAt: true, score: true, scoredAt: true, matchedPlayerApiIds: true,
  picks: { orderBy: { slot: 'asc' }, select: { player: { select: { apiId: true } } } },
} satisfies Prisma.LineupPredictionSelect;

@Injectable()
export class PredictionsService {
  constructor(private readonly db: PrismaService, private readonly stats: ReplayStatsService) {}

  private async fixture(apiId: number) {
    const fixture = await this.db.client.fixture.findFirst({ where: { apiId, season: { year: 2024, league: { apiId: 39 } } },
      select: { id: true, apiId: true, kickoffAt: true, round: true, venueName: true, status: true,
        homeTeam: { select: { id: true, apiId: true, name: true, logoUrl: true } },
        awayTeam: { select: { id: true, apiId: true, name: true, logoUrl: true } } } });
    if (!fixture) throw new NotFoundException('ไม่พบแมตช์นี้');
    return fixture;
  }

  async context(apiId: number, team?: number) {
    const fixture = await this.fixture(apiId);
    const selected = [fixture.homeTeam, fixture.awayTeam].find((t) => t.apiId === (team ?? fixture.homeTeam.apiId));
    if (!selected) throw new BadRequestException('สโมสรนี้ไม่ได้แข่งขันในแมตช์ที่เลือก');
    const clock = replayClock();
    const window = predictionWindow(fixture.kickoffAt, clock.replayNow, fixture.status);
    const query = Object.assign(new PlayersQueryDto(), { team: selected.apiId, season: 2024, league: 39, limit: 100 });
    const roster = window.state === 'OPEN' || window.state === 'CLOSED' ? await this.stats.list(query) : null;
    const publicTeam = (t: typeof selected) => ({ apiId: t.apiId, name: t.name, logoUrl: t.logoUrl });
    return { fixture: { apiId: fixture.apiId, kickoffAt: fixture.kickoffAt, round: fixture.round, venueName: fixture.venueName,
      replayKickoffAt: fixture.kickoffAt ? shiftBangkokYears(fixture.kickoffAt, REPLAY_YEAR_OFFSET).toISOString() : null,
      homeTeam: publicTeam(fixture.homeTeam), awayTeam: publicTeam(fixture.awayTeam) },
      team: publicTeam(selected), players: roster?.data ?? [], coverage: roster?.coverage ?? null, clock, window };
  }

  async read(apiId: number, teamApiId: number | undefined, user: SessionUser) {
    const fixture = await this.fixture(apiId);
    const team = [fixture.homeTeam, fixture.awayTeam].find((t) => t.apiId === teamApiId);
    if (!team) throw new BadRequestException('กรุณาเลือกสโมสรในแมตช์นี้');
    const result = await this.db.client.lineupPrediction.findUnique({
      where: { userId_fixtureId_teamId: { userId: user.id, fixtureId: fixture.id, teamId: team.id } }, select: predictionSelect,
    });
    return { prediction: result ? { formation: result.formation, updatedAt: result.updatedAt,
      score: result.score, scoredAt: result.scoredAt, matchedPlayerApiIds: result.matchedPlayerApiIds,
      playerApiIds: result.picks.map((p) => p.player.apiId) } : null };
  }

  async save(apiId: number, body: SavePredictionDto, user: SessionUser) {
    const ownerHash = accountOwner(user.id);
    const context = await this.context(apiId, body.team);
    if (!context.window.canPredict) throw new ForbiddenException('เปิดให้สร้างทีมเฉพาะ 7 วันก่อนแข่ง และปิดเมื่อเริ่มแข่ง');
    const players = new Map(context.players.map((p) => [p.apiId, p]));
    if (body.playerApiIds.some((id) => !players.has(id))) throw new BadRequestException('เลือกได้เฉพาะนักเตะจากรายชื่อของทีมนี้ถึงวันจำลอง');
    const keeper = (id: number) => players.get(id)!.seasonStats[0]?.position === 'Goalkeeper';
    if (!keeper(body.playerApiIds[0]) || body.playerApiIds.slice(1).some(keeper)) {
      throw new BadRequestException('ต้องมีผู้รักษาประตู 1 คนในช่องผู้รักษาประตู และผู้เล่นสนาม 10 คน');
    }
    const fixture = await this.fixture(apiId);
    const teamId = fixture.homeTeam.apiId === body.team ? fixture.homeTeam.id : fixture.awayTeam.id;
    const ids = await this.db.client.player.findMany({ where: { apiId: { in: body.playerApiIds } }, select: { id: true, apiId: true } });
    const internal = new Map(ids.map((p) => [p.apiId, p.id]));
    await this.db.client.$transaction(async (tx) => {
      // Serialize saves for this fixture and recheck the deadline after waiting.
      const [locked] = await tx.$queryRaw<Array<{ kickoffAt: Date | null; status: string }>>`
        SELECT "kickoffAt", status FROM fixtures WHERE id=${fixture.id} FOR UPDATE`;
      if (!locked || !predictionWindow(locked.kickoffAt, replayClock().replayNow, locked.status).canPredict) {
        throw new ForbiddenException('หมดเวลาสร้างหรือแก้ไขทีมแล้ว');
      }
      const picks = body.playerApiIds.map((id, slot) => ({ playerId: internal.get(id)!, slot }));
      const graded = await tx.lineupPrediction.findUnique({ where: { userId_fixtureId_teamId: { userId: user.id, fixtureId: fixture.id, teamId } }, select: { score: true } });
      if (graded && graded.score !== null) throw new ForbiddenException('คำทำนายนี้ตรวจคะแนนแล้ว ไม่สามารถแก้ไขได้');
      await tx.lineupPrediction.upsert({
        where: { userId_fixtureId_teamId: { userId: user.id, fixtureId: fixture.id, teamId } },
        create: { ownerHash, userId: user.id, fixtureId: fixture.id, teamId, formation: body.formation,
          submittedReplayAt: new Date(replayClock().replayNow), picks: { create: picks } },
        update: { formation: body.formation, submittedReplayAt: new Date(replayClock().replayNow), picks: { deleteMany: {}, create: picks } },
      });
      await tx.syncJob.upsert({ where: { fixtureId_kind: { fixtureId: fixture.id, kind: 'LINEUPS' } },
        create: { fixtureId: fixture.id, kind: 'LINEUPS', runAt: replayDateToReal(new Date(locked.kickoffAt!.getTime() + 3 * 3600000)) },
        update: { runAt: replayDateToReal(new Date(locked.kickoffAt!.getTime() + 3 * 3600000)) } });
    });
    return this.read(apiId, body.team, user);
  }

  async readScore(apiId: number, teamApiId: number | undefined, user: SessionUser) {
    const fixture = await this.fixture(apiId);
    const team = [fixture.homeTeam, fixture.awayTeam].find((t) => t.apiId === teamApiId);
    if (!team) throw new BadRequestException('กรุณาเลือกสโมสรในแมตช์นี้');
    const prediction = await this.db.client.scorePrediction.findUnique({
      where: { userId_fixtureId_teamId: { userId: user.id, fixtureId: fixture.id, teamId: team.id } },
      select: { homeGoals: true, awayGoals: true, points: true, actualHomeGoals: true, actualAwayGoals: true, scoredAt: true, updatedAt: true },
    });
    return { prediction };
  }

  async saveScore(apiId: number, body: SaveScorePredictionDto, user: SessionUser) {
    const fixture = await this.fixture(apiId);
    const team = [fixture.homeTeam, fixture.awayTeam].find((t) => t.apiId === body.team);
    if (!team) throw new BadRequestException('กรุณาเลือกสโมสรในแมตช์นี้');
    await this.db.client.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<Array<{ kickoffAt: Date | null; status: string }>>`
        SELECT "kickoffAt",status FROM fixtures WHERE id=${fixture.id} FOR UPDATE`;
      if (!locked || !predictionWindow(locked.kickoffAt, replayClock().replayNow, locked.status).canPredict) {
        throw new ForbiddenException('ทายสกอร์ได้เฉพาะ 7 วันก่อนแข่ง และปิดเมื่อเริ่มแข่ง');
      }
      const data = { homeGoals: body.homeGoals, awayGoals: body.awayGoals, submittedReplayAt: new Date(replayClock().replayNow) };
      const graded = await tx.scorePrediction.findUnique({ where: { userId_fixtureId_teamId: { userId: user.id, fixtureId: fixture.id, teamId: team.id } }, select: { points: true } });
      if (graded && graded.points !== null) throw new ForbiddenException('คำทำนายนี้ตรวจคะแนนแล้ว ไม่สามารถแก้ไขได้');
      await tx.scorePrediction.upsert({
        where: { userId_fixtureId_teamId: { userId: user.id, fixtureId: fixture.id, teamId: team.id } },
        create: { userId: user.id, fixtureId: fixture.id, teamId: team.id, ...data }, update: data,
      });
      const runAt = replayDateToReal(new Date(locked.kickoffAt!.getTime() + 3 * 3600000));
      await tx.syncJob.upsert({ where: { fixtureId_kind: { fixtureId: fixture.id, kind: 'LINEUPS' } },
        create: { fixtureId: fixture.id, kind: 'LINEUPS', runAt }, update: { runAt } });
    });
    return this.readScore(apiId, body.team, user);
  }
}
