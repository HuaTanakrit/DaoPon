import { Controller, Get, NotFoundException, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { pageResult } from '../common/dto/pagination.dto';
import { FixturesQueryDto, UpcomingFixturesQueryDto } from './fixtures.dto';
import { REPLAY_YEAR_OFFSET, replayClock, shiftBangkokYears } from './replay-clock';

const fixtureSelect = {
  apiId: true, kickoffAt: true, round: true, status: true, elapsed: true,
  homeGoals: true, awayGoals: true,
  homeTeam: { select: { apiId: true, name: true, logoUrl: true } },
  awayTeam: { select: { apiId: true, name: true, logoUrl: true } },
  season: { select: { year: true, league: { select: { apiId: true, name: true } } } },
  fixtureSyncedAt: true, lineupsSyncedAt: true, playerStatsSyncedAt: true,
} satisfies Prisma.FixtureSelect;

@ApiTags('fixtures')
@Controller('fixtures')
export class FixturesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('upcoming')
  async upcoming(@Query() query: UpcomingFixturesQueryDto) {
    const clock = replayClock();
    const where: Prisma.FixtureWhereInput = {
      season: { year: query.season, league: { apiId: query.league } },
      kickoffAt: { gt: new Date(clock.replayNow) },
      // Historical fixtures are usually FT. Upcoming is relative to replay time.
      status: { notIn: ['CANC', 'ABD', 'AWD', 'WO', 'PST'] },
      ...(query.team ? { OR: [{ homeTeam: { apiId: query.team } }, { awayTeam: { apiId: query.team } }] } : {}),
    };
    const [fixtures, total] = await this.prisma.client.$transaction([
      this.prisma.client.fixture.findMany({
        where,
        // Deliberately omit scores, actual status, lineups and match statistics.
        select: {
          apiId: true, kickoffAt: true, round: true, venueName: true,
          homeTeam: { select: { apiId: true, name: true, logoUrl: true } },
          awayTeam: { select: { apiId: true, name: true, logoUrl: true } },
        },
        orderBy: [{ kickoffAt: 'asc' }, { apiId: 'asc' }],
        skip: (query.page - 1) * query.limit, take: query.limit,
      }),
      this.prisma.client.fixture.count({ where }),
    ]);
    const data = fixtures.map((fixture) => ({
      ...fixture,
      replayKickoffAt: shiftBangkokYears(fixture.kickoffAt!, REPLAY_YEAR_OFFSET).toISOString(),
      status: 'UPCOMING' as const,
    }));
    return { ...pageResult(data, total, query), clock };
  }

  @Get()
  async list(@Query() query: FixturesQueryDto) {
    const where: Prisma.FixtureWhereInput = {
      season: { year: query.season, league: { apiId: query.league } },
      ...(query.status ? { status: query.status } : {}),
      ...(query.team ? { OR: [{ homeTeam: { apiId: query.team } }, { awayTeam: { apiId: query.team } }] } : {}),
    };
    const [fixtures, total] = await this.prisma.client.$transaction([
      this.prisma.client.fixture.findMany({
        where, select: fixtureSelect, orderBy: [{ kickoffAt: 'asc' }, { apiId: 'asc' }],
        skip: (query.page - 1) * query.limit, take: query.limit,
      }),
      this.prisma.client.fixture.count({ where }),
    ]);
    const clock = replayClock();
    const cutoff = Date.parse(clock.replayNow) - 3 * 3600000;
    return pageResult(fixtures.map((fixture) => fixture.kickoffAt && fixture.kickoffAt.getTime() <= cutoff ? fixture : {
      ...fixture, homeGoals: null, awayGoals: null, elapsed: null,
      status: fixture.kickoffAt && fixture.kickoffAt.getTime() <= Date.parse(clock.replayNow) ? 'AWAITING_RESULT' : 'UPCOMING',
      lineupsSyncedAt: null, playerStatsSyncedAt: null,
    }), total, query);
  }

  @Get(':apiId')
  async detail(@Param('apiId', ParseIntPipe) apiId: number) {
    const fixture = await this.prisma.client.fixture.findUnique({
      where: { apiId },
      select: {
        ...fixtureSelect, referee: true, venueName: true, venueCity: true,
        eventsSyncedAt: true,
        lineups: { select: {
          formation: true, team: { select: { apiId: true, name: true } },
          coach: { select: { apiId: true, name: true, photoUrl: true } },
          players: { select: {
            isStarter: true, shirtNumber: true, position: true, grid: true,
            player: { select: { apiId: true, name: true, photoUrl: true } },
          }, orderBy: [{ isStarter: 'desc' }, { shirtNumber: 'asc' }] },
        } },
        playerStats: { select: {
          player: { select: { apiId: true, name: true } },
          team: { select: { apiId: true, name: true } },
          minutes: true, position: true, rating: true, goals: true, assists: true,
          saves: true, shotsTotal: true, shotsOnTarget: true, passesTotal: true,
          passesAccuracy: true, yellowCards: true, redCards: true,
        } },
        events: { select: {
          sequence: true, minute: true, extraMinute: true, type: true, detail: true,
          playerName: true, relatedPlayerName: true,
          team: { select: { apiId: true, name: true } },
        }, orderBy: { sequence: 'asc' } },
      },
    });
    if (!fixture) throw new NotFoundException('Fixture not found');
    const clock = replayClock();
    if (!fixture.kickoffAt || fixture.kickoffAt.getTime() + 3 * 3600000 > Date.parse(clock.replayNow)) {
      return { ...fixture, homeGoals: null, awayGoals: null, elapsed: null, referee: null,
        status: fixture.kickoffAt && fixture.kickoffAt.getTime() <= Date.parse(clock.replayNow) ? 'AWAITING_RESULT' : 'UPCOMING',
        lineups: [], playerStats: [], events: [], lineupsSyncedAt: null, playerStatsSyncedAt: null, eventsSyncedAt: null };
    }
    return fixture;
  }
}
