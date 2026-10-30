import { Body, Controller, Get, Param, ParseIntPipe, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PredictionsService } from './predictions.service';
import { PredictionTeamDto, SavePredictionDto, SaveScorePredictionDto } from './predictions.dto';
import { AuthGuard, AuthRequest } from '../auth/auth.guard';

@ApiTags('lineup predictions')
@Controller('predictions')
export class PredictionsController {
  constructor(private readonly predictions: PredictionsService) {}

  @Get('fixtures/:apiId')
  context(@Param('apiId', ParseIntPipe) apiId: number, @Query() query: PredictionTeamDto) {
    return this.predictions.context(apiId, query.team);
  }

  @Get(':apiId') @UseGuards(AuthGuard)
  read(@Param('apiId', ParseIntPipe) apiId: number, @Query() query: PredictionTeamDto, @Req() request: AuthRequest) {
    return this.predictions.read(apiId, query.team, request.user);
  }

  @Put(':apiId') @UseGuards(AuthGuard)
  save(@Param('apiId', ParseIntPipe) apiId: number, @Body() body: SavePredictionDto, @Req() request: AuthRequest) {
    return this.predictions.save(apiId, body, request.user);
  }

  @Get(':apiId/score') @UseGuards(AuthGuard)
  readScore(@Param('apiId', ParseIntPipe) apiId: number, @Query() query: PredictionTeamDto, @Req() request: AuthRequest) {
    return this.predictions.readScore(apiId, query.team, request.user);
  }

  @Put(':apiId/score') @UseGuards(AuthGuard)
  saveScore(@Param('apiId', ParseIntPipe) apiId: number, @Body() body: SaveScorePredictionDto, @Req() request: AuthRequest) {
    return this.predictions.saveScore(apiId, body, request.user);
  }
}
