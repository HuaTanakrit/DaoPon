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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    ScheduleModule.forRoot(), DatabaseModule, AuthModule, TeamsModule, FixturesModule, PlayersModule, SyncModule, PredictionsModule, DemoModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
