import { replayClock, shiftBangkokYears, replayDateToReal, setReplayOverride } from '../src/fixtures/replay-clock';

describe('Bangkok replay clock', () => {
  afterEach(() => setReplayOverride(null, 0));
  it('maps the real date to the same date and time two years earlier', () => {
    expect(replayClock(new Date('2026-10-29T16:30:00Z'))).toEqual({
      realNow: '2026-10-29T16:30:00.000Z', replayNow: '2024-10-29T16:30:00.000Z',
      yearOffset: 2, timeZone: 'Asia/Bangkok', mode: 'LIVE', revision: 0,
    });
  });

  it('clamps leap day using the Bangkok date, even before UTC midnight', () => {
    // 00:30 on Feb 29 in Bangkok -> 00:30 on Feb 28 two years later.
    expect(shiftBangkokYears(new Date('2024-02-28T17:30:00Z'), 2).toISOString())
      .toBe('2026-02-27T17:30:00.000Z');
  });

  it('preserves the local new-year boundary and kickoff time', () => {
    expect(shiftBangkokYears(new Date('2024-12-31T18:15:00Z'), 2).toISOString())
      .toBe('2026-12-31T18:15:00.000Z');
  });

  it('freezes only game time while wall time continues and resets to normal', () => {
    setReplayOverride(new Date('2024-11-02T18:00:00Z'), 7);
    expect(replayClock(new Date('2026-10-31T00:00:00Z'))).toMatchObject({ mode: 'DEMO', revision: 7, replayNow: '2024-11-02T18:00:00.000Z', realNow: '2026-10-31T00:00:00.000Z' });
    expect(replayClock(new Date('2026-10-31T01:00:00Z')).replayNow).toBe('2024-11-02T18:00:00.000Z');
    setReplayOverride(null, 8);
    expect(replayClock(new Date('2026-10-31T01:00:00Z'))).toMatchObject({ mode: 'LIVE', replayNow: '2024-10-31T01:00:00.000Z' });
  });

  it('makes advanced demo deadlines due now without changing real retry time', () => {
    const real = new Date('2026-10-31T00:00:00Z');
    setReplayOverride(new Date('2024-11-02T18:00:00Z'));
    expect(replayDateToReal(new Date('2024-11-02T18:00:00Z'), real)).toEqual(real);
    expect(replayDateToReal(new Date('2024-11-02T19:00:00Z'), real).getTime()).toBe(real.getTime() + 3600000);
  });
});
