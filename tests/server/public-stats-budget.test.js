import { beforeAll, beforeEach, expect, it } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import authSchema from '../../migrations/0002-auth-and-session-schema.sql?raw';
import activeSchema from '../../migrations/0008-active-visitors.sql?raw';
import presenceSchema from '../../migrations/0013-admin-dashboard-analytics.sql?raw';
import memberSchema from '../../migrations/0026-member-status.sql?raw';
import counterSchema from '../../migrations/0049-app-public-stats-counter.sql?raw';
import { handleAppStatsRequest } from '../../src/lib/server/http/api-handler.ts';
import { createPresenceRepository } from '../../src/lib/server/repositories/presence-repository.ts';

const counterQueries = counterSchema.trim().split(/;\s*\n\s*\n/gu)
  .map(sql => sql.trim().endsWith(';') ? sql.trim() : `${sql.trim()};`);
const legacyCounts = ['SELECT COUNT(*) AS total FROM app_users',
  'SELECT COUNT(DISTINCT visitor_id_hash) AS total FROM visitor_daily_presence'];
const measure = ({ meta }) => ({ rowsRead: meta.rows_read, rowsWritten: meta.rows_written, changes: meta.changes });
let originalReadBudget;
let originalWriteBudget;
let recursiveTriggers;

async function seedFixture() {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO app_users (id,role,status) VALUES ('fixture-a','user','active'), ('fixture-b','admin','suspended')"),
    env.DB.prepare(`INSERT INTO visitor_daily_presence
      (visit_date,visitor_id_hash,network_hash,first_seen_at,last_seen_at)
      VALUES ('2026-11-26','fixture-1','fixture-network',0,0), ('2026-11-27','fixture-1','fixture-network',0,0),
        ('2026-11-27','fixture-2','fixture-network',0,0), ('2026-11-27','fixture-3','fixture-network',0,0)`),
  ]);
}

async function sampleWrites() {
  const statements = {
    userInsert: "INSERT INTO app_users (id) VALUES ('budget-user')",
    userDelete: "DELETE FROM app_users WHERE id='budget-user'",
    visitorInsert: `INSERT INTO visitor_daily_presence
      (visit_date,visitor_id_hash,network_hash,first_seen_at,last_seen_at) VALUES ('2026-11-27','budget-visitor','fixture-network',1,1)`,
    heartbeat: `INSERT INTO visitor_daily_presence
      (visit_date,visitor_id_hash,network_hash,first_seen_at,last_seen_at) VALUES ('2026-11-27','budget-visitor','fixture-network',1,2)
      ON CONFLICT(visit_date,visitor_id_hash) DO UPDATE SET last_seen_at=excluded.last_seen_at,
        heartbeat_count=visitor_daily_presence.heartbeat_count+1`,
    visitorNextDay: `INSERT INTO visitor_daily_presence
      (visit_date,visitor_id_hash,network_hash,first_seen_at,last_seen_at) VALUES ('2026-11-28','budget-visitor','fixture-network',1,1)`,
    visitorDeleteOneDay: "DELETE FROM visitor_daily_presence WHERE visit_date='2026-11-27' AND visitor_id_hash='budget-visitor'",
    visitorDeleteLastDay: "DELETE FROM visitor_daily_presence WHERE visitor_id_hash='budget-visitor'",
  };
  const results = {};
  for (const [name, sql] of Object.entries(statements)) results[name] = measure(await env.DB.prepare(sql).run());
  return results;
}

async function assertCounts(users, visitors) {
  expect(await env.DB.prepare('SELECT user_count,visitor_count FROM app_public_stats WHERE id=1').first())
    .toEqual({ user_count: users, visitor_count: visitors });
  const rows = await env.DB.batch(legacyCounts.map(sql => env.DB.prepare(sql)));
  expect(rows.map(row => row.results[0].total)).toEqual([users, visitors]);
}

async function removeCounterSchema() {
  const triggers = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'app_public_stats_%'").all();
  await env.DB.batch([
    ...triggers.results.map(({ name }) => env.DB.prepare(`DROP TRIGGER ${name}`)),
    env.DB.prepare('DROP INDEX idx_visitor_daily_presence_visitor_date'),
    env.DB.prepare('DROP TABLE app_public_stats'),
  ]);
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, [authSchema, activeSchema, presenceSchema, memberSchema].map((sql, index) => ({
    name: `stats-fixture-${index}.sql`, queries: sql.split(';').map(part => part.trim()).filter(Boolean),
  })));
  await seedFixture();
  originalReadBudget = (await env.DB.batch(legacyCounts.map(sql => env.DB.prepare(sql)))).map(measure);
  originalWriteBudget = await sampleWrites();
  recursiveTriggers = await env.DB.prepare('PRAGMA recursive_triggers').first();
  await applyD1Migrations(env.DB, [{ name: '0049-app-public-stats-counter.sql', queries: counterQueries }]);
});

