import { validateEnvironment } from '../src/config/environment';

describe('Vercel environment defaults', () => {
  it('disables process timers on Vercel while preserving local defaults', () => {
    expect(validateEnvironment({ VERCEL: '1' }).BACKGROUND_JOBS_ENABLED).toBe(false);
    expect(validateEnvironment({}).BACKGROUND_JOBS_ENABLED).toBe(true);
  });
  it('rejects unsafe cron secrets and in-process schedules on Vercel', () => {
    expect(() => validateEnvironment({ CRON_SECRET: 'short' })).toThrow('32');
    expect(() => validateEnvironment({ VERCEL: '1', BACKGROUND_JOBS_ENABLED: 'true' })).toThrow('BACKGROUND_JOBS_ENABLED');
    expect(() => validateEnvironment({ VERCEL: '1', AUTO_SYNC_ENABLED: 'true' })).toThrow('AUTO_SYNC_ENABLED');
  });
});
