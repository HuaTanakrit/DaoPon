import 'server-only';
import { notFound } from 'next/navigation';
import type { PageResult, Team, UpcomingFixturesResult, ReplayPlayersResult, PredictionContext } from './types';

const backend = (process.env.BACKEND_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');
export const SEASON = 2024;
export const SEASON_LABEL = '2024/25';

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${backend}/api${path}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error('โหลดข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง');
  return response.json() as Promise<T>;
}

export async function getTeams(): Promise<Team[]> {
  return (await get<PageResult<Team>>(`/teams?season=${SEASON}&league=39&limit=100`)).data;
}

export async function getTeam(id: number): Promise<Team> {
  return get<Team>(`/teams/${id}?season=${SEASON}&league=39`);
}

export async function getPlayers(teamId: number): Promise<ReplayPlayersResult> {
  const path = `/players/replay?season=${SEASON}&league=39&team=${teamId}&limit=100`;
  const first = await get<ReplayPlayersResult>(path);
  const players = [...first.data];
  for (let page = 2; page <= first.meta.pages; page++) {
    players.push(...(await get<ReplayPlayersResult>(`${path}&page=${page}`)).data);
  }
  return { ...first, data: players };
}

export async function getUpcomingFixtures(): Promise<UpcomingFixturesResult> {
  const path = `/fixtures/upcoming?season=${SEASON}&league=39&limit=100`;
  const first = await get<UpcomingFixturesResult>(path);
  const rest = await Promise.all(Array.from({ length: first.meta.pages - 1 }, (_, index) =>
    get<UpcomingFixturesResult>(`${path}&page=${index + 2}`)));
  return { ...first, data: [...first.data, ...rest.flatMap((page) => page.data)] };
}

export function getPredictionContext(id: number, team?: number): Promise<PredictionContext> {
  return get<PredictionContext>(`/predictions/fixtures/${id}${team ? `?team=${team}` : ''}`);
}
