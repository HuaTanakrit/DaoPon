import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('HTTP API before database configuration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const values: Record<string, unknown> = { DATABASE_URL: '', ADMIN_API_KEY: 'test-admin-token', AUTO_SYNC_ENABLED: false };
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService).useValue({ get: (key: string) => values[key] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it('starts and reports missing database configuration', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200)
      .expect({ status: 'ok', database: 'not_configured' });
  });
  it('returns 503 for readiness until a database is connected', async () => {
    await request(app.getHttpServer()).get('/api/health/ready').expect(503);
  });
  it('returns an actionable 503 for database reads', async () => {
    const result = await request(app.getHttpServer()).get('/api/teams').expect(503);
    expect(result.body.message).toContain('DATABASE_URL');
  });
  it('rejects invalid pagination before querying the database', async () => {
    await request(app.getHttpServer()).get('/api/fixtures?limit=1000').expect(400);
    await request(app.getHttpServer()).get('/api/fixtures?season=hello').expect(400);
    await request(app.getHttpServer()).get('/api/fixtures/upcoming?team=-1').expect(400);
    await request(app.getHttpServer()).get('/api/fixtures/upcoming?now=2020-01-01').expect(400);
  });
  it('protects all sync endpoints against unauthenticated callers', async () => {
    await request(app.getHttpServer()).post('/api/admin/sync/fixtures').send({ season: 2024 }).expect(401);
    await request(app.getHttpServer()).get('/api/admin/sync/status').expect(401);
  });
  it('validates an authenticated sync request before spending API quota', async () => {
    await request(app.getHttpServer()).post('/api/admin/sync/players')
      .set('Authorization', 'Bearer test-admin-token').send({ season: 2024, team: -1 }).expect(400);
  });
  it('requires login before reading or saving predictions', async () => {
    await request(app.getHttpServer()).get('/api/predictions/1?team=40').expect(401);
    await request(app.getHttpServer()).put('/api/predictions/1').send({ team: 40, formation: '4-3-3', playerApiIds: [] }).expect(401);
    await request(app.getHttpServer()).put('/api/predictions/1').send({ team: 40, formation: '4-3-3', playerApiIds: Array(11).fill(306) }).expect(401);
  });
});
