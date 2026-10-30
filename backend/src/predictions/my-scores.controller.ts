import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthGuard, AuthRequest } from '../auth/auth.guard';
import { PrismaService } from '../database/prisma.service';
import { replayClock, replayDateToReal } from '../fixtures/replay-clock';

@ApiTags('my scores') @UseGuards(AuthGuard) @Controller('me')
export class MyScoresController {
  constructor(private readonly db: PrismaService) {}
  @Get('scores')
  async scores(@Req() request: AuthRequest) {
    const predictions = await this.db.client.lineupPrediction.findMany({ where: { userId: request.user.id },
      select: { id: true, formation: true, score: true, scoredAt: true, matchedPlayerApiIds: true, submittedReplayAt: true,
        team: { select: { apiId: true, name: true, logoUrl: true } },
        fixture: { select: { apiId: true, kickoffAt: true, round: true,
          homeTeam: { select: { apiId: true, name: true, logoUrl: true } }, awayTeam: { select: { apiId: true, name: true, logoUrl: true } } } },
        picks: { orderBy: { slot: 'asc' }, select: { player: { select: { apiId: true, name: true, photoUrl: true } } } } },
      orderBy: [{ fixture: { kickoffAt: 'desc' } }, { team: { name: 'asc' } }],
    });
    const scorePredictions = await this.db.client.scorePrediction.findMany({ where: { userId: request.user.id },
      select: { id: true, homeGoals: true, awayGoals: true, points: true, actualHomeGoals: true, actualAwayGoals: true, scoredAt: true, submittedReplayAt: true, updatedAt: true,
        team: { select: { apiId: true, name: true, logoUrl: true } },
        fixture: { select: { apiId: true, kickoffAt: true, round: true,
          homeTeam: { select: { apiId: true, name: true, logoUrl: true } }, awayTeam: { select: { apiId: true, name: true, logoUrl: true } } } } },
      orderBy: [{ fixture: { kickoffAt: 'desc' } }, { team: { name: 'asc' } }],
    });
    type ClubSummary = { team: (typeof predictions)[number]['team']; points: number; predictions: number; scoredMatches: number; pendingMatches: number;
      scorePoints: number; scorePredictions: number; scoreScoredMatches: number; scorePendingMatches: number };
    const teams = new Map<number, ClubSummary>();
    const empty = (team: ClubSummary['team']): ClubSummary => ({ team, points: 0, predictions: 0, scoredMatches: 0, pendingMatches: 0,
      scorePoints: 0, scorePredictions: 0, scoreScoredMatches: 0, scorePendingMatches: 0 });
    for (const row of predictions) {
      const team = teams.get(row.team.apiId) || empty(row.team);
      team.predictions++;
      if (row.score === null) team.pendingMatches++; else { team.points += row.score; team.scoredMatches++; }
      teams.set(row.team.apiId, team);
    }
    for (const row of scorePredictions) {
      const team = teams.get(row.team.apiId) || empty(row.team);
      team.scorePredictions++;
      if (row.points === null) team.scorePendingMatches++; else { team.scorePoints += row.points; team.scoreScoredMatches++; }
      teams.set(row.team.apiId, team);
    }
    return { user: request.user, clock: replayClock(), teams: [...teams.values()].sort((a, b) => b.points - a.points || a.team.name.localeCompare(b.team.name)),
      scorePredictions: scorePredictions.map((row) => ({ ...row, resultAvailableAt: row.fixture.kickoffAt
        ? replayDateToReal(new Date(row.fixture.kickoffAt.getTime() + 3 * 3600000)).toISOString() : null })),
      predictions: predictions.map((row) => ({ ...row, resultAvailableAt: row.fixture.kickoffAt
        ? replayDateToReal(new Date(row.fixture.kickoffAt.getTime() + 3 * 3600000)).toISOString() : null,
        players: row.picks.map((pick) => ({ ...pick.player, correct: row.score === null ? null : row.matchedPlayerApiIds.includes(pick.player.apiId) })), picks: undefined })) };
  }
}
