require('dotenv').config({ quiet: true });
const fs = require('node:fs/promises');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { Client } = require('pg');

const season = 2024;
const cache = path.resolve(__dirname, '../.cache/football', String(season));
let lastRequest = 0;
let remaining = null;

async function get(name, endpoint) {
  const file = path.join(cache, `${name}.json`);
  try {
    const existing = JSON.parse(await fs.readFile(file, 'utf8'));
    if (Array.isArray(existing.response) && existing.response.length && !Object.keys(existing.errors || {}).length) return existing;
  } catch {}
  if (remaining !== null && remaining <= 5) throw new Error('QUOTA_RESERVE_REACHED');
  await delay(Math.max(0, 6500 - (Date.now() - lastRequest)));
  lastRequest = Date.now();
  const response = await fetch(`https://v3.football.api-sports.io${endpoint}`, {
    headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY }, signal: AbortSignal.timeout(25000),
  });
  const quota = response.headers.get('x-ratelimit-requests-remaining');
  if (quota !== null) remaining = Number(quota);
  if (!response.ok) throw new Error(`UPSTREAM_HTTP_${response.status}`);
  const body = await response.json();
  if (Object.keys(body.errors || {}).length || !body.response?.length) throw new Error('UPSTREAM_DATA_UNAVAILABLE');
  await fs.writeFile(file, JSON.stringify(body));
  return body;
}

