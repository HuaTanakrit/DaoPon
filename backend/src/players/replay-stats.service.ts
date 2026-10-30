import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaService } from '../database/prisma.service';
import { FootballApiService } from '../football-api/football-api.service';
import { ApiEvent, ApiFixture, ApiMatchPlayers } from '../football-api/types';
import { Prisma } from '../generated/prisma/client';
import { replayClock } from '../fixtures/replay-clock';
import { pageResult } from '../common/dto/pagination.dto';
import { PlayersQueryDto } from './players.dto';

type Match = ApiFixture & { players: ApiMatchPlayers[]; events: ApiEvent[] };
const finalStatuses = ['FT', 'AET', 'PEN'];
const positions: Record<string, string> = { G: 'Goalkeeper', D: 'Defender', M: 'Midfielder', F: 'Attacker' };

@Injectable()
export class ReplayStatsService {
  private running = false;
  private readonly logger = new Logger(ReplayStatsService.name);

  constructor(private readonly db: PrismaService, private readonly api: FootballApiService,
    private readonly config: ConfigService) {}

  private completedWhere(season: number, league: number, team?: number): Prisma.FixtureWhereInput {
    return {
      season: { year: season, league: { apiId: league } },
      status: { in: finalStatuses },
      // A historical FT must not reveal a match still in progress in the game.
      kickoffAt: { lte: new Date(Date.parse(replayClock().replayNow) - 3 * 3600000) },
      ...(team ? { OR: [{ homeTeam: { apiId: team } }, { awayTeam: { apiId: team } }] } : {}),
    };
  }

