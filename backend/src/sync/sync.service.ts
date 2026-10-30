import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { FootballApiService } from '../football-api/football-api.service';
import { ApiEvent, ApiFixture, ApiLineup, ApiMatchPlayers, ApiPlayer, ApiSeasonPlayer, ApiTeam } from '../football-api/types';

type Tx = Prisma.TransactionClient;
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const finished = new Set(['FT', 'AET', 'PEN']);

@Injectable()
export class SyncService {
  constructor(private readonly db: PrismaService, private readonly api: FootballApiService) {}

  private async team(tx: Tx, team: ApiTeam) {
    return tx.team.upsert({ where: { apiId: team.id },
      create: { apiId: team.id, name: team.name, logoUrl: team.logo },
      update: { name: team.name, ...(team.logo ? { logoUrl: team.logo } : {}) },
    });
  }

  private async player(tx: Tx, player: ApiPlayer) {
    if (!Number.isInteger(player.id) || player.id <= 0) throw new BadGatewayException('Invalid player ID from provider');
    return tx.player.upsert({ where: { apiId: player.id },
      create: { apiId: player.id, name: player.name || 'Unknown', photoUrl: player.photo },
      update: { ...(player.name ? { name: player.name } : {}), ...(player.photo ? { photoUrl: player.photo } : {}) },
    });
  }

  private async storeFixture(tx: Tx, row: ApiFixture) {
    if (row.league.id !== 39 || row.teams.home.id === row.teams.away.id) {
      throw new BadGatewayException('Invalid Premier League fixture from provider');
    }
    const league = await tx.league.upsert({ where: { apiId: row.league.id },
      create: { apiId: row.league.id, name: row.league.name, country: row.league.country, logoUrl: row.league.logo },
      update: { name: row.league.name },
    });
    const season = await tx.season.upsert({ where: { leagueId_year: { leagueId: league.id, year: row.league.season } },
      create: { leagueId: league.id, year: row.league.season, accessVerifiedAt: new Date() },
      update: { accessVerifiedAt: new Date() },
    });
    const home = await this.team(tx, row.teams.home);
    const away = await this.team(tx, row.teams.away);
    for (const team of [home, away]) {
      await tx.seasonTeam.upsert({ where: { seasonId_teamId: { seasonId: season.id, teamId: team.id } },
        create: { seasonId: season.id, teamId: team.id, syncedAt: new Date() }, update: { syncedAt: new Date() } });
    }
    const values = {
      seasonId: season.id, homeTeamId: home.id, awayTeamId: away.id,
      kickoffAt: row.fixture.date ? new Date(row.fixture.date) : null,
      round: row.league.round, status: row.fixture.status.short,
      elapsed: row.fixture.status.elapsed ?? null, extraMinutes: row.fixture.status.extra ?? null,
      referee: row.fixture.referee ?? null, venueApiId: row.fixture.venue?.id ?? null,
      venueName: row.fixture.venue?.name ?? null, venueCity: row.fixture.venue?.city ?? null,
      homeGoals: row.goals.home, awayGoals: row.goals.away,
      homeHalftimeGoals: row.score?.halftime?.home ?? null, awayHalftimeGoals: row.score?.halftime?.away ?? null,
      homeFulltimeGoals: row.score?.fulltime?.home ?? null, awayFulltimeGoals: row.score?.fulltime?.away ?? null,
      homeExtraTimeGoals: row.score?.extratime?.home ?? null, awayExtraTimeGoals: row.score?.extratime?.away ?? null,
      homePenaltyGoals: row.score?.penalty?.home ?? null, awayPenaltyGoals: row.score?.penalty?.away ?? null,
      fixtureSyncedAt: new Date(), rawPayload: json(row),
    };
    return tx.fixture.upsert({ where: { apiId: row.fixture.id },
      create: { apiId: row.fixture.id, ...values }, update: values,
    });
  }

  async seasonFixtures(season: number) {
    const db = this.db.client;
    const result = await this.api.get<ApiFixture>('/fixtures', { league: 39, season });
    if (!result.response.length || result.response.some((f) => f.league.season !== season)) {
      throw new BadGatewayException('Provider did not return the requested season fixtures');
    }
    let scheduled = 0;
    // Commit per fixture so large season imports do not hold a long transaction.
    for (const row of result.response) {
      await db.$transaction(async (tx) => {
        const fixture = await this.storeFixture(tx, row);
        if (['PST', 'CANC', 'ABD'].includes(fixture.status)) {
          await tx.syncJob.updateMany({ where: { fixtureId: fixture.id, status: { in: ['PENDING', 'FAILED'] } },
            data: { status: 'CANCELLED' } });
        } else if (fixture.kickoffAt && fixture.kickoffAt.getTime() > Date.now() - 24 * 3600000 && !finished.has(fixture.status)) {
          const runAt = new Date(fixture.kickoffAt.getTime() + 3 * 3600000);
          const existing = await tx.syncJob.findUnique({ where: { fixtureId_kind: { fixtureId: fixture.id, kind: 'FINAL_STATS' } } });
          await tx.syncJob.upsert({ where: { fixtureId_kind: { fixtureId: fixture.id, kind: 'FINAL_STATS' } },
            create: { fixtureId: fixture.id, kind: 'FINAL_STATS', runAt },
            update: existing?.status === 'CANCELLED'
              ? { runAt, status: 'PENDING', attempts: 0, completedAt: null, lockedBy: null, lockedUntil: null }
              : { runAt },
          });
          scheduled++;
        }
      }, { timeout: 15000 });
    }
    const league = await db.league.findUniqueOrThrow({ where: { apiId: 39 } });
    await db.season.update({ where: { leagueId_year: { leagueId: league.id, year: season } }, data: { fixturesSyncedAt: new Date() } });
    return { season, fixturesSynced: result.response.length, jobsScheduled: scheduled };
  }

