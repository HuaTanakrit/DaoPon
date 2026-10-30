import { Module } from '@nestjs/common';
import { PlayersController } from './players.controller';
import { ReplayStatsService } from './replay-stats.service';
import { FootballApiModule } from '../football-api/football-api.module';

@Module({ imports: [FootballApiModule], controllers: [PlayersController], providers: [ReplayStatsService], exports: [ReplayStatsService] })
export class PlayersModule {}
