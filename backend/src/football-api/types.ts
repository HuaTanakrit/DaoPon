export interface ApiTeam { id: number; name: string; logo?: string | null }
export interface ApiPlayer { id: number; name: string; photo?: string | null }
export interface ApiFixture {
  fixture: {
    id: number; date: string | null;
    status: { short: string; elapsed?: number | null; extra?: number | null };
    referee?: string | null;
    venue?: { id?: number | null; name?: string | null; city?: string | null };
  };
  league: { id: number; name: string; country?: string; logo?: string; season: number; round?: string };
  teams: { home: ApiTeam; away: ApiTeam };
  goals: { home: number | null; away: number | null };
  score?: Record<string, { home: number | null; away: number | null }>;
}
export interface ApiLineup {
  team: ApiTeam;
  coach?: { id: number | null; name?: string | null; photo?: string | null };
  formation?: string | null;
  startXI: Array<{ player: ApiPlayer & { number?: number | null; pos?: string | null; grid?: string | null } }>;
  substitutes: ApiLineup['startXI'];
}
export interface ApiStatistics {
  games: {
    minutes?: number | null; number?: number | null; position?: string | null;
    rating?: string | null; captain?: boolean | null; substitute?: boolean | null;
    appearences?: number | null; lineups?: number | null;
  };
  goals: { total?: number | null; assists?: number | null; conceded?: number | null; saves?: number | null };
  shots?: { total?: number | null; on?: number | null };
  passes?: { total?: number | null; key?: number | null; accuracy?: string | number | null };
  tackles?: { total?: number | null; interceptions?: number | null };
  cards?: { yellow?: number | null; yellowred?: number | null; red?: number | null };
  team?: ApiTeam;
  league?: { id: number; season: number };
}
export interface ApiMatchPlayers {
  team: ApiTeam;
  players: Array<{ player: ApiPlayer; statistics: ApiStatistics[] }>;
}
export interface ApiEvent {
  time: { elapsed: number | null; extra: number | null };
  team: { id: number | null; name?: string };
  player?: { id: number | null; name?: string | null };
  assist?: { id: number | null; name?: string | null };
  type: string;
  detail?: string | null;
  comments?: string | null;
}
export interface ApiSeasonPlayer {
  player: ApiPlayer & {
    firstname?: string | null; lastname?: string | null;
    birth?: { date?: string | null }; nationality?: string | null;
    height?: string | null; weight?: string | null;
  };
  statistics: ApiStatistics[];
}
export interface ApiResponse<T> {
  response: T[];
  errors?: Record<string, unknown> | unknown[];
  paging?: { current: number; total: number };
}