  async match(apiId: number) {
    const db = this.db.client;
    const rows = await this.api.get<ApiFixture>('/fixtures', { id: apiId });
    const row = rows.response[0];
    if (!row || row.fixture.id !== apiId) throw new NotFoundException('Fixture not found in provider');
    const fixture = await db.$transaction((tx) => this.storeFixture(tx, row));
    if (!finished.has(fixture.status)) return { apiId, status: fixture.status, finished: false };
    const lineups = (await this.api.get<ApiLineup>('/fixtures/lineups', { fixture: apiId })).response;
    const players = (await this.api.get<ApiMatchPlayers>('/fixtures/players', { fixture: apiId })).response;
    const events = (await this.api.get<ApiEvent>('/fixtures/events', { fixture: apiId })).response;
    const allowed = new Set([row.teams.home.id, row.teams.away.id]);
    const completeTeams = (ids: number[]) => ids.length === 2 && new Set(ids).size === 2 && ids.every((id) => allowed.has(id));
    if (!completeTeams(lineups.map((l) => l.team.id)) || lineups.some((l) => !l.startXI?.length)
      || !completeTeams(players.map((p) => p.team.id)) || players.some((p) => !p.players?.length || p.players.some((s) => !s.statistics?.length))
      || events.some((e) => e.team.id !== null && !allowed.has(e.team.id))
      || ((row.goals.home ?? 0) + (row.goals.away ?? 0) > 0 && events.length === 0)) {
      throw new BadGatewayException('Match details are not complete yet; existing details were preserved');
    }
    await db.$transaction(async (tx) => {
      const current = await tx.fixture.findUniqueOrThrow({ where: { id: fixture.id } });
      const teams = await tx.team.findMany({ where: { id: { in: [current.homeTeamId, current.awayTeamId] } } });
      const teamIds = new Map(teams.map((t) => [t.apiId, t.id]));
      await tx.fixtureLineup.deleteMany({ where: { fixtureId: fixture.id } });
      await tx.playerMatchStat.deleteMany({ where: { fixtureId: fixture.id } });
      await tx.matchEvent.deleteMany({ where: { fixtureId: fixture.id } });
      const now = new Date();
      for (const lineup of lineups) {
        const teamId = teamIds.get(lineup.team.id)!;
        const coach = lineup.coach?.id ? await tx.coach.upsert({ where: { apiId: lineup.coach.id },
          create: { apiId: lineup.coach.id, name: lineup.coach.name || 'Unknown', photoUrl: lineup.coach.photo },
          update: { name: lineup.coach.name || 'Unknown', photoUrl: lineup.coach.photo },
        }) : null;
        await tx.fixtureLineup.create({ data: { fixtureId: fixture.id, teamId, coachId: coach?.id,
          formation: lineup.formation, rawPayload: json(lineup), syncedAt: now } });
        for (const [entries, isStarter] of [[lineup.startXI, true], [lineup.substitutes, false]] as const) {
          for (const entry of entries) {
            const p = await this.player(tx, entry.player);
            await tx.lineupPlayer.create({ data: { fixtureId: fixture.id, teamId, playerId: p.id, isStarter,
              shirtNumber: entry.player.number, position: entry.player.pos, grid: entry.player.grid } });
          }
        }
      }
      for (const block of players) {
        for (const entry of block.players) {
          const player = await this.player(tx, entry.player);
          const s = entry.statistics[0];
          await tx.playerMatchStat.create({ data: {
            fixtureId: fixture.id, playerId: player.id, teamId: teamIds.get(block.team.id)!,
            minutes: s.games.minutes ?? null, shirtNumber: s.games.number ?? null,
            position: s.games.position ?? null, rating: s.games.rating ?? null,
            isCaptain: s.games.captain ?? null, isSubstitute: s.games.substitute ?? null,
            goals: s.goals.total ?? null, assists: s.goals.assists ?? null,
            goalsConceded: s.goals.conceded ?? null, saves: s.goals.saves ?? null,
            shotsTotal: s.shots?.total ?? null, shotsOnTarget: s.shots?.on ?? null,
            passesTotal: s.passes?.total ?? null, keyPasses: s.passes?.key ?? null,
            passesAccuracy: s.passes?.accuracy == null ? null : String(s.passes.accuracy),
            tacklesTotal: s.tackles?.total ?? null, interceptions: s.tackles?.interceptions ?? null,
            yellowCards: s.cards?.yellow ?? null, redCards: s.cards?.red ?? null,
            rawStatistics: json(s), syncedAt: now,
          } });
        }
      }
      for (const [sequence, event] of events.entries()) {
        const player = event.player?.id ? await this.player(tx, { id: event.player.id, name: event.player.name || 'Unknown' }) : null;
        const related = event.assist?.id ? await this.player(tx, { id: event.assist.id, name: event.assist.name || 'Unknown' }) : null;
        await tx.matchEvent.create({ data: { fixtureId: fixture.id, sequence,
          teamId: event.team.id ? teamIds.get(event.team.id) : null,
          playerId: player?.id, relatedPlayerId: related?.id,
          playerName: event.player?.name, relatedPlayerName: event.assist?.name,
          minute: event.time.elapsed, extraMinute: event.time.extra,
          type: event.type, detail: event.detail, comments: event.comments, rawPayload: json(event),
        } });
      }
      await tx.fixture.update({ where: { id: fixture.id }, data: {
        lineupsSyncedAt: now, playerStatsSyncedAt: now, eventsSyncedAt: now,
      } });
    }, { timeout: 60000 });
    return { apiId, status: fixture.status, finished: true, teams: lineups.length,
      playerStats: players.reduce((n, t) => n + t.players.length, 0), events: events.length };
  }

