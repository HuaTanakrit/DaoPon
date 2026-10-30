import { HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { FootballApiState } from '../generated/prisma/client';

@Injectable()
export class FootballBudgetService {
  constructor(private readonly db: PrismaService, private readonly config: ConfigService) {}
  get configured() { return this.db.configured; }
  private hash(key: string) { return createHash('sha256').update(key).digest('hex'); }

  async reserve(key: string) {
    const keyHash = this.hash(key), now = new Date(Date.now()), day = now.toISOString().slice(0, 10);
    const limit = this.config.get<number>('FOOTBALL_DAILY_LIMIT') ?? 100;
    return this.db.client.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO football_api_state ("keyHash",day,used,"nextAllowedAt") VALUES (${keyHash},${day},0,${now}) ON CONFLICT DO NOTHING`;
      const [stored] = await tx.$queryRaw<FootballApiState[]>`SELECT * FROM football_api_state WHERE "keyHash"=${keyHash} FOR UPDATE`;
      const state = stored.day === day ? stored : { ...stored, day, used: 0, providerRemaining: null };
      const remaining = Math.min(limit - state.used, state.providerRemaining ?? limit);
      if (remaining <= 5) throw new HttpException('Daily Football API budget reserved; retry after 00:00 UTC', 429);
      const at = Math.max(now.getTime(), stored.nextAllowedAt.getTime());
      if (at - now.getTime() > 15000) throw new ServiceUnavailableException('Football API queue is busy; retry later');
      await tx.footballApiState.update({ where: { keyHash }, data: { day, used: state.used + 1,
        providerRemaining: state.providerRemaining === null ? null : Math.max(0, state.providerRemaining - 1),
        nextAllowedAt: new Date(at + 6500) } });
      return { at, remaining: remaining - 1 };
    });
  }

  async observe(key: string, remaining: number) {
    const keyHash = this.hash(key), day = new Date(Date.now()).toISOString().slice(0, 10);
    await this.db.client.$executeRaw`UPDATE football_api_state SET "providerRemaining"=LEAST(COALESCE("providerRemaining",${remaining}),${remaining})
      WHERE "keyHash"=${keyHash} AND day=${day}`;
  }
}