async function main() {
  if (!process.env.DATABASE_URL || !process.env.API_FOOTBALL_KEY) throw new Error('MISSING_SERVER_CONFIGURATION');
  await fs.mkdir(cache, { recursive: true });
  const teamRows = (await get('teams', `/teams?league=39&season=${season}`)).response;
  if (teamRows.length !== 20) throw new Error('EXPECTED_TWENTY_CLUBS');
  const all = [];
  const partialTeams = [];
  const pageCoverage = [];
  console.log(`Loading player statistics by club for ${teamRows.length} teams in ${season}/25.`);
  for (const { team } of teamRows) {
    const first = await get(`team-${team.id}-page-1`, `/players?league=39&season=${season}&team=${team.id}&page=1`);
    if (!first.paging || first.paging.total > 20) throw new Error('INVALID_PLAYER_PAGINATION');
    all.push(...first.response);
    // Free subscriptions explicitly allow only pages 1–3. Requesting by club
    // avoids the 57-page league-wide query and stays within that entitlement.
    if (first.paging.total > 3) partialTeams.push({ apiId: team.id, name: team.name, pagesAvailable: first.paging.total, pagesImported: 3 });
    pageCoverage.push({ apiId: team.id, total: first.paging.total, imported: Math.min(3, first.paging.total) });
    for (let page = 2; page <= Math.min(3, first.paging.total); page++) {
      const result = await get(`team-${team.id}-page-${page}`, `/players?league=39&season=${season}&team=${team.id}&page=${page}`);
      if (result.paging?.current !== page) throw new Error('PAGINATION_MISMATCH');
      all.push(...result.response);
    }
    console.log(`Club ready: ${team.name} (${Math.min(3, first.paging.total)} pages); daily quota remaining: ${remaining ?? 'cached'}`);
  }
  const clubIds = new Set(teamRows.map((r) => r.team.id));
  const profiles = new Map();
  const snapshots = new Map();
  const number = (value) => value == null || value === '' || !Number.isFinite(Number.parseFloat(value)) ? null : Number.parseFloat(value);
  for (const entry of all) {
    const p = entry.player;
    const validStats = entry.statistics.filter((s) => s.league?.id === 39 && s.league.season === season && clubIds.has(s.team?.id));
    if (!validStats.length) continue;
    profiles.set(p.id, { apiId: p.id, name: p.name, firstName: p.firstname ?? null, lastName: p.lastname ?? null,
      birthDate: p.birth?.date ?? null, nationality: p.nationality ?? null,
      heightCm: number(p.height), weightKg: number(p.weight), photoUrl: p.photo ?? null });
    for (const s of validStats) snapshots.set(`${p.id}:${s.team.id}`, {
      playerApiId: p.id, teamApiId: s.team.id, appearances: s.games.appearences ?? null,
      starts: s.games.lineups ?? null, minutes: s.games.minutes ?? null, position: s.games.position ?? null,
      rating: number(s.games.rating), goals: s.goals.total ?? null, assists: s.goals.assists ?? null,
      goalsConceded: s.goals.conceded ?? null, saves: s.goals.saves ?? null,
      yellowCards: s.cards?.yellow ?? null, yellowRedCards: s.cards?.yellowred ?? null, redCards: s.cards?.red ?? null,
      rawStatistics: s,
    });
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
  try {
    await client.connect();
    await client.query('BEGIN');
    const league = (await client.query(`INSERT INTO leagues ("apiId", name, country, "updatedAt") VALUES (39, 'Premier League', 'England', NOW()) ON CONFLICT ("apiId") DO UPDATE SET name=EXCLUDED.name RETURNING id`)).rows[0].id;
    const seasonId = (await client.query(`INSERT INTO seasons ("leagueId", year, "accessVerifiedAt") VALUES ($1, $2, NOW()) ON CONFLICT ("leagueId",year) DO UPDATE SET "accessVerifiedAt"=NOW() RETURNING id`, [league, season])).rows[0].id;
    await client.query(`INSERT INTO teams ("apiId",name,"logoUrl","updatedAt")
      SELECT t."apiId",t.name,t."logoUrl",NOW() FROM jsonb_to_recordset($1::jsonb) AS t("apiId" int,name text,"logoUrl" text)
      ON CONFLICT ("apiId") DO UPDATE SET name=EXCLUDED.name,"logoUrl"=EXCLUDED."logoUrl","updatedAt"=NOW()`,
    [JSON.stringify(teamRows.map((r) => ({ apiId: r.team.id, name: r.team.name, logoUrl: r.team.logo })))]);
    await client.query(`INSERT INTO season_teams ("seasonId","teamId","syncedAt") SELECT $1,t.id,NOW() FROM teams t WHERE t."apiId"=ANY($2::int[])
      ON CONFLICT ("seasonId","teamId") DO UPDATE SET "syncedAt"=NOW()`, [seasonId, [...clubIds]]);
    await client.query(`UPDATE season_teams st SET "playerPagesTotal"=c.total,"playerPagesImported"=c.imported,"playersSyncedAt"=NOW()
      FROM teams t,jsonb_to_recordset($2::jsonb) AS c("apiId" int,total int,imported int)
      WHERE st."seasonId"=$1 AND st."teamId"=t.id AND t."apiId"=c."apiId"`, [seasonId, JSON.stringify(pageCoverage)]);
    await client.query(`INSERT INTO players ("apiId",name,"firstName","lastName","birthDate",nationality,"heightCm","weightKg","photoUrl","profileSyncedAt","updatedAt")
      SELECT p."apiId",p.name,p."firstName",p."lastName",p."birthDate",p.nationality,p."heightCm",p."weightKg",p."photoUrl",NOW(),NOW()
      FROM jsonb_to_recordset($1::jsonb) AS p("apiId" int,name text,"firstName" text,"lastName" text,"birthDate" date,nationality text,"heightCm" int,"weightKg" int,"photoUrl" text)
      ON CONFLICT ("apiId") DO UPDATE SET name=EXCLUDED.name,"firstName"=EXCLUDED."firstName","lastName"=EXCLUDED."lastName",
        "birthDate"=EXCLUDED."birthDate",nationality=EXCLUDED.nationality,"heightCm"=EXCLUDED."heightCm","weightKg"=EXCLUDED."weightKg",
        "photoUrl"=EXCLUDED."photoUrl","profileSyncedAt"=NOW(),"updatedAt"=NOW()`, [JSON.stringify([...profiles.values()])]);
    await client.query(`INSERT INTO player_season_stats ("seasonId","teamId","playerId",appearances,starts,minutes,position,rating,goals,assists,"goalsConceded",saves,"yellowCards","yellowRedCards","redCards","rawStatistics","syncedAt")
      SELECT $1,t.id,p.id,s.appearances,s.starts,s.minutes,s.position,s.rating,s.goals,s.assists,s."goalsConceded",s.saves,s."yellowCards",s."yellowRedCards",s."redCards",s."rawStatistics",NOW()
      FROM jsonb_to_recordset($2::jsonb) AS s("playerApiId" int,"teamApiId" int,appearances int,starts int,minutes int,position text,rating numeric,goals int,assists int,"goalsConceded" int,saves int,"yellowCards" int,"yellowRedCards" int,"redCards" int,"rawStatistics" jsonb)
      JOIN teams t ON t."apiId"=s."teamApiId" JOIN players p ON p."apiId"=s."playerApiId"
      ON CONFLICT ("seasonId","teamId","playerId") DO UPDATE SET appearances=EXCLUDED.appearances,starts=EXCLUDED.starts,
        minutes=EXCLUDED.minutes,position=EXCLUDED.position,rating=EXCLUDED.rating,goals=EXCLUDED.goals,assists=EXCLUDED.assists,
        "goalsConceded"=EXCLUDED."goalsConceded",saves=EXCLUDED.saves,"yellowCards"=EXCLUDED."yellowCards",
        "yellowRedCards"=EXCLUDED."yellowRedCards","redCards"=EXCLUDED."redCards","rawStatistics"=EXCLUDED."rawStatistics","syncedAt"=NOW()`, [seasonId, JSON.stringify([...snapshots.values()])]);
    const coverage = (await client.query(`SELECT t."apiId",t.name,count(s."playerId")::int AS players FROM season_teams st JOIN teams t ON t.id=st."teamId"
      LEFT JOIN player_season_stats s ON s."teamId"=t.id AND s."seasonId"=st."seasonId" WHERE st."seasonId"=$1 GROUP BY t.id ORDER BY t.name`, [seasonId])).rows;
    if (coverage.length !== 20 || coverage.some((t) => t.players === 0)) throw new Error('INCOMPLETE_CLUB_COVERAGE');
    await client.query('COMMIT');
    console.log(JSON.stringify({ season, clubs: coverage.length, players: profiles.size, seasonSnapshots: snapshots.size,
      dailyQuotaRemaining: remaining, partialTeams, coverage }));
    await fs.writeFile(path.join(cache, 'import-report.json'), JSON.stringify({ season, clubs: coverage.length,
      players: profiles.size, seasonSnapshots: snapshots.size, partialTeams, coverage }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { await client.end().catch(() => undefined); }
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'failed', code: error.code || (String(error.message).match(/^[A-Z_0-9]+$/) ? error.message : 'DATA_IMPORT_FAILED') }));
  process.exitCode = 1;
});
