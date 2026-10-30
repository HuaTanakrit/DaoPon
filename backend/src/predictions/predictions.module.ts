import { Module } from '@nestjs/common';
import { PlayersModule } from '../players/players.module';
import { PredictionsController } from './predictions.controller';
import { PredictionsService } from './predictions.service';
import { FootballApiModule } from '../football-api/football-api.module';
import { PredictionScoringService } from './prediction-scoring.service';
import { MyScoresController } from './my-scores.controller';

@Module({ imports: [PlayersModule, FootballApiModule], controllers: [PredictionsController, MyScoresController], providers: [PredictionsService, PredictionScoringService], exports: [PredictionScoringService] })
export class PredictionsModule {}
