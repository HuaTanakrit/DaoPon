require('dotenv').config({ quiet: true });
const fs = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('pg');

const season = 2024;
const cacheFile = path.resolve(__dirname, '../.cache/football', String(season), 'fixtures.json');

async function loadFixtures() {
  let payload;
  try { payload = JSON.parse(await fs.readFile(cacheFile, 'utf8')); } catch {}
  const valid = (body) => body && !Object.keys(body.errors || {}).length
    && Array.isArray(body.response) && body.response.length === 380
    && new Set(body.response.map((row) => row.fixture?.id)).size === 380
    && body.response.every((row) => Number.isInteger(row.fixture?.id)
      && row.league?.id === 39 && row.league?.season === season
      && row.teams?.home?.id && row.teams?.away?.id
      && row.teams.home.id !== row.teams.away.id
      && row.fixture.date && Number.isFinite(Date.parse(row.fixture.date)));
  if (valid(payload)) return { rows: payload.response, source: 'cache' };
  if (!process.env.API_FOOTBALL_KEY) throw new Error('MISSING_API_KEY');
  const response = await fetch(`https://v3.football.api-sports.io/fixtures?league=39&season=${season}`, {
    headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY }, signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`UPSTREAM_HTTP_${response.status}`);
  payload = await response.json();
  if (!valid(payload)) throw new Error('INCOMPLETE_OR_UNSUPPORTED_SEASON');
  await fs.mkdir(path.dirname(cacheFile), { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify(payload));
  console.log('Provider requests: 1; daily remaining:', response.headers.get('x-ratelimit-requests-remaining'));
  return { rows: payload.response, source: 'api' };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('MISSING_DATABASE_URL');
  const { rows, source } = await loadFixtures();
  const records = rows.map((r) => ({
    apiId: r.fixture.id, homeApiId: r.teams.home.id, awayApiId: r.teams.away.id,
    kickoffAt: r.fixture.date, round: r.league.round, status: r.fixture.status.short,
    elapsed: r.fixture.status.elapsed, homeGoals: r.goals.home, awayGoals: r.goals.away,
    venueApiId: r.fixture.venue?.id, venueName: r.fixture.venue?.name,
    venueCity: r.fixture.venue?.city, referee: r.fixture.referee, rawPayload: r,
  }));
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
  try {
    await db.connect();
    await db.query('BEGIN');
    const seasonRow = await db.query('SELECT s.id FROM seasons s JOIN leagues l ON l.id=s."leagueId" WHERE s.year=$1 AND l."apiId"=39', [season]);
    if (seasonRow.rowCount !== 1) throw new Error('SEED_TEAMS_FIRST');
    const seasonId = seasonRow.rows[0].id;
    const result = await db.query(`INSERT INTO fixtures
      ("apiId", "seasonId", "homeTeamId", "awayTeamId", "kickoffAt", round, status, elapsed,
       "homeGoals", "awayGoals", "venueApiId", "venueName", "venueCity", referee, "rawPayload", "fixtureSyncedAt", "updatedAt")
      SELECT r."apiId", $1, h.id, a.id, r."kickoffAt", r.round, r.status, r.elapsed,
        r."homeGoals", r."awayGoals", r."venueApiId", r."venueName", r."venueCity", r.referee, r."rawPayload", NOW(), NOW()
      FROM jsonb_to_recordset($2::jsonb) AS r("apiId" int, "homeApiId" int, "awayApiId" int,
        "kickoffAt" timestamptz, round text, status text, elapsed int, "homeGoals" int, "awayGoals" int,
        "venueApiId" int, "venueName" text, "venueCity" text, referee text, "rawPayload" jsonb)
      JOIN teams h ON h."apiId"=r."homeApiId" JOIN teams a ON a."apiId"=r."awayApiId"
      ON CONFLICT ("apiId") DO UPDATE SET "kickoffAt"=EXCLUDED."kickoffAt", round=EXCLUDED.round,
        status=EXCLUDED.status, elapsed=EXCLUDED.elapsed, "homeGoals"=EXCLUDED."homeGoals", "awayGoals"=EXCLUDED."awayGoals",
        "venueApiId"=EXCLUDED."venueApiId", "venueName"=EXCLUDED."venueName", "venueCity"=EXCLUDED."venueCity",
        referee=EXCLUDED.referee, "rawPayload"=EXCLUDED."rawPayload", "fixtureSyncedAt"=NOW(), "updatedAt"=NOW()`,
    [seasonId, JSON.stringify(records)]);
    if (result.rowCount !== 380) throw new Error('MISSING_FIXTURE_TEAMS');
    await db.query('UPDATE seasons SET "fixturesSyncedAt"=NOW() WHERE id=$1', [seasonId]);
    await db.query('COMMIT');
    console.log(JSON.stringify({ season, fixtures: result.rowCount, source }));
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { await db.end().catch(() => undefined); }
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'failed', code: /^[A-Z_0-9]+$/.test(error.message) ? error.message : 'FIXTURE_IMPORT_FAILED' }));
  process.exitCode = 1;
});
