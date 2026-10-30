import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { FootballApiService } from '../src/football-api/football-api.service';
import { SyncService } from '../src/sync/sync.service';
import { SyncScheduler } from '../src/sync/sync.scheduler';
import { Prisma } from '../src/generated/prisma/client';
import { PredictionScoringService } from '../src/predictions/prediction-scoring.service';
import { tokenHash } from '../src/auth/auth.service';
import { replayClock, setReplayOverride } from '../src/fixtures/replay-clock';
import { DemoService } from '../src/demo/demo.service';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
const sample = (name: string): any[] => JSON.parse(readFileSync(join(__dirname, 'fixtures', name + '.json'), 'utf8'));

suite('Database integration using captured API data (no live API calls)', () => {
  let app: INestApplication;
  let db: PrismaService;
  let sync: SyncService;
  let scheduler: SyncScheduler;
  const values: Record<string, unknown> = {
    DATABASE_URL: databaseUrl, ADMIN_API_KEY: 'integration-test-token', AUTO_SYNC_ENABLED: false,
  };
  const api = { get: jest.fn(), quotaRemaining: 100 };
  const fixture = sample('fixture-detail')[0];
  let playerPages: number[] = [];
  let partialLineups = false;

  beforeAll(async () => {
    const databaseName = new URL(databaseUrl!).pathname.slice(1);
    if (!databaseName.endsWith('_test')) throw new Error('Integration tests require a dedicated database ending in _test');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService).useValue({ get: (key: string) => values[key] })
      .overrideProvider(FootballApiService).useValue(api).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    db = app.get(PrismaService);
    sync = app.get(SyncService);
    scheduler = app.get(SyncScheduler);
  });
  beforeEach(async () => {
    setReplayOverride(null, 0); values.DEMO_CONTROLS_ENABLED = false;
    await db.client.$executeRawUnsafe('TRUNCATE TABLE replay_settings, users, auth_sessions, leagues, teams, players, coaches, seasons, fixtures, fixture_lineups, lineup_players, player_match_stats, player_season_stats, match_events, sync_jobs RESTART IDENTITY CASCADE');
    partialLineups = false;
    playerPages = [];
    api.get.mockImplementation(async (endpoint: string, params: Record<string, number>) => {
      const names: Record<string, string> = { '/fixtures/lineups': 'lineups', '/fixtures/players': 'match-players', '/fixtures/events': 'events' };
      if (endpoint === '/players') {
        const page = params.page;
        playerPages.push(page);
        return { response: sample('season-players').slice((page - 1) * 10, page * 10), paging: { current: page, total: 2 } };
      }
      if (endpoint === '/fixtures/lineups' && partialLineups) return { response: [] };
      return { response: endpoint === '/fixtures' ? [fixture] : sample(names[endpoint]) };
    });
  });
  afterAll(async () => { setReplayOverride(null, 0); await app?.close(); });

  it('imports a real fixture twice without duplicated lineups, stats or events', async () => {
    await sync.match(fixture.fixture.id);
    await sync.match(fixture.fixture.id);
    expect(await db.client.fixture.count()).toBe(1);
    expect(await db.client.lineupPlayer.count({ where: { isStarter: true } })).toBe(22);
    expect(await db.client.playerMatchStat.count()).toBe(38);
    expect(await db.client.matchEvent.count()).toBe(14);
    const gakpo = await db.client.playerMatchStat.findFirstOrThrow({ where: { player: { apiId: 247 } } });
    expect(gakpo.goals).toBeNull();
    expect(gakpo.assists).toBe(1);
  }, 30000);

  it('preserves the previous snapshot when the provider returns incomplete details', async () => {
    await sync.match(fixture.fixture.id);
    partialLineups = true;
    await expect(sync.match(fixture.fixture.id)).rejects.toThrow('not complete');
    expect(await db.client.lineupPlayer.count()).toBe(38);
    expect(await db.client.matchEvent.count()).toBe(14);
  }, 30000);

  it('follows player pagination and keeps separate season snapshots after club transfers', async () => {
    await sync.seasonPlayers(2024, 40);
    expect(playerPages).toEqual([1, 2]);
    const snapshot = await db.client.playerSeasonStat.findFirstOrThrow({ where: { goals: { gt: 0 } } });
    const secondTeam = await db.client.team.create({ data: { apiId: 999999, name: 'Transfer test club' } });
    await db.client.playerSeasonStat.create({ data: {
      ...snapshot, teamId: secondTeam.id, goals: 2, assists: 3,
      rawStatistics: snapshot.rawStatistics as Prisma.InputJsonValue,
    } });
    const result = await request(app.getHttpServer()).get('/api/players/leaderboard?season=2024&limit=100').expect(200);
    const player = await db.client.player.findUniqueOrThrow({ where: { id: snapshot.playerId } });
    const row = result.body.data.find((item: any) => item.player.apiId === player.apiId);
    expect(row.goals).toBe(snapshot.goals! + 2);
    expect(row.assists).toBe((snapshot.assists ?? 0) + 3);
  }, 30000);

  it('serves fixture filters, details, and 404s through NestJS', async () => {
    await sync.match(fixture.fixture.id);
    const list = await request(app.getHttpServer()).get('/api/fixtures?season=2024&team=40').expect(200);
    expect(list.body.meta.total).toBe(1);
    const real = new Date(fixture.fixture.date); real.setUTCFullYear(real.getUTCFullYear() + 2);
    const visible = jest.spyOn(Date, 'now').mockReturnValue(real.getTime() + 4 * 3600000);
    const detail = await request(app.getHttpServer()).get('/api/fixtures/' + fixture.fixture.id).expect(200);
    expect(detail.body.lineups).toHaveLength(2);
    expect(detail.body.events).toHaveLength(14);
    expect(detail.body.rawPayload).toBeUndefined();
    visible.mockRestore();
    await request(app.getHttpServer()).get('/api/fixtures/999999').expect(404);
    await request(app.getHttpServer()).get('/api/health/ready').expect(200);
  }, 30000);

  it('runs a persisted due job and creates next-day reconciliation', async () => {
    await sync.seasonFixtures(2024);
    const stored = await db.client.fixture.findUniqueOrThrow({ where: { apiId: fixture.fixture.id } });
    await db.client.syncJob.create({ data: { fixtureId: stored.id, kind: 'FINAL_STATS', runAt: new Date(0) } });
    values.AUTO_SYNC_ENABLED = true;
    try { await scheduler.processDueJob(); } finally { values.AUTO_SYNC_ENABLED = false; }
    const jobs = await db.client.syncJob.findMany({ orderBy: { id: 'asc' } });
    expect(jobs.find((j) => j.kind === 'FINAL_STATS')?.status).toBe('SUCCEEDED');
    expect(jobs.find((j) => j.kind === 'RECONCILE')?.status).toBe('PENDING');
    expect(await db.client.playerMatchStat.count()).toBe(38);
  }, 30000);

  it('shows only future replay fixtures, paginates, and never returns historical results', async () => {
    await sync.match(fixture.fixture.id);
    const original = await db.client.fixture.findUniqueOrThrow({ where: { apiId: fixture.fixture.id } });
    const otherSeason = await db.client.season.create({ data: { leagueId: (await db.client.season.findUniqueOrThrow({ where: { id: original.seasonId } })).leagueId, year: 2025 } });
    const base = { seasonId: original.seasonId, homeTeamId: original.homeTeamId, awayTeamId: original.awayTeamId,
      status: 'FT', homeGoals: 9, awayGoals: 8 };
    await db.client.fixture.createMany({ data: [
      { ...base, apiId: 900001, kickoffAt: new Date('2024-10-29T14:59:59Z') },
      { ...base, apiId: 900002, kickoffAt: new Date('2024-10-29T15:00:00Z') },
      { ...base, apiId: 900003, kickoffAt: new Date('2024-10-29T15:00:01Z') },
      { ...base, apiId: 900004, kickoffAt: new Date('2024-11-01T15:00:00Z'), status: 'CANC' },
      { ...base, apiId: 900005, kickoffAt: null },
      { ...base, apiId: 900006, kickoffAt: new Date('2025-11-01T15:00:00Z'), seasonId: otherSeason.id },
    ] });
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-29T15:00:00Z'));
    try {
      const response = await request(app.getHttpServer()).get('/api/fixtures/upcoming?season=2024&team=40&limit=1').expect(200);
      expect(response.body.meta).toEqual({ total: 2, pages: 2, page: 1, limit: 1 });
      expect(response.body.clock.replayNow).toBe('2024-10-29T15:00:00.000Z');
      expect(response.body.data[0].apiId).toBe(900003);
      expect(response.body.data[0].status).toBe('UPCOMING');
      expect(response.body.data[0].replayKickoffAt).toBe('2026-10-29T15:00:01.000Z');
      const next = await request(app.getHttpServer()).get('/api/fixtures/upcoming?season=2024&team=40&limit=1&page=2').expect(200);
      expect(next.body.data[0].apiId).toBe(fixture.fixture.id);
      // This fixture has real lineups, events and scores stored in the database.
      expect(Object.keys(next.body.data[0]).sort()).toEqual([
        'apiId', 'awayTeam', 'homeTeam', 'kickoffAt', 'replayKickoffAt', 'round', 'status', 'venueName',
      ].sort());
      const missingTeam = await request(app.getHttpServer()).get('/api/fixtures/upcoming?team=42').expect(200);
      expect(missingTeam.body.meta.total).toBe(0);
    } finally { now.mockRestore(); }
  }, 30000);

  it('filters club membership by season and limits player statistics to the selected club', async () => {
    await sync.match(fixture.fixture.id);
    await sync.seasonPlayers(2024, 40);
    const clubs = await request(app.getHttpServer()).get('/api/teams?season=2024').expect(200);
    expect(clubs.body.meta.total).toBe(2);
    const liverpool = clubs.body.data.find((t: { apiId: number }) => t.apiId === 40);
    expect(liverpool.seasonMemberships[0].playerPagesImported).toBe(2);
    expect(liverpool.seasonMemberships[0].playerPagesTotal).toBe(2);
    const otherSeason = await request(app.getHttpServer()).get('/api/teams?season=2025').expect(200);
    expect(otherSeason.body.meta.total).toBe(0);
    const snapshot = await db.client.playerSeasonStat.findFirstOrThrow();
    const otherTeam = await db.client.team.findUniqueOrThrow({ where: { apiId: 52 } });
    await db.client.playerSeasonStat.create({ data: {
      ...snapshot, teamId: otherTeam.id, goals: 99, rawStatistics: snapshot.rawStatistics as Prisma.InputJsonValue,
    } });
    const players = await request(app.getHttpServer()).get('/api/players?season=2024&team=40&limit=100').expect(200);
    expect(players.body.meta.total).toBeGreaterThan(0);
    for (const player of players.body.data) {
      expect(player.seasonStats.every((s: { team: { apiId: number } }) => s.team.apiId === 40)).toBe(true);
    }
    const transfer = await request(app.getHttpServer()).get('/api/players?season=2024&team=52&limit=100').expect(200);
    expect(transfer.body.data.every((p: { seasonStats: Array<{ team: { apiId: number } }> }) =>
      p.seasonStats.every((s) => s.team.apiId === 52))).toBe(true);
    await request(app.getHttpServer()).get('/api/players?team=-1').expect(400);
  }, 30000);

  it('computes replay totals from finished matches, excludes future snapshots and club transfers', async () => {
    await sync.match(fixture.fixture.id);
    const stored = await db.client.fixture.findUniqueOrThrow({ where: { apiId: fixture.fixture.id } });
    const salah = await db.client.player.findUniqueOrThrow({ where: { apiId: 306 } });
    await db.client.playerSeasonStat.create({ data: { seasonId: stored.seasonId, teamId: stored.homeTeamId,
      playerId: salah.id, goals: 999, assists: 999, rawStatistics: {}, syncedAt: new Date() } });
    const future = await db.client.fixture.create({ data: { apiId: 900099, seasonId: stored.seasonId,
      homeTeamId: stored.homeTeamId, awayTeamId: stored.awayTeamId,
      kickoffAt: new Date(stored.kickoffAt!.getTime() + 48 * 3600000), status: 'FT', playerStatsSyncedAt: new Date() } });
    await db.client.playerMatchStat.create({ data: { fixtureId: future.id, teamId: stored.homeTeamId,
      playerId: salah.id, minutes: 90, goals: 50, assists: 50, rawStatistics: {}, syncedAt: new Date() } });
    const now = jest.spyOn(Date, 'now');
    try {
      // The real year is 2027, while the original fixture belongs to May 2025.
      const realKickoff = new Date(stored.kickoffAt!);
      realKickoff.setUTCFullYear(realKickoff.getUTCFullYear() + 2);
      now.mockReturnValue(realKickoff.getTime() + 3600000);
      const inProgress = await request(app.getHttpServer()).get('/api/players/replay?team=40').expect(200);
      expect(inProgress.body.meta.total).toBe(0);
      now.mockReturnValue(realKickoff.getTime() + 4 * 3600000);
      const result = await request(app.getHttpServer()).get('/api/players/replay?team=40&limit=100').expect(200);
      expect(result.body.coverage).toMatchObject({ expectedMatches: 1, importedMatches: 1, complete: true });
      const player = result.body.data.find((p: any) => p.apiId === 306);
      expect(player.seasonStats).toHaveLength(1);
      expect(player.seasonStats[0]).toMatchObject({ goals: 1, assists: 0, appearances: 1, position: 'Midfielder', team: { apiId: 40 } });
      expect(result.body.data.every((p: any) => p.seasonStats.every((s: any) => s.team.apiId === 40))).toBe(true);
      expect(JSON.stringify(result.body)).not.toContain('999');
      const searched = await request(app.getHttpServer()).get('/api/players/replay?team=40&search=Salah&limit=1').expect(200);
      expect(searched.body.meta.total).toBe(1);
      await db.client.fixture.update({ where: { id: stored.id }, data: { playerStatsSyncedAt: null } });
      const partial = await request(app.getHttpServer()).get('/api/players/replay?team=40').expect(200);
      expect(partial.body.coverage).toMatchObject({ expectedMatches: 1, importedMatches: 0, complete: false });
      expect(partial.body.data).toEqual([]);
    } finally { now.mockRestore(); }
  }, 30000);

  it('persists a private XI, permits edits, and enforces the seven-day window on the server', async () => {
    await sync.match(fixture.fixture.id);
    const past = await db.client.fixture.findUniqueOrThrow({ where: { apiId: fixture.fixture.id } });
    await db.client.fixture.update({ where: { id: past.id }, data: { kickoffAt: new Date('2025-05-18T15:00:00Z') } });
    const match = await db.client.fixture.create({ data: { apiId: 900110, seasonId: past.seasonId,
      homeTeamId: past.homeTeamId, awayTeamId: past.awayTeamId, kickoffAt: new Date('2025-05-25T15:00:00Z'),
      status: 'FT', homeGoals: 7, awayGoals: 9 } });
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2027-05-23T15:00:00Z'));
    const authA = await request(app.getHttpServer()).post('/api/auth/register').send({ email: 'a@example.com', displayName: 'Player A', password: 'test-password-123' }).expect(201);
    const authB = await request(app.getHttpServer()).post('/api/auth/register').send({ email: 'b@example.com', displayName: 'Player B', password: 'test-password-123' }).expect(201);
    const tokenA = authA.body.token, tokenB = authB.body.token;
    try {
      const context = await request(app.getHttpServer()).get('/api/predictions/fixtures/900110?team=40').expect(200);
      expect(context.body.window.canPredict).toBe(true);
      expect(context.body.fixture.homeGoals).toBeUndefined();
      expect(context.body.fixture.lineups).toBeUndefined();
      const roster = context.body.players;
      const keeper = roster.find((p: any) => p.seasonStats[0].position === 'Goalkeeper');
      const outfield = roster.filter((p: any) => p.seasonStats[0].position !== 'Goalkeeper').slice(0, 10);
      const picks = [keeper.apiId, ...outfield.map((p: any) => p.apiId)];
      const body = { team: 40, formation: '4-3-3', playerApiIds: picks };
      await request(app.getHttpServer()).put('/api/predictions/900110').set('Authorization', 'Bearer ' + tokenA).send(body).expect(200);
      const own = await request(app.getHttpServer()).get('/api/predictions/900110?team=40').set('Authorization', 'Bearer ' + tokenA).expect(200);
      expect(own.body.prediction.playerApiIds).toEqual(picks);
      const other = await request(app.getHttpServer()).get('/api/predictions/900110?team=40').set('Authorization', 'Bearer ' + tokenB).expect(200);
      expect(other.body.prediction).toBeNull();
      await request(app.getHttpServer()).put('/api/predictions/900110').set('Authorization', 'Bearer ' + tokenA)
        .send({ ...body, formation: '4-4-2' }).expect(200);
      expect(await db.client.lineupPrediction.count({ where: { fixtureId: match.id } })).toBe(1);
      expect(await db.client.predictionPick.count()).toBe(11);
      await request(app.getHttpServer()).put('/api/predictions/900110').set('Authorization', 'Bearer ' + tokenA)
        .send({ ...body, playerApiIds: [...picks.slice(0, 10), 999999999] }).expect(400);
      await request(app.getHttpServer()).put('/api/predictions/900110').set('Authorization', 'Bearer ' + tokenA)
        .send({ ...body, playerApiIds: [picks[1], picks[0], ...picks.slice(2)] }).expect(400);
      await request(app.getHttpServer()).put('/api/predictions/900110').set('Authorization', 'Bearer ' + tokenA)
        .send({ ...body, team: 42 }).expect(400);
      now.mockReturnValue(Date.parse('2027-05-17T15:00:00Z'));
      await request(app.getHttpServer()).put('/api/predictions/900110').set('Authorization', 'Bearer ' + tokenA).send(body).expect(403);
      now.mockReturnValue(Date.parse('2027-05-25T15:00:00Z'));
      await request(app.getHttpServer()).put('/api/predictions/900110').set('Authorization', 'Bearer ' + tokenA).send(body).expect(403);
      const locked = await request(app.getHttpServer()).get('/api/predictions/900110?team=40').set('Authorization', 'Bearer ' + tokenA).expect(200);
      expect(locked.body.prediction.formation).toBe('4-4-2');
    } finally { now.mockRestore(); }
  }, 30000);

  it('supports registration, cross-device login, expiry and logout without exposing password hashes', async () => {
    const body = { email: ' PLAYER@EXAMPLE.COM ', displayName: 'Player One', password: 'test-password-123' };
    const registered = await request(app.getHttpServer()).post('/api/auth/register').send(body).expect(201);
    expect(registered.body.user.email).toBe('player@example.com');
    expect(registered.body.user.passwordHash).toBeUndefined();
    const stored = await db.client.user.findUniqueOrThrow({ where: { email: 'player@example.com' } });
    expect(stored.passwordHash).not.toBe(body.password);
    expect(await db.client.authSession.findFirstOrThrow()).not.toHaveProperty('token');
    await request(app.getHttpServer()).post('/api/auth/register').send(body).expect(409);
    await request(app.getHttpServer()).post('/api/auth/login').send({ email: body.email, password: 'wrong-password' }).expect(401);
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: body.email, password: body.password }).expect(201);
    expect(login.body.token).not.toBe(registered.body.token);
    const me = await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', 'Bearer ' + login.body.token).expect(200);
    expect(me.body.user.id).toBe(registered.body.user.id);
    await request(app.getHttpServer()).post('/api/auth/logout').set('Authorization', 'Bearer ' + login.body.token).expect(201);
    await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', 'Bearer ' + login.body.token).expect(401);
    await db.client.authSession.updateMany({ where: { userId: stored.id }, data: { expiresAt: new Date(0) } });
    await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', 'Bearer ' + registered.body.token).expect(401);
    await request(app.getHttpServer()).get('/api/me/scores').expect(401);
  }, 30000);

  it('claims only the current browser guest predictions when an account is created', async () => {
    await sync.match(fixture.fixture.id);
    const match = await db.client.fixture.findUniqueOrThrow({ where: { apiId: fixture.fixture.id } });
    const guest = 'a'.repeat(48);
    const submission = new Date('2025-05-18T15:00:00Z');
    const prediction = await db.client.lineupPrediction.create({ data: { fixtureId: match.id, teamId: match.homeTeamId,
      ownerHash: tokenHash(guest), formation: '4-3-3', submittedReplayAt: submission } });
    const auth = await request(app.getHttpServer()).post('/api/auth/register').set('x-guest-token', guest)
      .send({ email: 'guest@example.com', displayName: 'Guest Player', password: 'test-password-123' }).expect(201);
    const claimed = await db.client.lineupPrediction.findUniqueOrThrow({ where: { id: prediction.id } });
    expect(claimed.userId).toBe(auth.body.user.id);
    expect(claimed.submittedReplayAt).toEqual(submission);
  }, 30000);

  it('keeps stored historical lineups and scores private until the replay reveal time', async () => {
    await sync.match(fixture.fixture.id);
    const kickoff = new Date(fixture.fixture.date); kickoff.setUTCFullYear(kickoff.getUTCFullYear() + 2);
    const now = jest.spyOn(Date, 'now').mockReturnValue(kickoff.getTime() - 3600000);
    try {
      const hidden = await request(app.getHttpServer()).get('/api/fixtures/' + fixture.fixture.id).expect(200);
      expect(hidden.body.lineups).toEqual([]); expect(hidden.body.playerStats).toEqual([]);
      expect(hidden.body.homeGoals).toBeNull(); expect(hidden.body.awayGoals).toBeNull();
      const list = await request(app.getHttpServer()).get('/api/fixtures?team=40').expect(200);
      expect(list.body.data[0].homeGoals).toBeNull();
      now.mockReturnValue(kickoff.getTime() + 3 * 3600000);
      const visible = await request(app.getHttpServer()).get('/api/fixtures/' + fixture.fixture.id).expect(200);
      expect(visible.body.lineups).toHaveLength(2); expect(visible.body.homeGoals).toBe(1);
    } finally { now.mockRestore(); }
  }, 30000);

  it('scores after three hours, retries incomplete lineups, isolates accounts and groups points by club', async () => {
    await sync.match(fixture.fixture.id);
    const old = await db.client.fixture.findUniqueOrThrow({ where: { apiId: fixture.fixture.id } });
    await db.client.fixture.update({ where: { id: old.id }, data: { kickoffAt: new Date('2025-05-18T15:00:00Z') } });
    const match = await db.client.fixture.create({ data: { apiId: 900120, seasonId: old.seasonId, homeTeamId: old.homeTeamId,
      awayTeamId: old.awayTeamId, kickoffAt: new Date('2025-05-25T15:00:00Z'), status: 'FT' } });
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2027-05-23T15:00:00Z'));
    try {
      const register = async (email: string) => (await request(app.getHttpServer()).post('/api/auth/register')
        .send({ email, displayName: email.split('@')[0], password: 'test-password-123' }).expect(201)).body;
      const a = await register('scorer-a@example.com'), b = await register('scorer-b@example.com');
      const lineups = sample('lineups');
      const homeActual = lineups.find((l: any) => l.team.id === 40).startXI.map((p: any) => p.player.id);
      const awayActual = lineups.find((l: any) => l.team.id === 52).startXI.map((p: any) => p.player.id);
      const getRoster = async (team: number) => (await request(app.getHttpServer()).get(`/api/predictions/fixtures/900120?team=${team}`).expect(200)).body.players;
      const home = await getRoster(40), away = await getRoster(52);
      const homeKeeper = home.find((p: any) => p.seasonStats[0].position === 'Goalkeeper' && homeActual.includes(p.apiId)).apiId;
      const awayKeeper = away.find((p: any) => p.seasonStats[0].position === 'Goalkeeper' && awayActual.includes(p.apiId)).apiId;
      const aHome = [homeKeeper, ...homeActual.filter((id: number) => id !== homeKeeper).reverse()];
      const awayBench = away.filter((p: any) => p.seasonStats[0].position !== 'Goalkeeper' && !awayActual.includes(p.apiId)).slice(0, 5).map((p: any) => p.apiId);
      expect(awayBench).toHaveLength(5);
      const aAway = [awayKeeper, ...awayActual.filter((id: number) => id !== awayKeeper).slice(0, 5), ...awayBench];
      const bHome = [homeKeeper, ...home.filter((p: any) => p.seasonStats[0].position !== 'Goalkeeper').slice(0, 10).map((p: any) => p.apiId)];
      const save = async (token: string, team: number, ids: number[]) => request(app.getHttpServer()).put('/api/predictions/900120')
        .set('Authorization', 'Bearer ' + token).send({ team, formation: '4-3-3', playerApiIds: ids }).expect(200);
      await save(a.token, 40, aHome); await save(a.token, 52, aAway); await save(b.token, 40, bHome);
      const saveScore = async (token: string, team: number, homeGoals: number, awayGoals: number) => request(app.getHttpServer())
        .put('/api/predictions/900120/score').set('Authorization', 'Bearer ' + token).send({ team, homeGoals, awayGoals }).expect(200);
      await saveScore(a.token, 40, 1, 1); await saveScore(a.token, 52, 2, 2); await saveScore(b.token, 40, 2, 0);
      const originalApi = api.get.getMockImplementation()!;
      api.get.mockImplementation(async (endpoint: string, params: Record<string, number>) => {
        if (endpoint === '/fixtures' && params.id === 900120) return { response: [{ ...fixture,
          fixture: { ...fixture.fixture, id: 900120, date: '2025-05-25T15:00:00Z' },
          lineups: partialLineups ? [] : sample('lineups') }] };
        return originalApi(endpoint, params);
      });
      const newDevice = await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'scorer-a@example.com', password: 'test-password-123' }).expect(201);
      const restored = await request(app.getHttpServer()).get('/api/predictions/900120?team=40').set('Authorization', 'Bearer ' + newDevice.body.token).expect(200);
      expect(restored.body.prediction.playerApiIds).toEqual(aHome);
      const worker = app.get(PredictionScoringService);
      values.PREDICTION_SCORING_ENABLED = true; api.get.mockClear();
      now.mockReturnValue(Date.parse('2027-05-25T17:59:59Z'));
      await worker.processDueJob(); expect(api.get).not.toHaveBeenCalled();
      expect(await db.client.lineupPrediction.count({ where: { score: { not: null } } })).toBe(0);
      now.mockReturnValue(Date.parse('2027-05-25T18:00:00Z'));
      partialLineups = true; await worker.processDueJob();
      expect(await db.client.lineupPrediction.count({ where: { score: { not: null } } })).toBe(0);
      // Final scores can be awarded while incomplete XIs wait for a retry.
      expect(await db.client.scorePrediction.count({ where: { points: { not: null } } })).toBe(3);
      expect((await db.client.syncJob.findUniqueOrThrow({ where: { fixtureId_kind: { fixtureId: match.id, kind: 'LINEUPS' } } })).status).toBe('PENDING');
      partialLineups = false; now.mockReturnValue(Date.parse('2027-05-25T18:06:00Z'));
      await worker.processDueJob();
      const result = await request(app.getHttpServer()).get('/api/me/scores').set('Authorization', 'Bearer ' + a.token).expect(200);
      expect(result.body.teams.find((t: any) => t.team.apiId === 40).points).toBe(11);
      expect(result.body.teams.find((t: any) => t.team.apiId === 52).points).toBe(6);
      expect(result.body.teams.find((t: any) => t.team.apiId === 40).scorePoints).toBe(3);
      expect(result.body.teams.find((t: any) => t.team.apiId === 52).scorePoints).toBe(1);
      expect(result.body.scorePredictions).toHaveLength(2);
      expect(result.body.scorePredictions.every((p: any) => p.actualHomeGoals === 1 && p.actualAwayGoals === 1)).toBe(true);
      expect(result.body.predictions).toHaveLength(2);
      expect(result.body.predictions.find((p: any) => p.team.apiId === 40).players.every((p: any) => p.correct)).toBe(true);
      const bResult = await request(app.getHttpServer()).get('/api/me/scores').set('Authorization', 'Bearer ' + b.token).expect(200);
      expect(bResult.body.teams).toHaveLength(1);
      expect(bResult.body.teams[0].points).toBe(bHome.filter((id: number) => homeActual.includes(id)).length);
      expect(bResult.body.teams[0].scorePoints).toBe(0);
      const calls = api.get.mock.calls.length; await worker.processDueJob(); expect(api.get.mock.calls).toHaveLength(calls);
      const repeat = await request(app.getHttpServer()).get('/api/me/scores').set('Authorization', 'Bearer ' + a.token).expect(200);
      expect(repeat.body.teams.map((t: any) => t.points)).toEqual(result.body.teams.map((t: any) => t.points));
      expect(repeat.body.teams.map((t: any) => t.scorePoints)).toEqual(result.body.teams.map((t: any) => t.scorePoints));
      expect(await db.client.lineupPlayer.count({ where: { fixtureId: match.id, isStarter: true } })).toBe(22);
    } finally { values.PREDICTION_SCORING_ENABLED = false; now.mockRestore(); }
  }, 30000);

  it('allows score-only predictions, validates score pairs, locks at kickoff and waits for a final result', async () => {
    await sync.match(fixture.fixture.id);
    const stored = await db.client.fixture.findUniqueOrThrow({ where: { apiId: fixture.fixture.id } });
    const match = await db.client.fixture.create({ data: { apiId: 900130, seasonId: stored.seasonId,
      homeTeamId: stored.homeTeamId, awayTeamId: stored.awayTeamId, kickoffAt: new Date('2025-05-25T15:00:00Z'), status: 'FT' } });
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2027-05-23T15:00:00Z'));
    try {
      const auth = (await request(app.getHttpServer()).post('/api/auth/register').send({ email: 'score-only@example.com', displayName: 'Score Only', password: 'test-password-123' }).expect(201)).body;
      const put = (body: Record<string, unknown>) => request(app.getHttpServer()).put('/api/predictions/900130/score').set('Authorization', 'Bearer ' + auth.token).send(body);
      await request(app.getHttpServer()).put('/api/predictions/900130/score').send({ team: 40, homeGoals: 1, awayGoals: 1 }).expect(401);
      for (const body of [{ team: 40, homeGoals: -1, awayGoals: 0 }, { team: 40, homeGoals: 1.5, awayGoals: 0 },
        { team: 40, homeGoals: 100, awayGoals: 0 }, { team: 40, homeGoals: 1 }, { team: 40, homeGoals: null, awayGoals: 0 },
        { team: 42, homeGoals: 1, awayGoals: 1 }]) await put(body).expect(400);
      await put({ team: 40, homeGoals: 0, awayGoals: 0 }).expect(200);
      await put({ team: 40, homeGoals: 2, awayGoals: 2 }).expect(200);
      expect(await db.client.lineupPrediction.count({ where: { fixtureId: match.id } })).toBe(0);
      expect(await db.client.scorePrediction.count({ where: { fixtureId: match.id } })).toBe(1);
      const read = await request(app.getHttpServer()).get('/api/predictions/900130/score?team=40').set('Authorization', 'Bearer ' + auth.token).expect(200);
      expect(read.body.prediction).toMatchObject({ homeGoals: 2, awayGoals: 2, points: null });
      const other = (await request(app.getHttpServer()).post('/api/auth/register').send({ email: 'score-other@example.com', displayName: 'Other', password: 'test-password-123' }).expect(201)).body;
      const hidden = await request(app.getHttpServer()).get('/api/predictions/900130/score?team=40').set('Authorization', 'Bearer ' + other.token).expect(200);
      expect(hidden.body.prediction).toBeNull();
      now.mockReturnValue(Date.parse('2027-05-25T15:00:00Z')); await put({ team: 40, homeGoals: 1, awayGoals: 1 }).expect(403);
      const worker = app.get(PredictionScoringService);
      values.PREDICTION_SCORING_ENABLED = true;
      let final = false;
      api.get.mockImplementation(async () => ({ response: [{ ...fixture,
        fixture: { ...fixture.fixture, id: 900130, status: { short: final ? 'FT' : '2H' } },
        goals: final ? { home: 1, away: 1 } : { home: null, away: null }, lineups: [] }] }));
      now.mockReturnValue(Date.parse('2027-05-25T18:00:00Z')); await worker.processDueJob();
      expect((await db.client.scorePrediction.findFirstOrThrow({ where: { fixtureId: match.id } })).points).toBeNull();
      final = true; now.mockReturnValue(Date.parse('2027-05-25T18:06:00Z')); await worker.processDueJob();
      expect((await db.client.scorePrediction.findFirstOrThrow({ where: { fixtureId: match.id } })).points).toBe(1);
      const scores = await request(app.getHttpServer()).get('/api/me/scores').set('Authorization', 'Bearer ' + auth.token).expect(200);
      expect(scores.body.teams[0]).toMatchObject({ points: 0, predictions: 0, scorePoints: 1, scorePredictions: 1, scoreScoredMatches: 1, scorePendingMatches: 0 });
      const calls = api.get.mock.calls.length; await worker.processDueJob(); expect(api.get.mock.calls).toHaveLength(calls);
    } finally { values.PREDICTION_SCORING_ENABLED = false; now.mockRestore(); }
  }, 30000);
  it('protects demo controls, validates the season and never accepts clock overrides on public APIs', async () => {
    await request(app.getHttpServer()).get('/api/demo').expect(404);
    values.DEMO_CONTROLS_ENABLED = true; values.DEMO_CONTROL_TOKEN = 'demo-integration-token-32-characters';
    await request(app.getHttpServer()).put('/api/demo').send({ replayAt: '2024-11-02T18:00:00Z' }).expect(401);
    for (const body of [{}, { replayAt: 'invalid' }, { replayAt: '2026-11-02T18:00:00Z' }, { replayAt: '2024-11-02' }, { replayAt: '2024-11-02T18:00:00' }, { replayAt: null, points: 100 }]) {
      await request(app.getHttpServer()).put('/api/demo').set('Authorization', 'Bearer ' + values.DEMO_CONTROL_TOKEN).send(body).expect(400);
    }
    await request(app.getHttpServer()).get('/api/fixtures/upcoming?now=2024-11-02T18:00:00Z').expect(400);
    expect(replayClock().mode).toBe('LIVE');
  });

  it('advances the shared clock through kickoff and scoring, persists it and prevents edits after rewind', async () => {
    await sync.match(fixture.fixture.id);
    const old = await db.client.fixture.findUniqueOrThrow({ where: { apiId: fixture.fixture.id } });
    await db.client.fixture.update({ where: { id: old.id }, data: { kickoffAt: new Date('2025-05-18T15:00:00Z') } });
    const match = await db.client.fixture.create({ data: { apiId: 900140, seasonId: old.seasonId, homeTeamId: old.homeTeamId, awayTeamId: old.awayTeamId, kickoffAt: new Date('2025-05-25T15:00:00Z'), status: 'FT' } });
    values.DEMO_CONTROLS_ENABLED = true; values.DEMO_CONTROL_TOKEN = 'demo-integration-token-32-characters'; values.PREDICTION_SCORING_ENABLED = true;
    const set = (replayAt: string | null) => request(app.getHttpServer()).put('/api/demo').set('Authorization', 'Bearer ' + values.DEMO_CONTROL_TOKEN).send({ replayAt }).expect(200);
    try {
      await set('2025-05-24T15:00:00Z');
      const savedClock = replayClock(); await app.get(DemoService).onModuleInit(); expect(replayClock().replayNow).toBe(savedClock.replayNow);
      const auth = (await request(app.getHttpServer()).post('/api/auth/register').send({ email: 'demo@example.com', displayName: 'Demo Player', password: 'test-password-123' }).expect(201)).body;
      const putScore = () => request(app.getHttpServer()).put('/api/predictions/900140/score').set('Authorization', 'Bearer ' + auth.token).send({ team: 40, homeGoals: 1, awayGoals: 1 });
      const context = (await request(app.getHttpServer()).get('/api/predictions/fixtures/900140?team=40').expect(200)).body;
      expect(context.window.canPredict).toBe(true);
      const actual = sample('lineups').find((l: any) => l.team.id === 40).startXI.map((p: any) => p.player.id);
      const keeper = context.players.find((p: any) => p.seasonStats[0].position === 'Goalkeeper' && actual.includes(p.apiId)).apiId;
      const ids = [keeper, ...actual.filter((id: number) => id !== keeper)];
      const putXi = () => request(app.getHttpServer()).put('/api/predictions/900140').set('Authorization', 'Bearer ' + auth.token).send({ team: 40, formation: '4-3-3', playerApiIds: ids });
      await putXi().expect(200); await putScore().expect(200);
      const earlier = await db.client.fixture.create({ data: { apiId: 900141, seasonId: old.seasonId, homeTeamId: old.homeTeamId, awayTeamId: old.awayTeamId, kickoffAt: new Date('2025-05-25T13:00:00Z'), status: 'FT' } });
      await request(app.getHttpServer()).put('/api/predictions/900141/score').set('Authorization', 'Bearer ' + auth.token).send({ team: 40, homeGoals: 1, awayGoals: 1 }).expect(200);
      await set('2025-05-25T15:00:00Z'); await putScore().expect(403); await putXi().expect(403);
      const upcoming = (await request(app.getHttpServer()).get('/api/fixtures/upcoming').expect(200)).body;
      expect(upcoming.data.some((f: any) => f.apiId === 900140)).toBe(false);
      api.get.mockClear(); await app.get(PredictionScoringService).processDueJob(); expect(api.get).not.toHaveBeenCalled();
      api.get.mockResolvedValue({ response: [{ ...fixture, fixture: { ...fixture.fixture, id: 900140 }, lineups: sample('lineups') }] });
      await set('2025-05-25T18:00:00Z');
      await request(app.getHttpServer()).post('/api/demo/process').set('Authorization', 'Bearer ' + values.DEMO_CONTROL_TOKEN).send({ fixture: 900140 }).expect(201);
      expect((await db.client.scorePrediction.findFirstOrThrow({ where: { fixtureId: earlier.id } })).points).toBeNull();
      const scores = (await request(app.getHttpServer()).get('/api/me/scores').set('Authorization', 'Bearer ' + auth.token).expect(200)).body;
      expect(scores.teams[0]).toMatchObject({ points: 11, scorePoints: 3 });
      const calls = api.get.mock.calls.length;
      await set('2025-05-24T15:00:00Z'); await putScore().expect(403); await putXi().expect(403);
      await set('2025-05-25T18:00:00Z'); await app.get(PredictionScoringService).processDueJob(900140); expect(api.get.mock.calls).toHaveLength(calls);
      expect((await db.client.scorePrediction.findFirstOrThrow({ where: { fixtureId: match.id } })).points).toBe(3);
      await set(null); expect(replayClock().mode).toBe('LIVE');
      expect((await db.client.replaySetting.findUniqueOrThrow({ where: { id: 1 } })).replayAt).toBeNull();
    } finally { values.PREDICTION_SCORING_ENABLED = false; values.DEMO_CONTROLS_ENABLED = false; setReplayOverride(null, 0); }
  }, 30000);
});
