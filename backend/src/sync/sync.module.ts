import { Module } from '@nestjs/common';
import { FootballApiModule } from '../football-api/football-api.module';
import { AdminGuard } from './admin.guard';
import { SyncController } from './sync.controller';
import { SyncScheduler } from './sync.scheduler';
import { SyncService } from './sync.service';

@Module({ imports: [FootballApiModule], controllers: [SyncController],
  providers: [AdminGuard, SyncService, SyncScheduler], exports: [SyncService] })
export class SyncModule {}
