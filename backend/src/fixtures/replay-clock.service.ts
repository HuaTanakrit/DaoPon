import { CallHandler, ExecutionContext, Global, Injectable, Module, NestInterceptor } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { PrismaService } from '../database/prisma.service';
import { ClockSnapshot, withReplayClock } from './replay-clock';

@Injectable()
export class ReplayClockService {
  constructor(private readonly db: PrismaService, private readonly config: ConfigService) {}
  async snapshot(): Promise<ClockSnapshot> {
    if (!this.db.configured || this.config.get<boolean>('DEMO_CONTROLS_ENABLED') !== true) return { demoTime: null, revision: 0 };
    const row = await this.db.client.replaySetting.findUnique({ where: { id: 1 } });
    return { demoTime: row?.replayAt ?? null, revision: row?.updatedAt.getTime() ?? 0 };
  }
  async run<T>(operation: () => T): Promise<Awaited<T>> {
    return await withReplayClock(await this.snapshot(), operation);
  }
}

@Injectable()
class ReplayClockInterceptor implements NestInterceptor {
  constructor(private readonly clock: ReplayClockService) {}
  async intercept(context: ExecutionContext, next: CallHandler) {
    // Liveness must not depend on loading game state; readiness checks DB itself.
    if (context.switchToHttp().getRequest<{ path?: string }>().path?.startsWith('/api/health')) return next.handle();
    const snapshot = await this.clock.snapshot();
    // Subscribe inside AsyncLocalStorage so overlapping requests never share a clock.
    return new Observable((subscriber) => withReplayClock(snapshot, () => next.handle().subscribe(subscriber)));
  }
}

@Global()
@Module({ providers: [ReplayClockService, { provide: APP_INTERCEPTOR, useClass: ReplayClockInterceptor }], exports: [ReplayClockService] })
export class ReplayClockModule {}
