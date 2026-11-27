import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { GET } from '../../src/routes/api/app/stats/+server';
import { withCors } from '../../src/lib/server/http/cors';

function database(users = 3, visitors = 7) {
  const first = vi.fn(async (_sql: string): Promise<{ user_count: number; visitor_count: number } | null> => ({ user_count: users, visitor_count: visitors }));
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
  expect(db.prepare).toHaveBeenCalledTimes(1);
  response = await GET(event(db.DB, false));
  expect(response.status).toBe(503);
  expect(db.prepare).toHaveBeenCalledTimes(1);
});

it('coalesces concurrent misses into one counter read and preserves the public DTO and browser cache', async () => {
  const db = database();
  const responses = await Promise.all(Array.from({ length: 20 }, () => GET(event(db.DB))));
  expect(db.prepare).toHaveBeenCalledTimes(1);
  expect(db.prepare.mock.calls[0][0]).toMatch(/FROM app_public_stats WHERE id = 1/u);
  for (const response of responses) {
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ total: 1237, base: 1230, real: 7 });
    expect(response.headers.get('cache-control')).toBe('private, max-age=1800');
    expect(response.headers.get('vary')).toBe('Origin');
  }
  await GET(event(db.DB));
  expect(db.prepare).toHaveBeenCalledTimes(1);
});

it('runs the installed Cloudflare adapter cache wrapper without mixing web and native CORS responses', async () => {
  const worker = readFileSync(new URL('../../node_modules/@sveltejs/adapter-cloudflare/files/worker.js', import.meta.url), 'utf8');
  const start = worker.indexOf('async function e(');
  const end = worker.indexOf('var s = caches.default;');
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const adapter = new Function(`${worker.slice(start, end)}\nreturn { read: e, write: t };`)() as {
    read: (cache: unknown, request: Request) => Promise<Response | undefined>;
    write: (cache: unknown, request: Request, response: Response, context: unknown) => Response;
  };
  const stored = new Map<string, Response>();
  const cache = {
    match: async (request: Request) => stored.get(request.url)?.clone(),
    put: vi.fn(async (request: Request, response: Response) => { stored.set(request.url, response.clone()); }),
  };
  const db = database();
  const waits: Promise<unknown>[] = [];
  for (const origin of ['', 'capacitor://localhost', 'https://localhost', '']) {
    const request = new Request('https://quangtu.vn/api/app/stats', { headers: origin ? { origin } : {} });
    const response = await adapter.read(cache, request) ?? adapter.write(cache, request,
      withCors(await GET(event(db.DB)), request), { waitUntil: (pending: Promise<unknown>) => waits.push(pending) });
    await Promise.all(waits);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin || null);
    await expect(response.json()).resolves.toMatchObject({ total: 1237 });
  }
  expect(cache.put).not.toHaveBeenCalled();
  expect(db.prepare).toHaveBeenCalledTimes(1);
});

it('does not reuse the aggregate of a different database binding', async () => {
  const a = database(5, 7), b = database(11, 2);
  await GET(event(a.DB));
  await expect((await GET(event(b.DB))).json()).resolves.toEqual({ total: 1241, base: 1230, real: 11 });
  expect(b.prepare).toHaveBeenCalledTimes(1);
});

it('returns an uncached unavailable result with the request ID, then retries the counter without a full scan', async () => {
  const db = database();
  db.first.mockRejectedValueOnce(new Error('no such table: app_public_stats'));
  const response = await GET(event(db.DB));
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  await expect(response.json()).resolves.toMatchObject({ error: { code: 'app_stats_unavailable' }, requestId: 'stats-test' });
  await expect((await GET(event(db.DB))).json()).resolves.toMatchObject({ real: 7 });
  expect(db.prepare).toHaveBeenCalledTimes(2);
  expect(db.prepare.mock.calls.every(([sql]) => !/COUNT\(/u.test(sql))).toBe(true);
});

it.each([null, { user_count: -1, visitor_count: 2 }, { user_count: 1, visitor_count: Number.NaN }])('does not cache a missing or invalid summary row (%j)', async row => {
  const db = database();
  db.first.mockResolvedValueOnce(row);
  expect((await GET(event(db.DB))).status).toBe(503);
  await expect((await GET(event(db.DB))).json()).resolves.toMatchObject({ total: 1237 });
  expect(db.prepare).toHaveBeenCalledTimes(2);
});

it('expires the successful summary after the existing 30-minute TTL', async () => {
  const db = database();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
  try {
    await GET(event(db.DB));
    clock.mockReturnValue(1_000_000 + 30 * 60_000 - 1);
    await GET(event(db.DB));
    expect(db.prepare).toHaveBeenCalledTimes(1);
    clock.mockReturnValue(1_000_000 + 30 * 60_000);
    await GET(event(db.DB));
    expect(db.prepare).toHaveBeenCalledTimes(2);
  } finally { clock.mockRestore(); }
});
