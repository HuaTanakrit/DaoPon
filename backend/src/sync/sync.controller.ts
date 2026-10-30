import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from './admin.guard';
import { SyncService } from './sync.service';
import { SyncPlayersDto, SyncSeasonDto } from './sync.dto';
import { FootballApiService } from '../football-api/football-api.service';

@ApiTags('admin sync')
@ApiBearerAuth('admin')
@UseGuards(AdminGuard)
@Controller('admin/sync')
export class SyncController {
  constructor(private readonly sync: SyncService, private readonly api: FootballApiService) {}

  @Get('status')
  status() { return { dailyQuotaRemaining: this.api.quotaRemaining, defaultSeason: 2024 }; }

  @Post('fixtures')
  fixtures(@Body() body: SyncSeasonDto) { return this.sync.seasonFixtures(body.season); }

  @Post('fixtures/:apiId')
  fixture(@Param('apiId', ParseIntPipe) apiId: number) { return this.sync.match(apiId); }

  @Post('players')
  players(@Body() body: SyncPlayersDto) { return this.sync.seasonPlayers(body.season, body.team); }
}
