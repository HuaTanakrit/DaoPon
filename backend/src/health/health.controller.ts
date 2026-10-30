import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  health() {
    return { status: 'ok', database: this.prisma.configured ? 'configured' : 'not_configured' };
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'connected' };
    } catch {
      throw new ServiceUnavailableException('Database is not ready; check DATABASE_URL and migrations');
    }
  }
}
