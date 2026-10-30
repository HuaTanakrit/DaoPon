export const REPLAY_YEAR_OFFSET = 2;
const bangkokOffsetMs = 7 * 60 * 60 * 1000;

// Keep the Bangkok calendar date and time; clamp Feb 29 in non-leap years.
export function shiftBangkokYears(date: Date, years: number): Date {
  const local = new Date(date.getTime() + bangkokOffsetMs);
  const year = local.getUTCFullYear() + years;
  const month = local.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(local.getUTCDate(), lastDay),
    local.getUTCHours(), local.getUTCMinutes(), local.getUTCSeconds(), local.getUTCMilliseconds()) - bangkokOffsetMs);
}

let demoTime: Date | null = null;
let revision = 0;

export function setReplayOverride(date: Date | null, version = Date.now()) {
  demoTime = date ? new Date(date) : null;
  revision = version;
}

export function replayClock(now = new Date(Date.now())) {
  return {
    realNow: now.toISOString(),
    replayNow: (demoTime ?? shiftBangkokYears(now, -REPLAY_YEAR_OFFSET)).toISOString(),
    mode: demoTime ? 'DEMO' as const : 'LIVE' as const,
    revision,
    yearOffset: REPLAY_YEAR_OFFSET,
    timeZone: 'Asia/Bangkok' as const,
  };
}

// Retry leases and authentication still use wall time. Only game deadlines move.
export function replayDateToReal(date: Date, now = new Date(Date.now())) {
  return demoTime ? new Date(now.getTime() + Math.max(0, date.getTime() - demoTime.getTime()))
    : shiftBangkokYears(date, REPLAY_YEAR_OFFSET);
}
