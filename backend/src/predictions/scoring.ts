export function scoreNames(pickedApiIds: number[], actualStarterApiIds: number[]) {
  const starters = new Set(actualStarterApiIds);
  const matchedPlayerApiIds = [...new Set(pickedApiIds)].filter((id) => starters.has(id));
  return { score: matchedPlayerApiIds.length, matchedPlayerApiIds };
}

export function scoreResult(home: number, away: number, actualHome: number, actualAway: number): 0 | 1 | 3 {
  if (home === actualHome && away === actualAway) return 3;
  return Math.sign(home - away) === Math.sign(actualHome - actualAway) ? 1 : 0;
}
