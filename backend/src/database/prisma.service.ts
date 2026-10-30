import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly instance: PrismaClient | null;

  constructor(config: ConfigService) {
    const connectionString = config.get<string>('DATABASE_URL');
    this.instance = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({
          connectionString,
          max: 5,
          connectionTimeoutMillis: 5000,
          idleTimeoutMillis: 30000,
        }) })
      : null;
  }

  get configured(): boolean { return this.instance !== null; }

  get client(): PrismaClient {
    if (!this.instance) {
      throw new ServiceUnavailableException('Set DATABASE_URL and run npm run db:migrate first');
    }
    return this.instance;
  }

  async onModuleDestroy() { await this.instance?.$disconnect(); }
}