  async list(query: PlayersQueryDto) {
    const clock = replayClock();
    const where = this.completedWhere(query.season, query.league, query.team);
    const [expectedMatches, importedMatches, rows] = await this.db.client.$transaction([
      this.db.client.fixture.count({ where }),
      this.db.client.fixture.count({ where: { ...where, playerStatsSyncedAt: { not: null } } }),
      this.db.client.playerMatchStat.findMany({
        where: { fixture: { ...where, playerStatsSyncedAt: { not: null } },
          ...(query.team ? { team: { apiId: query.team } } : {}),
          ...(query.search ? { player: { name: { contains: query.search, mode: 'insensitive' } } } : {}) },
        select: { minutes: true, goals: true, assists: true, position: true, isSubstitute: true,
          fixture: { select: { kickoffAt: true } },
          team: { select: { apiId: true, name: true } },
          player: { select: { apiId: true, name: true, firstName: true, lastName: true, nationality: true, photoUrl: true } } },
        orderBy: { fixture: { kickoffAt: 'asc' } },
      }),
    ]);
    type Stat = { position: string | null; goals: number; assists: number; appearances: number; minutes: number; rating: null;
      team: { apiId: number; name: string } };
    const players = new Map<number, { profile: (typeof rows)[number]['player']; stats: Map<number, Stat> }>();
    for (const row of rows) {
      let entry = players.get(row.player.apiId);
      if (!entry) { entry = { profile: row.player, stats: new Map() }; players.set(row.player.apiId, entry); }
      let stat = entry.stats.get(row.team.apiId);
      if (!stat) {
        stat = { position: null, goals: 0, assists: 0, appearances: 0, minutes: 0, rating: null, team: row.team };
        entry.stats.set(row.team.apiId, stat);
      }
      stat.position = row.position ? (positions[row.position] || row.position) : stat.position;
      stat.goals += row.goals ?? 0;
      stat.assists += row.assists ?? 0;
      stat.minutes += row.minutes ?? 0;
      if ((row.minutes ?? 0) > 0) stat.appearances++;
    }
    const data = [...players.values()].map(({ profile, stats }) => ({ ...profile, seasonStats: [...stats.values()] }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en') || a.apiId - b.apiId);
    return {
      ...pageResult(data.slice((query.page - 1) * query.limit, query.page * query.limit), data.length, query),
      clock,
      coverage: { expectedMatches, importedMatches, complete: expectedMatches === importedMatches,
        source: 'match_statistics', matchDelayHours: 3 },
    };
  }

  @Cron('5 * * * *', { timeZone: 'Asia/Bangkok', waitForCompletion: true })
  async scheduledSync() {
    if (this.config.get<boolean>('REPLAY_STATS_SYNC_ENABLED') !== true || !this.db.configured || replayClock().mode === 'DEMO') return;
    try { this.logger.log(JSON.stringify(await this.syncMissing())); }
    catch { this.logger.warn('Replay statistics sync paused; it will retry on the next scheduled run.'); }
  }

  async syncMissing(maxRequests = 90) {
    if (this.running) return { status: 'already_running', imported: 0 };
    this.running = true;
    let imported = 0;
    let requested = 0;
    try {
      const fixtures = await this.db.client.fixture.findMany({
        where: { ...this.completedWhere(2024, 39), playerStatsSyncedAt: null },
        select: { apiId: true, id: true, homeTeam: { select: { apiId: true } }, awayTeam: { select: { apiId: true } } },
        orderBy: [{ kickoffAt: 'asc' }, { apiId: 'asc' }],
      });
      // Finish Liverpool first, then Arsenal, while backfilling the whole league.
      const priority = (f: (typeof fixtures)[number]) => [f.homeTeam.apiId, f.awayTeam.apiId].includes(40) ? 0
        : [f.homeTeam.apiId, f.awayTeam.apiId].includes(42) ? 1 : 2;
      fixtures.sort((a, b) => priority(a) - priority(b));
      for (const fixture of fixtures) {
        const file = resolve(__dirname, '../../.cache/football/2024/matches', `${fixture.apiId}.json`);
        let row: Match | undefined;
        try { row = JSON.parse(await readFile(file, 'utf8')) as Match; } catch {}
        if (!row || row.fixture?.id !== fixture.apiId) {
          if (requested >= maxRequests || (this.api.quotaRemaining !== null && this.api.quotaRemaining <= 5)) break;
          row = (await this.api.get<Match>('/fixtures', { id: fixture.apiId })).response[0];
          requested++;
        }
        await this.storeMatch(fixture.id, fixture.apiId, row);
        await mkdir(resolve(file, '..'), { recursive: true });
        await writeFile(file, JSON.stringify(row));
        imported++;
      }
      return { status: 'ok', imported, requested, remainingMatches: fixtures.length - imported,
        dailyQuotaRemaining: this.api.quotaRemaining };
    } finally { this.running = false; }
  }

  private async storeMatch(fixtureId: number, apiId: number, row?: Match) {
    if (!row || row.fixture.id !== apiId || row.league.id !== 39 || row.league.season !== 2024
      || !finalStatuses.includes(row.fixture.status.short) || !Array.isArray(row.events)
      || !Array.isArray(row.players) || row.players.length !== 2
      || new Set(row.players.map((t) => t.team.id)).size !== 2
      || row.players.some((t) => ![row.teams.home.id, row.teams.away.id].includes(t.team.id)
        || t.players.length < 11 || t.players.some((p) => !p.player.id || !p.statistics?.[0]?.games || !p.statistics[0].goals))
      || ((row.goals.home ?? 0) + (row.goals.away ?? 0) > 0 && row.events.length === 0)) {
      throw new BadGatewayException('Historical player statistics are incomplete');
    }
    const scoringEvents = row.events.filter((event) => event.type === 'Goal' && ['Normal Goal', 'Penalty'].includes(event.detail || ''));
    const records = row.players.flatMap((block) => block.players.map(({ player, statistics }) => {
      const s = statistics[0];
      return { apiId: player.id, name: player.name, photoUrl: player.photo, teamApiId: block.team.id,
        minutes: s.games.minutes, position: s.games.position, shirtNumber: s.games.number,
        isSubstitute: s.games.substitute, rating: s.games.rating,
        // The provider uses null for no goal; verify zero against goal events.
        goals: s.goals.total ?? scoringEvents.filter((e) => e.player?.id === player.id).length,
        assists: s.goals.assists ?? scoringEvents.filter((e) => e.assist?.id === player.id).length,
        rawStatistics: s };
    }));
    const payload = JSON.stringify(records);
    await this.db.client.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO players ("apiId",name,"photoUrl","updatedAt")
        SELECT p."apiId",p.name,p."photoUrl",NOW() FROM jsonb_to_recordset(${payload}::jsonb) AS p("apiId" int,name text,"photoUrl" text)
        ON CONFLICT ("apiId") DO UPDATE SET name=EXCLUDED.name,"photoUrl"=COALESCE(EXCLUDED."photoUrl",players."photoUrl"),"updatedAt"=NOW()`;
      await tx.playerMatchStat.deleteMany({ where: { fixtureId } });
      await tx.$executeRaw`INSERT INTO player_match_stats ("fixtureId","playerId","teamId",minutes,position,"shirtNumber","isSubstitute",rating,goals,assists,"rawStatistics","syncedAt")
        SELECT ${fixtureId},p.id,t.id,r.minutes,r.position,r."shirtNumber",r."isSubstitute",r.rating,r.goals,r.assists,r."rawStatistics",NOW()
        FROM jsonb_to_recordset(${payload}::jsonb) AS r("apiId" int,"teamApiId" int,minutes int,position text,"shirtNumber" int,"isSubstitute" boolean,rating numeric,goals int,assists int,"rawStatistics" jsonb)
        JOIN players p ON p."apiId"=r."apiId" JOIN teams t ON t."apiId"=r."teamApiId"`;
      const stored = await tx.playerMatchStat.count({ where: { fixtureId } });
      if (stored !== records.length) throw new BadGatewayException('Historical player statistics contain unknown teams');
      await tx.fixture.update({ where: { id: fixtureId }, data: { playerStatsSyncedAt: new Date() } });
    });
  }
}
