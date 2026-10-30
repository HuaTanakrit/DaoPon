export const PREDICTION_WINDOW_MS = 7 * 24 * 3600000;

export function predictionWindow(kickoff: Date | null, replayNow: string, status: string) {
  const remaining = kickoff ? kickoff.getTime() - Date.parse(replayNow) : null;
  const cancelled = ['CANC', 'PST', 'ABD', 'AWD', 'WO'].includes(status);
  return {
    opensAt: kickoff ? new Date(kickoff.getTime() - PREDICTION_WINDOW_MS).toISOString() : null,
    closesAt: kickoff?.toISOString() ?? null,
    canPredict: !cancelled && remaining !== null && remaining > 0 && remaining <= PREDICTION_WINDOW_MS,
    state: cancelled || remaining === null ? 'UNAVAILABLE' : remaining <= 0 ? 'CLOSED'
      : remaining > PREDICTION_WINDOW_MS ? 'NOT_OPEN' : 'OPEN',
  };
}
