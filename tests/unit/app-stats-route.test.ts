import { expect, it, vi } from 'vitest';
import { GET } from '../../src/routes/api/app/stats/+server';

function database(users = 3, visitors = 7) {
  const first = vi.fn(async (sql: string) => ({ total: sql.includes('app_users') ? users : visitors }));
  const prepare = vi.fn((sql: string) => ({ first: () => first(sql) }));
  return { DB: { prepare }, prepare, first };
}

const event = (DB: unknown, sealed = true) => ({
  request: new Request('https://quangtu.vn/api/app/stats'),
  locals: { env: { DB }, migrationSealed: sealed, requestId: 'stats-test' },
}) as unknown as Parameters<typeof GET>[0];

it('rejects unsealed runtime before touching D1, including after a successful cached read', async () => {
  const db = database();
  let response = await GET(event(db.DB, false));
  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toMatchObject({ error: { code: 'migration_unsealed' } });
  expect(db.prepare).not.toHaveBeenCalled();
  await GET(event(db.DB));
  expect(db.prepare).toHaveBeenCalledTimes(2);
  response = await GET(event(db.DB, false));
  expect(response.status).toBe(503);
  expect(db.prepare).toHaveBeenCalledTimes(2);
});

it('coalesces concurrent misses into the two existing count queries and preserves the public DTO/cache', async () => {
  const db = database();
  const responses = await Promise.all(Array.from({ length: 20 }, () => GET(event(db.DB))));
  expect(db.prepare).toHaveBeenCalledTimes(2);
  for (const response of responses) {
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ total: 1237, base: 1230, real: 7 });
    expect(response.headers.get('cache-control')).toContain('public, max-age=1800');
  }
  await GET(event(db.DB));
  expect(db.prepare).toHaveBeenCalledTimes(2);
});

it('does not reuse the aggregate of a different database binding', async () => {
  const a = database(5, 7), b = database(11, 2);
  await GET(event(a.DB));
  await expect((await GET(event(b.DB))).json()).resolves.toEqual({ total: 1241, base: 1230, real: 11 });
  expect(b.prepare).toHaveBeenCalledTimes(2);
});

it('preserves the baseline fallback when D1 is unavailable and retries after the 30-minute cache expires', async () => {
  const db = database();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
  try {
    db.first.mockRejectedValueOnce(new Error('database-unavailable'));
    await expect((await GET(event(db.DB))).json()).resolves.toEqual({ total: 1230, base: 1230, real: 0 });
    clock.mockReturnValue(1_000_000 + 30 * 60_000);
    await expect((await GET(event(db.DB))).json()).resolves.toMatchObject({ real: 7 });
    expect(db.prepare).toHaveBeenCalledTimes(4);
  } finally { clock.mockRestore(); }
});
