export interface Team {
  apiId: number;
  name: string;
  logoUrl: string | null;
  seasonMemberships?: Array<{ playerPagesTotal: number | null; playerPagesImported: number | null; playersSyncedAt: string | null }>;
}
export interface SeasonStat {
  position: string | null;
  goals: number | null;
  assists: number | null;
  appearances: number | null;
  minutes: number | null;
  rating: string | null;
  team: { apiId: number; name: string };
}
export interface Player {
  apiId: number;
  name: string;
  firstName: string | null;
  lastName: string | null;
  nationality: string | null;
  photoUrl: string | null;
  seasonStats: SeasonStat[];
}
export interface PageResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; pages: number };
}

export interface UpcomingFixture {
  apiId: number;
  kickoffAt: string;
  replayKickoffAt: string;
  round: string | null;
  venueName: string | null;
  status: 'UPCOMING';
  homeTeam: Team;
  awayTeam: Team;
}

export interface ReplayClock {
  realNow: string;
  replayNow: string;
  yearOffset: number;
  timeZone: string;
  mode: 'LIVE' | 'DEMO';
  revision: number;
}

export interface UpcomingFixturesResult extends PageResult<UpcomingFixture> {
  clock: ReplayClock;
}

export interface ReplayPlayersResult extends PageResult<Player> {
  clock: ReplayClock;
  coverage: { expectedMatches: number; importedMatches: number; complete: boolean; source: string; matchDelayHours: number };
}

export interface PredictionContext {
  fixture: Omit<UpcomingFixture, 'status'>;
  team: Team;
  players: Player[];
  coverage: ReplayPlayersResult['coverage'] | null;
  clock: ReplayClock;
  window: { opensAt: string | null; closesAt: string | null; canPredict: boolean; state: 'OPEN' | 'NOT_OPEN' | 'CLOSED' | 'UNAVAILABLE' };
}
export interface SavedPrediction { formation: string; updatedAt: string; playerApiIds: number[]; score: number | null }
export interface AccountUser { id: string; displayName: string; email: string }
export interface SavedScorePrediction {
  homeGoals: number; awayGoals: number; points: number | null;
  actualHomeGoals: number | null; actualAwayGoals: number | null; scoredAt: string | null; updatedAt: string;
}
export interface MyScores {
  user: AccountUser; clock: ReplayClock;
  teams: Array<{ team: Team; points: number; predictions: number; scoredMatches: number; pendingMatches: number;
    scorePoints: number; scorePredictions: number; scoreScoredMatches: number; scorePendingMatches: number }>;
  scorePredictions: Array<SavedScorePrediction & { id: string; team: Team; submittedReplayAt: string; resultAvailableAt: string | null;
    fixture: { apiId: number; kickoffAt: string; round: string | null; homeTeam: Team; awayTeam: Team } }>;
  predictions: Array<{ id: string; formation: string; score: number | null; scoredAt: string | null; submittedReplayAt: string; resultAvailableAt: string | null;
    team: Team; fixture: { apiId: number; kickoffAt: string; round: string | null; homeTeam: Team; awayTeam: Team };
    players: Array<{ apiId: number; name: string; photoUrl: string | null; correct: boolean | null }> }>;
}