  async seasonPlayers(season: number, teamApiId: number) {
    const db = this.db.client;
    const all: ApiSeasonPlayer[] = [];
    let page = 1;
    while (true) {
      const result = await this.api.get<ApiSeasonPlayer>('/players', { league: 39, season, team: teamApiId, page });
      if (!result.response.length || !result.paging || result.paging.current !== page || result.paging.total > 100) {
        throw new BadGatewayException('Provider returned incomplete or invalid player pagination');
      }
      all.push(...result.response);
      if (page >= result.paging.total) break;
      page++;
    }
    let snapshots = 0;
    await db.$transaction(async (tx) => {
      const league = await tx.league.upsert({ where: { apiId: 39 }, create: { apiId: 39, name: 'Premier League', country: 'England' }, update: {} });
      const dbSeason = await tx.season.upsert({ where: { leagueId_year: { leagueId: league.id, year: season } },
        create: { leagueId: league.id, year: season }, update: {} });
      for (const entry of all) {
        const player = await this.player(tx, entry.player);
        const p = entry.player;
        await tx.player.update({ where: { id: player.id }, data: {
          firstName: p.firstname, lastName: p.lastname, nationality: p.nationality,
          birthDate: p.birth?.date ? new Date(p.birth.date) : undefined,
          heightCm: p.height ? parseInt(p.height, 10) || null : undefined,
          weightKg: p.weight ? parseInt(p.weight, 10) || null : undefined,
          profileSyncedAt: new Date(),
        } });
        for (const s of entry.statistics) {
          if (s.league?.id !== 39 || s.league.season !== season || !s.team) continue;
          const team = await this.team(tx, s.team);
          await tx.seasonTeam.upsert({ where: { seasonId_teamId: { seasonId: dbSeason.id, teamId: team.id } },
            create: { seasonId: dbSeason.id, teamId: team.id, syncedAt: new Date() }, update: { syncedAt: new Date() } });
          const values = {
            appearances: s.games.appearences ?? null, starts: s.games.lineups ?? null,
            minutes: s.games.minutes ?? null, position: s.games.position ?? null,
            rating: s.games.rating ?? null, goals: s.goals.total ?? null, assists: s.goals.assists ?? null,
            goalsConceded: s.goals.conceded ?? null, saves: s.goals.saves ?? null,
            yellowCards: s.cards?.yellow ?? null, yellowRedCards: s.cards?.yellowred ?? null, redCards: s.cards?.red ?? null,
            rawStatistics: json(s), syncedAt: new Date(),
          };
          await tx.playerSeasonStat.upsert({ where: { seasonId_teamId_playerId: { seasonId: dbSeason.id, teamId: team.id, playerId: player.id } },
            create: { seasonId: dbSeason.id, teamId: team.id, playerId: player.id, ...values }, update: values });
          snapshots++;
        }
      }
      await tx.seasonTeam.updateMany({
        where: { seasonId: dbSeason.id, team: { apiId: teamApiId } },
        data: { playerPagesTotal: page, playerPagesImported: page, playersSyncedAt: new Date() },
      });
    }, { timeout: 60000 });
    return { season, team: teamApiId, pagesFetched: page, players: all.length, snapshots };
  }
}
