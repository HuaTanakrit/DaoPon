import { CanActivate, ExecutionContext, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { Request } from 'express';

@Injectable()
export class DemoGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    if (this.config.get<boolean>('DEMO_CONTROLS_ENABLED') !== true) throw new NotFoundException();
    const secret = this.config.get<string>('DEMO_CONTROL_TOKEN') || '';
    const header = context.switchToHttp().getRequest<Request>().headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
    const expected = Buffer.from(secret), actual = Buffer.from(token);
    if (expected.length < 32 || expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new UnauthorizedException();
    return true;
  }
}
