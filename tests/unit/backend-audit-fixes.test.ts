import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMediaService } from '../../src/lib/server/services/media';
import { createMediaRepository } from '../../src/lib/server/repositories/media-repository';
import { createThanhTinhService } from '../../src/lib/server/services/thanh-tinh';
import { handleApiRequest } from '../../src/lib/server/http/api-handler';
import { checkRateLimit } from '../../src/lib/server/http/rate-limit';
import { createAdminDashboardRepository } from '../../src/lib/server/repositories/admin-dashboard-repository';
import { createAdminMembersService } from '../../src/lib/server/services/admin-members';
import { createSyncRepository } from '../../src/lib/server/repositories/sync-repository';
import { createPracticeCommunityService } from '../../src/lib/server/services/practice-community';
import { createGoogleDriveIntegration } from '../../src/lib/server/integrations/google-drive';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createDbMock(handlers: {
  first?: (sql: string, args: unknown[]) => unknown;
  all?: (sql: string, args: unknown[]) => { results: unknown[] };
  run?: (sql: string, args: unknown[]) => unknown;
  batch?: (stmts: Array<{ sql: string; args: unknown[] }>) => unknown[];
} = {}) {
  const calls: Array<{ sql: string; args: unknown[] }> = [];
  const prepare = vi.fn((sql: string) => {
    const make = (args: unknown[]) => ({
      sql,
      args,
      bind: (...next: unknown[]) => make(next),
      first: async () => { calls.push({ sql, args }); return handlers.first ? handlers.first(sql, args) : null; },
      all: async () => { calls.push({ sql, args }); return handlers.all ? handlers.all(sql, args) : { results: [] }; },
      run: async () => { calls.push({ sql, args }); return handlers.run ? handlers.run(sql, args) : { success: true, meta: { changes: 1 } }; },
    });
    return make([]);
  });
  const batch = vi.fn(async (stmts: Array<{ sql: string; args: unknown[] }>) => {
    for (const stmt of stmts) calls.push({ sql: stmt.sql, args: stmt.args });
    return handlers.batch ? handlers.batch(stmts) : stmts.map(() => ({ success: true, meta: { changes: 1 } }));
  });
  return { DB: { prepare, batch }, calls, prepare, batch };
}

