import { Module } from '@nestjs/common';
import { FootballApiService } from './football-api.service';
import { FootballBudgetService } from './football-budget.service';

@Module({ providers: [FootballApiService, FootballBudgetService], exports: [FootballApiService, FootballBudgetService] })
export class FootballApiModule {}
