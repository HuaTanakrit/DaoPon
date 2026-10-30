import { Controller, Get, NotFoundException, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service';
import { pageResult } from '../common/dto/pagination.dto';
import { SeasonQueryDto } from '../common/dto/season.dto';

@ApiTags('teams')
@Controller('teams')
export class TeamsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() query: SeasonQueryDto) {
    const where = { seasonMemberships: { some: { season: { year: query.season, league: { apiId: query.league } } } } };
    const [teams, total] = await this.prisma.client.$transaction([
      this.prisma.client.team.findMany({
        where, orderBy: { name: 'asc' }, skip: (query.page - 1) * query.limit, take: query.limit,
        include: { seasonMemberships: { where: { season: { year: query.season, league: { apiId: query.league } } },
          select: { playerPagesTotal: true, playerPagesImported: true, playersSyncedAt: true } } },
      }),
      this.prisma.client.team.count({ where }),
    ]);
    return pageResult(teams, total, query);
  }

  @Get(':apiId')
  async get(@Param('apiId', ParseIntPipe) apiId: number, @Query() query: SeasonQueryDto) {
    const team = await this.prisma.client.team.findUnique({ where: { apiId },
      include: { seasonMemberships: { where: { season: { year: query.season, league: { apiId: query.league } } },
        select: { playerPagesTotal: true, playerPagesImported: true, playersSyncedAt: true } } },
    });
    if (!team) throw new NotFoundException('Team not found');
    return team;
  }
}
