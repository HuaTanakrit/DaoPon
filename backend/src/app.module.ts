import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { validateEnvironment } from './config/environment';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { TeamsModule } from './teams/teams.module';
import { FixturesModule } from './fixtures/fixtures.module';
import { PlayersModule } from './players/players.module';
import { SyncModule } from './sync/sync.module';
import { PredictionsModule } from './predictions/predictions.module';
import { AuthModule } from './auth/auth.module';
import { DemoModule } from './demo/demo.module';
import { ReplayClockModule } from './fixtures/replay-clock.service';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    ScheduleModule.forRoot(), DatabaseModule, ReplayClockModule, AuthModule, TeamsModule, FixturesModule, PlayersModule, SyncModule, PredictionsModule, JobsModule, DemoModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
