import { beforeAll, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import authSchema from '../../migrations/0002-auth-and-session-schema.sql?raw';
import presenceSchema from '../../migrations/0013-admin-dashboard-analytics.sql?raw';
import { handleAppStatsRequest } from '../../src/lib/server/http/api-handler.ts';

beforeAll(async () => {
  const createTable = (schema, name) => `${schema.split(';').find(sql => sql.includes(`CREATE TABLE IF NOT EXISTS ${name} (`))};`;
  await env.DB.batch([
    env.DB.prepare(createTable(authSchema, 'app_users')),
    env.DB.prepare(createTable(presenceSchema, 'visitor_daily_presence')),
    env.DB.prepare("INSERT INTO app_users (id) VALUES ('fixture-a'), ('fixture-b')"),
    env.DB.prepare(`INSERT INTO visitor_daily_presence
      (visit_date, visitor_id_hash, network_hash, first_seen_at, last_seen_at)
      VALUES ('2026-11-26', 'fixture-1', 'fixture-network', 0, 0),
        ('2026-11-27', 'fixture-1', 'fixture-network', 0, 0),
        ('2026-11-27', 'fixture-2', 'fixture-network', 0, 0),
        ('2026-11-27', 'fixture-3', 'fixture-network', 0, 0)`),
  ]);
});

it('measures the local D1 budget for concurrent misses and keeps cross-day visitor deduplication', async () => {
  const queries = [];
  const DB = {
    prepare(sql) {
      return { async first() {
        const result = await env.DB.prepare(sql).all();
        queries.push({ sql, rowsRead: result.meta.rows_read, rowsWritten: result.meta.rows_written });
        return result.results[0];
      } };
    },
  };
  const responses = await Promise.all(Array.from({ length: 20 }, () => handleAppStatsRequest({ DB })));
  for (const response of responses) await expect(response.json()).resolves.toEqual({ base: 1230, real: 3, total: 1233 });
  expect(queries).toHaveLength(2);
  expect(queries.every(query => query.rowsWritten === 0)).toBe(true);
  expect(queries.find(query => query.sql.includes('COUNT(DISTINCT')).rowsRead).toBeGreaterThanOrEqual(4);
  await handleAppStatsRequest({ DB });
  expect(queries).toHaveLength(2);
});
