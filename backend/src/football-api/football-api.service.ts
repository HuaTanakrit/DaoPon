import { BadGatewayException, HttpException, Injectable, Optional, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { setTimeout as delay } from 'node:timers/promises';
import { ApiResponse } from './types';
import { FootballBudgetService } from './football-budget.service';

type Endpoint = '/fixtures' | '/fixtures/lineups' | '/fixtures/players' | '/fixtures/events' | '/players';

@Injectable()
export class FootballApiService {
  private queue: Promise<void> = Promise.resolve();
  private nextAllowedAt = 0;
  private remaining: number | null = null;
  private quotaDay: string | null = null;

  constructor(private readonly config: ConfigService, @Optional() private readonly budget?: FootballBudgetService) {}

  get<T>(endpoint: Endpoint, params: Record<string, number | string>): Promise<ApiResponse<T>> {
    const result = this.queue.then(() => this.request<T>(endpoint, params));
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  get quotaRemaining(): number | null {
    return this.quotaDay === new Date(Date.now()).toISOString().slice(0, 10) ? this.remaining : null;
  }

  private async request<T>(endpoint: Endpoint, params: Record<string, number | string>): Promise<ApiResponse<T>> {
    const key = this.config.get<string>('API_FOOTBALL_KEY');
    if (!key) throw new ServiceUnavailableException('API_FOOTBALL_KEY is not configured');
    if (this.budget?.configured) {
      const reserved = await this.budget.reserve(key);
      this.remaining = reserved.remaining; this.quotaDay = new Date(Date.now()).toISOString().slice(0, 10);
      await delay(Math.max(0, reserved.at - Date.now()));
    } else {
      if (this.config.get<string>('VERCEL')) throw new ServiceUnavailableException('Persistent API budget requires DATABASE_URL');
      await delay(Math.max(0, this.nextAllowedAt - Date.now()));
      this.nextAllowedAt = Date.now() + 6500;
    }
    const url = new URL(`https://v3.football.api-sports.io${endpoint}`);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
    let response: Response;
    try {
      response = await fetch(url, { headers: { 'x-apisports-key': key }, signal: AbortSignal.timeout(15000) });
    } catch {
      throw new BadGatewayException('Football API connection failed or timed out');
    }
    const remaining = response.headers.get('x-ratelimit-requests-remaining');
    if (remaining !== null && Number.isFinite(Number(remaining))) {
      this.remaining = Number(remaining);
      this.quotaDay = new Date(Date.now()).toISOString().slice(0, 10);
      if (this.budget?.configured) await this.budget.observe(key, Number(remaining));
    }
    if (response.status === 429) throw new HttpException('Football API rate limit reached; try again later', 429);
    if (!response.ok) throw new BadGatewayException('Football API returned an unsuccessful HTTP response');
    let payload: ApiResponse<T>;
    try { payload = await response.json() as ApiResponse<T>; }
    catch { throw new BadGatewayException('Football API returned invalid JSON'); }
    if (!payload || typeof payload !== 'object') throw new BadGatewayException('Football API returned an invalid payload');
    const errors = payload.errors;
    if (errors && Object.keys(errors).length > 0) {
      if (!Array.isArray(errors) && errors.plan) {
        throw new UnprocessableEntityException({
          code: 'SEASON_NOT_SUPPORTED',
          message: 'This season is not accessible with the current Football API plan',
        });
      }
      throw new BadGatewayException('Football API rejected the request; check quota and request parameters');
    }
    if (!Array.isArray(payload.response)) throw new BadGatewayException('Football API response is not an array');
    return payload;
  }
}
