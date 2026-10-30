import 'reflect-metadata';
import { BadGatewayException, HttpException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FootballApiService } from '../src/football-api/football-api.service';

describe('Football API boundary', () => {
  let service: FootballApiService;
  let mockedFetch: jest.SpyInstance;
  beforeEach(() => {
    service = new FootballApiService(new ConfigService({ API_FOOTBALL_KEY: 'test-key-not-a-real-secret' }));
    mockedFetch = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());

  it('treats HTTP 200 plan errors as inaccessible seasons', async () => {
    mockedFetch.mockResolvedValue(new Response(JSON.stringify({
      response: [], errors: { plan: 'Free plans do not have access to this season' },
    }), { status: 200 }));
    await expect(service.get('/fixtures', { league: 39, season: 2026 })).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
  it('captures the remaining daily quota without exposing the API key', async () => {
    mockedFetch.mockResolvedValue(new Response(JSON.stringify({ response: [], errors: [] }), {
      status: 200, headers: { 'x-ratelimit-requests-remaining': '92' },
    }));
    await expect(service.get('/fixtures', { league: 39, season: 2024 })).resolves.toEqual({ response: [], errors: [] });
    expect(service.quotaRemaining).toBe(92);
  });
  it('reports rate limiting distinctly', async () => {
    mockedFetch.mockResolvedValue(new Response('', { status: 429 }));
    const error = await service.get('/fixtures', { id: 1 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
  });
  it('forgets yesterday\'s quota after the UTC daily reset', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-29T23:59:00Z'));
    mockedFetch.mockResolvedValue(new Response(JSON.stringify({ response: [], errors: [] }), {
      status: 200, headers: { 'x-ratelimit-requests-remaining': '5' },
    }));
    await service.get('/fixtures', { id: 1 });
    expect(service.quotaRemaining).toBe(5);
    now.mockReturnValue(Date.parse('2026-10-30T00:00:00Z'));
    expect(service.quotaRemaining).toBeNull();
  });
  it('does not accept HTML or malformed responses as empty data', async () => {
    mockedFetch.mockResolvedValue(new Response('<html>unavailable</html>', { status: 200 }));
    await expect(service.get('/fixtures', { id: 1 })).rejects.toBeInstanceOf(BadGatewayException);
  });
});