beforeEach(async () => {
  if (!await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_public_stats'").first()) {
    await env.DB.batch(counterQueries.map(sql => env.DB.prepare(sql)));
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM visitor_daily_presence'), env.DB.prepare('DELETE FROM app_users'),
  ]);
  await seedFixture();
  await assertCounts(2, 3);
});

it('bootstraps existing users including suspended administrators and cross-day distinct visitors with exactly five triggers', async () => {
  await assertCounts(2, 3);
  expect((await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'app_public_stats_%'").all()).results).toHaveLength(5);
  expect(await env.DB.prepare('PRAGMA recursive_triggers').first()).toEqual(recursiveTriggers);
});

it('can bootstrap an empty database without changing the public baseline', async () => {
  await removeCounterSchema();
  await env.DB.batch([env.DB.prepare('DELETE FROM visitor_daily_presence'), env.DB.prepare('DELETE FROM app_users')]);
  await env.DB.batch(counterQueries.map(sql => env.DB.prepare(sql)));
  await assertCounts(0, 0);
  const DB = { prepare: sql => env.DB.prepare(sql) };
  await expect((await handleAppStatsRequest({ DB })).json()).resolves.toEqual({ base: 1230, real: 0, total: 1230 });
});

it('counts only actual user inserts/deletes and preserves IGNORE, profile, role and suspension updates', async () => {
  await env.DB.prepare("INSERT INTO app_users(id) VALUES ('new-user')").run();
  await assertCounts(3, 3);
  await env.DB.prepare("INSERT OR IGNORE INTO app_users(id) VALUES ('new-user')").run();
  await env.DB.prepare("UPDATE app_users SET display_name='Updated',role='admin',status='suspended' WHERE id='new-user'").run();
  await env.DB.prepare("DELETE FROM app_users WHERE id='missing-user'").run();
  await assertCounts(3, 3);
  await env.DB.prepare("DELETE FROM app_users WHERE id='new-user'").run();
  await assertCounts(2, 3);
});

it('keeps IGNORE/UPSERT heartbeats and same-visitor later days unchanged, decrementing only after the last retained row is deleted', async () => {
  await env.DB.prepare(`INSERT OR IGNORE INTO visitor_daily_presence
    (visit_date,visitor_id_hash,network_hash,first_seen_at,last_seen_at) VALUES ('2026-11-27','fixture-1','fixture-network',1,1)`).run();
  await env.DB.prepare(`INSERT INTO visitor_daily_presence
    (visit_date,visitor_id_hash,network_hash,first_seen_at,last_seen_at) VALUES ('2026-11-27','fixture-1','fixture-network',1,1)
    ON CONFLICT(visit_date,visitor_id_hash) DO UPDATE SET last_seen_at=excluded.last_seen_at,
      heartbeat_count=visitor_daily_presence.heartbeat_count+1`).run();
  await env.DB.prepare(`INSERT INTO visitor_daily_presence
    (visit_date,visitor_id_hash,network_hash,first_seen_at,last_seen_at) VALUES ('2026-11-28','fixture-1','fixture-network',1,1)`).run();
  await assertCounts(2, 3);
  await env.DB.prepare("DELETE FROM visitor_daily_presence WHERE visit_date='2026-11-26' AND visitor_id_hash='fixture-1'").run();
  await assertCounts(2, 3);
  await env.DB.prepare("DELETE FROM visitor_daily_presence WHERE visitor_id_hash='fixture-1'").run();
  await assertCounts(2, 2);
});

it('adjusts both old and new visitor membership for hash changes, while date-only updates retain the same distinct count', async () => {
  await env.DB.prepare("UPDATE visitor_daily_presence SET visitor_id_hash='fixture-2' WHERE visitor_id_hash='fixture-1' AND visit_date='2026-11-26'").run();
  await assertCounts(2, 3);
  await env.DB.prepare("UPDATE visitor_daily_presence SET visitor_id_hash='fixture-1' WHERE visitor_id_hash='fixture-2' AND visit_date='2026-11-26'").run();
  await assertCounts(2, 3);
  await env.DB.prepare("UPDATE visitor_daily_presence SET visitor_id_hash='renamed' WHERE visitor_id_hash='fixture-1' AND visit_date='2026-11-26'").run();
  await assertCounts(2, 4);
  await env.DB.prepare("UPDATE visitor_daily_presence SET visitor_id_hash='fixture-2',visit_date='2026-11-28' WHERE visitor_id_hash='fixture-1'").run();
  await assertCounts(2, 3);
  await env.DB.prepare("UPDATE visitor_daily_presence SET visitor_id_hash='another-name' WHERE visitor_id_hash='renamed'").run();
  await assertCounts(2, 3);
  await env.DB.prepare("UPDATE visitor_daily_presence SET visit_date='2026-11-29' WHERE visitor_id_hash='another-name'").run();
  await assertCounts(2, 3);
});

it('keeps retention counters and the direct purged-row metric exact after triggers run', async () => {
  const result = await createPresenceRepository({ DB: env.DB }).purgeExpired(1, 1);
  expect(result).toEqual({ hasMore: false, purged: 4 });
  await assertCounts(2, 0);
});

it('drains counter-backed retention across the 500-row boundary without deleting a fresh visitor', async () => {
  const inserts = Array.from({ length: 501 }, (_, index) => env.DB.prepare(`INSERT INTO visitor_daily_presence
    (visit_date,visitor_id_hash,network_hash,first_seen_at,last_seen_at) VALUES ('2025-01-01',?,'fixture-network',0,0)`)
    .bind(`expired-fixture-${index}`));
  for (let offset = 0; offset < inserts.length; offset += 100) await env.DB.batch(inserts.slice(offset, offset + 100));
  await env.DB.prepare(`INSERT INTO visitor_daily_presence
    (visit_date,visitor_id_hash,network_hash,first_seen_at,last_seen_at) VALUES ('2026-11-27','fresh-visitor','fixture-network',2,2)`).run();
  expect(await createPresenceRepository({ DB: env.DB }).purgeExpired(1, 1)).toEqual({ hasMore: false, purged: 505 });
  await assertCounts(2, 1);
});

it('reads one row with one SQL for concurrent misses, with indexed membership checks and no full-scan fallback when schema is absent', async () => {
  const queries = [];
  const DB = {
    prepare(sql) {
      return { async first() {
        const result = await env.DB.prepare(sql).all();
        queries.push({ sql, ...measure(result) });
        return result.results[0];
      } };
    },
  };
  const responses = await Promise.all(Array.from({ length: 20 }, () => handleAppStatsRequest({ DB })));
  for (const response of responses) await expect(response.json()).resolves.toEqual({ base: 1230, real: 3, total: 1233 });
  expect(queries).toHaveLength(1);
  expect(queries[0]).toMatchObject({ rowsRead: 1, rowsWritten: 0 });
  await handleAppStatsRequest({ DB });
  expect(queries).toHaveLength(1);
  const plan = (await env.DB.prepare(`EXPLAIN QUERY PLAN SELECT 1 FROM visitor_daily_presence
    WHERE visitor_id_hash='fixture-1' AND visit_date<>'2026-11-27'`).all()).results.map(row => row.detail).join('\n');
  expect(plan).toContain('idx_visitor_daily_presence_visitor_date');
  expect(plan).not.toContain('SCAN visitor_daily_presence');
  expect({ before: originalReadBudget, after: queries, plan }).toMatchInlineSnapshot(`
    {
      "after": [
        {
          "changes": 0,
          "rowsRead": 1,
          "rowsWritten": 0,
          "sql": "SELECT user_count, visitor_count FROM app_public_stats WHERE id = 1",
        },
      ],
      "before": [
        {
          "changes": 0,
          "rowsRead": 2,
          "rowsWritten": 0,
        },
        {
          "changes": 0,
          "rowsRead": 4,
          "rowsWritten": 0,
        },
      ],
      "plan": "SEARCH visitor_daily_presence USING COVERING INDEX idx_visitor_daily_presence_visitor_date (visitor_id_hash=?)",
    }
  `);
  await removeCounterSchema();
  const missing = await handleAppStatsRequest({ DB: env.DB }, 'missing-counter-test');
  expect(missing.status).toBe(503);
  await expect(missing.json()).resolves.toMatchObject({ error: { code: 'app_stats_unavailable' }, requestId: 'missing-counter-test' });
});

it('measures counter/index write overhead while normal heartbeat writes stay unchanged', async () => {
  const after = await sampleWrites();
  expect(after.userInsert.rowsWritten - originalWriteBudget.userInsert.rowsWritten).toBe(1);
  expect(after.userDelete.rowsWritten - originalWriteBudget.userDelete.rowsWritten).toBe(1);
  expect(after.heartbeat.rowsWritten).toBe(originalWriteBudget.heartbeat.rowsWritten);
  await assertCounts(2, 3);
  expect({ before: originalWriteBudget, after }).toMatchInlineSnapshot(`
    {
      "after": {
        "heartbeat": {
          "changes": 1,
          "rowsRead": 0,
          "rowsWritten": 2,
        },
        "userDelete": {
          "changes": 2,
          "rowsRead": 2,
          "rowsWritten": 2,
        },
        "userInsert": {
          "changes": 2,
          "rowsRead": 2,
          "rowsWritten": 3,
        },
        "visitorDeleteLastDay": {
          "changes": 2,
          "rowsRead": 4,
          "rowsWritten": 2,
        },
        "visitorDeleteOneDay": {
          "changes": 1,
          "rowsRead": 2,
          "rowsWritten": 1,
        },
        "visitorInsert": {
          "changes": 2,
          "rowsRead": 3,
          "rowsWritten": 5,
        },
        "visitorNextDay": {
          "changes": 1,
          "rowsRead": 1,
          "rowsWritten": 4,
        },
      },
      "before": {
        "heartbeat": {
          "changes": 1,
          "rowsRead": 0,
          "rowsWritten": 2,
        },
        "userDelete": {
          "changes": 1,
          "rowsRead": 1,
          "rowsWritten": 1,
        },
        "userInsert": {
          "changes": 1,
          "rowsRead": 1,
          "rowsWritten": 2,
        },
        "visitorDeleteLastDay": {
          "changes": 1,
          "rowsRead": 5,
          "rowsWritten": 1,
        },
        "visitorDeleteOneDay": {
          "changes": 1,
          "rowsRead": 1,
          "rowsWritten": 1,
        },
        "visitorInsert": {
          "changes": 1,
          "rowsRead": 0,
          "rowsWritten": 3,
        },
        "visitorNextDay": {
          "changes": 1,
          "rowsRead": 0,
          "rowsWritten": 3,
        },
      },
    }
  `);
});

it('rolls back source writes and their counters together on a failed atomic batch', async () => {
  await expect(env.DB.batch([
    env.DB.prepare("INSERT INTO app_users(id) VALUES ('rolled-back-user')"),
    env.DB.prepare('INSERT INTO app_public_stats(id,user_count,visitor_count) VALUES (2,0,0)'),
  ])).rejects.toThrow();
  expect(await env.DB.prepare("SELECT id FROM app_users WHERE id='rolled-back-user'").first()).toBeNull();
  await assertCounts(2, 3);
});

it('atomically rolls back bootstrap, index and all five trigger installs when migration execution fails', async () => {
  await removeCounterSchema();
  await expect(env.DB.batch([
    ...counterQueries.map(sql => env.DB.prepare(sql)),
    env.DB.prepare('INSERT INTO app_public_stats(id,user_count,visitor_count) VALUES (2,0,0)'),
  ])).rejects.toThrow();
  expect((await env.DB.prepare(`SELECT name FROM sqlite_master
    WHERE name='app_public_stats' OR name='idx_visitor_daily_presence_visitor_date' OR name LIKE 'app_public_stats_%'`).all()).results).toEqual([]);
  const result = await env.DB.batch(counterQueries.map(sql => env.DB.prepare(sql)));
  await assertCounts(2, 3);
  expect(result.map(measure)).toMatchInlineSnapshot(`
    [
      {
        "changes": 0,
        "rowsRead": 1,
        "rowsWritten": 2,
      },
      {
        "changes": 0,
        "rowsRead": 10,
        "rowsWritten": 5,
      },
      {
        "changes": 1,
        "rowsRead": 7,
        "rowsWritten": 1,
      },
      {
        "changes": 0,
        "rowsRead": 0,
        "rowsWritten": 1,
      },
      {
        "changes": 0,
        "rowsRead": 0,
        "rowsWritten": 1,
      },
      {
        "changes": 0,
        "rowsRead": 0,
        "rowsWritten": 1,
      },
      {
        "changes": 0,
        "rowsRead": 0,
        "rowsWritten": 1,
      },
      {
        "changes": 0,
        "rowsRead": 0,
        "rowsWritten": 1,
      },
    ]
  `);
});
