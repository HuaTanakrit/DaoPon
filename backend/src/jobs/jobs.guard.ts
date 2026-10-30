import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { Request } from 'express';

@Injectable()
export class JobsGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    const secret = this.config.get<string>('CRON_SECRET') || '';
    if (secret.length < 32) throw new ServiceUnavailableException('Scheduled HTTP jobs are not configured');
    const header = context.switchToHttp().getRequest<Request>().headers.authorization;
    const actual = Buffer.from(header?.startsWith('Bearer ') ? header.slice(7) : ''), expected = Buffer.from(secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new UnauthorizedException();
    return true;
  }
}
