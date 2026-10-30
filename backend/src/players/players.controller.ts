import { Controller, Get, NotFoundException, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { pageResult } from '../common/dto/pagination.dto';
import { PlayersQueryDto, LeaderboardQueryDto } from './players.dto';
import { ReplayStatsService } from './replay-stats.service';

@ApiTags('players')
@Controller('players')
export class PlayersController {
  constructor(private readonly prisma: PrismaService, private readonly replayStats: ReplayStatsService) {}

  @Get('replay')
  replay(@Query() query: PlayersQueryDto) { return this.replayStats.list(query); }

  @Get()
  async list(@Query() query: PlayersQueryDto) {
    const seasonFilter = { year: query.season, league: { apiId: query.league } };
    const teamFilter = query.team ? { team: { apiId: query.team } } : {};
    const where: Prisma.PlayerWhereInput = {
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
      OR: [
        { seasonStats: { some: { season: seasonFilter, ...teamFilter } } },
        { matchStats: { some: { fixture: { season: seasonFilter }, ...teamFilter } } },
      ],
    };
    const [players, total] = await this.prisma.client.$transaction([
      this.prisma.client.player.findMany({ where, orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.limit, take: query.limit,
        include: { seasonStats: { where: { season: seasonFilter, ...teamFilter },
          select: { position: true, goals: true, assists: true, appearances: true, minutes: true, rating: true,
            team: { select: { apiId: true, name: true } } } } },
      }),
      this.prisma.client.player.count({ where }),
    ]);
    return pageResult(players, total, query);
  }

  @Get('leaderboard')
  async leaderboard(@Query() query: LeaderboardQueryDto) {
    // Aggregate across clubs so a mid-season transfer does not split a player.
    const grouped = await this.prisma.client.playerSeasonStat.groupBy({
      by: ['playerId'],
      where: { season: { year: query.season, league: { apiId: query.league } } },
      _sum: { goals: true, assists: true, minutes: true },
    });
    // A season has only hundreds of players. Sort after aggregation to place
    // unknown totals last without treating NULL as zero or dropping club rows.
    grouped.sort((a, b) => {
      const left = a._sum[query.metric];
      const right = b._sum[query.metric];
      if (left === null && right !== null) return 1;
      if (right === null && left !== null) return -1;
      return (right ?? 0) - (left ?? 0) || a.playerId - b.playerId;
    });
    const rows = grouped.slice((query.page - 1) * query.limit, query.page * query.limit);
    const players = await this.prisma.client.player.findMany({
      where: { id: { in: rows.map((r) => r.playerId) } },
      select: { id: true, apiId: true, name: true, photoUrl: true },
    });
    const byId = new Map(players.map((p) => [p.id, p]));
    return {
      data: rows.map((r) => ({ player: byId.get(r.playerId), ...r._sum })),
      meta: { season: query.season, league: query.league, metric: query.metric,
        page: query.page, limit: query.limit, total: grouped.length, source: 'provider_season_snapshots' },
    };
  }

  @Get(':apiId')
  async detail(@Param('apiId', ParseIntPipe) apiId: number) {
    const player = await this.prisma.client.player.findUnique({ where: { apiId }, include: {
      seasonStats: {
        omit: { rawStatistics: true },
        include: {
          team: { select: { apiId: true, name: true, logoUrl: true } },
          season: { select: { year: true, league: { select: { apiId: true, name: true } } } },
        },
        orderBy: { season: { year: 'desc' } },
      },
    } });
    if (!player) throw new NotFoundException('Player not found');
    return player;
  }
}