describe('R2 media service hardening', () => {
  it('computes accurate Content-Range and Content-Length for open-ended, suffix, unsatisfiable ranges and HEAD', async () => {
    const db = createDbMock();
    const makeService = (MEDIA: Record<string, unknown>, environment = 'production') =>
      createMediaService({ env: { DB: db.DB, MEDIA, ENVIRONMENT: environment } as any, principal: null, requestId: 'r1' });

    const openService = makeService({
      get: vi.fn().mockResolvedValue({ size: 1000, range: { offset: 250 }, body: new Response('x'.repeat(750)).body, writeHttpMetadata() {} }),
    });
    const openRes = await openService.getMedia('content/track.mp3', new Request('https://quangtu.vn/api/media/content/track.mp3', { headers: { Range: 'bytes=250-' } }));
    expect(openRes.status).toBe(206);
    expect(openRes.headers.get('Content-Range')).toBe('bytes 250-999/1000');
    expect(openRes.headers.get('Content-Length')).toBe('750');
    expect(openRes.headers.get('Content-Type')).toBe('audio/mpeg');

    const suffixService = makeService({
      get: vi.fn().mockResolvedValue({ size: 1000, range: { suffix: 100 }, body: new Response('x'.repeat(100)).body, writeHttpMetadata() {} }),
    });
    const suffixRes = await suffixService.getMedia('content/clip.m4a', new Request('https://quangtu.vn/api/media/content/clip.m4a', { headers: { Range: 'bytes=-100' } }));
    expect(suffixRes.status).toBe(206);
    expect(suffixRes.headers.get('Content-Range')).toBe('bytes 900-999/1000');
    expect(suffixRes.headers.get('Content-Length')).toBe('100');
    expect(suffixRes.headers.get('Content-Type')).toBe('audio/mp4');

    const invalidRangeRes = await suffixService.getMedia('content/clip.m4a', new Request('https://quangtu.vn/api/media/content/clip.m4a', { headers: { Range: 'bytes=abc-def' } }));
    expect(invalidRangeRes.status).toBe(416);

    const oobService = makeService({
      get: vi.fn().mockResolvedValue({ size: 100, range: { offset: 500, length: 0 }, body: new Response('').body, writeHttpMetadata() {} }),
    });
    const oobRes = await oobService.getMedia('covers/a.gif', new Request('https://quangtu.vn/api/media/covers/a.gif', { headers: { Range: 'bytes=500-600' } }));
    expect(oobRes.status).toBe(416);
    expect(oobRes.headers.get('Content-Range')).toBe('bytes */100');

    const headService = makeService({
      head: vi.fn().mockResolvedValue({ size: 512, httpEtag: '"e1"', writeHttpMetadata() {} }),
      get: vi.fn(),
    });
    const headRes = await headService.getMedia('covers/a.gif', new Request('https://quangtu.vn/api/media/covers/a.gif', { method: 'HEAD' }));
    expect(headRes.status).toBe(200);
    expect(headRes.headers.get('Content-Type')).toBe('image/gif');
    expect(headRes.headers.get('Content-Length')).toBe('512');
    expect(headRes.body).toBeNull();
  });

  it('returns controlled 404/400 on malformed URI encoding and does not proxy missing objects in production', async () => {
    const db = createDbMock();
    const fetchSpy = vi.fn().mockResolvedValue(new Response('remote', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const service = createMediaService({
      env: { DB: db.DB, MEDIA: { get: vi.fn().mockResolvedValue(null) }, ENVIRONMENT: 'production' } as any,
      principal: { role: 'admin', userId: 'a1' } as any,
      requestId: 'r2',
    });
    await expect(service.getMedia('covers/%E0%A4%A.webp', new Request('https://quangtu.vn/api/media/x'))).rejects.toMatchObject({ status: 404 });
    await expect(service.tombstoneMedia('covers/%E0%A4%A.webp', 'idem-1')).rejects.toMatchObject({ status: 400 });
    await expect(service.getMedia('covers/missing.webp', new Request('https://quangtu.vn/api/media/covers/missing.webp'))).rejects.toMatchObject({ status: 404 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('strips #pos= fragments when checking live article references in tombstoneObjectIfUnreferenced', async () => {
    const db = createDbMock();
    const repo = createMediaRepository({ DB: db.DB } as any);
    await repo.tombstoneObjectIfUnreferenced('op1', 'covers/a.webp', 'sha', 100, '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z', ['covers/a.webp']);
    expect(db.calls[0].sql).toMatch(/instr\(anh_url,\s*'#(?:pos=)?'\)/);
    expect(db.calls[0].sql).toMatch(/instr\(pdf_url,\s*'#(?:pos=)?'\)/);
  });
});

describe('Thanh Tinh atomic batch, clamping and API rate limits', () => {
  it('clamps bounds and uses a single atomic DB.batch gated on existing pledge row', async () => {
    const db = createDbMock({
      all: () => ({ results: [{ key: 'participants', value: 1352 }, { key: 'urges_resisted', value: 8640 }, { key: 'clean_days', value: 33450 }] }),
    });
    const service = createThanhTinhService({ env: { DB: db.DB } as any, principal: null, requestId: 'r3' });
    await service.syncDailyProgress({ anonIdHash: 'hash-1', streakDays: 999999, resistedDelta: Number.POSITIVE_INFINITY });
    expect(db.batch).toHaveBeenCalledTimes(1);
    const batchCalls = db.batch.mock.calls[0][0] as Array<{ sql: string; args: unknown[] }>;
    expect(batchCalls[0].args[0]).toBe(36500);
    expect(batchCalls[0].args[1]).toBe(0);
    expect(batchCalls.slice(1).every(stmt => /WHERE\s+EXISTS/iu.test(stmt.sql))).toBe(true);

    db.batch.mockClear();
    await service.syncDailyProgress({ anonIdHash: 'hash-1', streakDays: 5, resistedDelta: 999999 });
    const clampedCalls = db.batch.mock.calls[0][0] as Array<{ sql: string; args: unknown[] }>;
    expect(clampedCalls[0].args[1]).toBe(500);
  });

  it('rate-limits /api/thanh-tinh/pledge, /api/thanh-tinh/sync and /api/phap-bao/claim and supports HEAD /api/media/*', async () => {
    const db = createDbMock();
    const denyLimiter = { limit: vi.fn().mockResolvedValue({ success: false }) };
    const env = { DB: db.DB, APP_ORIGIN: 'https://quangtu.vn', COMMENT_RATE_LIMITER: denyLimiter, MEDIA: { head: vi.fn().mockResolvedValue({ size: 42, writeHttpMetadata() {} }), get: vi.fn() } } as any;
    const baseHeaders = { Origin: 'https://quangtu.vn', 'Content-Type': 'application/json', 'X-CSRF-Token': 'public' };
    for (const path of ['/api/thanh-tinh/pledge', '/api/thanh-tinh/sync', '/api/phap-bao/claim']) {
      const res = await handleApiRequest({
        request: new Request(`https://quangtu.vn${path}`, { method: 'POST', headers: baseHeaders, body: '{}' }),
        locals: { env, session: null, migrationSealed: true, requestId: 'rl-1' },
      });
      expect(res.status).toBe(429);
    }

    const headRes = await handleApiRequest({
      request: new Request('https://quangtu.vn/api/media/covers/test.webp', { method: 'HEAD' }),
      locals: { env, session: null, migrationSealed: true, requestId: 'head-1' },
    });
    expect(headRes.status).toBe(200);
    expect(headRes.headers.get('content-length')).toBe('42');

    // POST /api/personal-events without X-CSRF-Token must reject cross-origin & same-site/cross-site requests (403)
    const crossOriginRes = await handleApiRequest({
      request: new Request('https://quangtu.vn/api/personal-events', {
        method: 'POST',
        headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: [] }),
      }),
      locals: { env, session: { appUserId: 'u1', userId: 'u1', role: 'user', csrfToken: 'secret' } as any, migrationSealed: true, requestId: 'pe-1' },
    });
    expect(crossOriginRes.status).toBe(403);

    const sameSiteRes = await handleApiRequest({
      request: new Request('https://quangtu.vn/api/personal-events', {
        method: 'POST',
        headers: { Origin: 'https://quangtu.vn', 'Sec-Fetch-Site': 'same-site', 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: [] }),
      }),
      locals: { env, session: { appUserId: 'u1', userId: 'u1', role: 'user', csrfToken: 'secret' } as any, migrationSealed: true, requestId: 'pe-2' },
    });
    expect(sameSiteRes.status).toBe(403);
  });

  it('throws controlled 503 ServerInputError when rate limiter binding throws', async () => {
    const broken = { limit: vi.fn().mockRejectedValue(new Error('binding outage')) };
    await expect(checkRateLimit(broken, 'key-1')).rejects.toMatchObject({ status: 503, code: 'service_unavailable' });
  });
});

describe('D1 bounds, sync metadata safety, practice-community & Google Drive token cache', () => {
  it('bounds admin dashboard trafficSummary, admin members list, and sync player items with safe JSON recovery', async () => {
    const db = createDbMock({
      first: (sql) => sql.includes('user_sync_data') ? { id: 'u1', sync_metadata: '{corrupt-json' } : null,
      all: () => ({ results: [] }),
    });
    await createAdminDashboardRepository({ DB: db.DB } as any).trafficSummary('2026-11-23', '2026-11-01', '2026-01-01', '2026-11-01', '2026-11-23');
    expect(db.calls[0].sql).toMatch(/WHERE\s+visit_date\s*>=\s*\?\s*AND\s+visit_date\s*<=\s*\?/iu);

    db.calls.length = 0;
    await createAdminMembersService({ DB: db.DB } as any, { appUserId: 'a1', role: 'admin' } as any).listMembers();
    expect(db.calls[0].sql).toMatch(/LIMIT\s+\d+/iu);

    db.calls.length = 0;
    const syncRow = await createSyncRepository({ DB: db.DB } as any).getUserSync('u1');
    expect(syncRow).toBeTruthy();
    expect(db.calls.find(c => c.sql.includes('player_sync_items'))?.sql).toMatch(/LIMIT\s+\d+/iu);
  });

  it('avoids double privateProgress scan in updateProfile and redundant backfill across repeated reads', async () => {
    const repo = {
      backfillLegacyPracticeLogs: vi.fn().mockResolvedValue(0),
      getProfile: vi.fn().mockResolvedValue({ owner_id: 'u1', time_zone: 'UTC', leaderboard_opt_in: 0, presence_opt_in: 0, selected_badge: null, created_at: '', updated_at: '' }),
      upsertProfile: vi.fn().mockResolvedValue(undefined),
      listAcceptedActivitiesPage: vi.fn().mockResolvedValue({ results: [] }),
      acceptedTotals: vi.fn().mockResolvedValue({ acceptedCount: 0, acceptedDurationSeconds: 0, sessions: 0 }),
      practiceBreakdown: vi.fn().mockResolvedValue({ results: [] }),
    };
    const dbToken = { prepare: vi.fn(), batch: vi.fn() };
    const service = createPracticeCommunityService(
      { env: { DB: dbToken } as any, principal: { appUserId: 'u1', role: 'user' } as any, requestId: 'pc-1' },
      { repository: repo as any },
    );
    await service.privateProgress();
    await service.privateProgress();
    expect(repo.backfillLegacyPracticeLogs).toHaveBeenCalledTimes(1);

    repo.listAcceptedActivitiesPage.mockClear();
    await service.updateProfile({ timeZone: 'UTC', leaderboardOptIn: false, presenceOptIn: false, selectedBadge: null });
    expect(repo.listAcceptedActivitiesPage).toHaveBeenCalledTimes(1);
  });

  it('caches Google Drive OAuth access tokens across requests until near expiry', async () => {
    const pair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    );
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
    let binary = '';
    for (const b of pkcs8) binary += String.fromCharCode(b);
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(binary)}\n-----END PRIVATE KEY-----`;
    const env = {
      GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        type: 'service_account',
        client_email: 'drive-cache-test@example.iam.gserviceaccount.com',
        private_key: pem,
        token_uri: 'https://oauth2.googleapis.com/token',
      }),
    } as any;
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ access_token: 'cached-token-1', expires_in: 3600 }));
    const drive = createGoogleDriveIntegration(env);
    expect(await drive.getAccessToken(fetchImpl as any)).toBe('cached-token-1');
    expect(await drive.getAccessToken(fetchImpl as any)).toBe('cached-token-1');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
