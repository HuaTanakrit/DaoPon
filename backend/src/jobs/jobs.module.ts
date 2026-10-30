import { Module } from '@nestjs/common';
import { PredictionsModule } from '../predictions/predictions.module';
import { PlayersModule } from '../players/players.module';
import { JobsController } from './jobs.controller';
import { JobsGuard } from './jobs.guard';
import { JobsService } from './jobs.service';

@Module({ imports: [PredictionsModule, PlayersModule], controllers: [JobsController], providers: [JobsGuard, JobsService], exports: [JobsService] })
export class JobsModule {}
