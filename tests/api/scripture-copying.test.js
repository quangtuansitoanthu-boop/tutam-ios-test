import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import schema from '../../migrations/0035-scripture-copying.sql?raw';
import latestIndex from '../../migrations/0048-scripture-copying-latest.sql?raw';
import book from '../../src/lib/data/scripture-copying/dia-tang.json';
import { handleApiRequest } from '../../src/lib/server/http/api-handler.ts';

const session = { appUserId: 'copy-a', userId: 'copy-a', role: 'user', csrfToken: 'copy-test-csrf' };
const origin = 'http://localhost:8787';
const input = () => ({ runId: crypto.randomUUID(), sutraId: book.id, chapter: 1, sourceVersion: book.version,
  texts: book.chapters[0].blocks.map(() => ''), mutationId: crypto.randomUUID(), revision: 0 });
function call(method, body, principal = session, headers = {}, query = '') {
  return handleApiRequest({ request: new Request(`${origin}/api/practice/copying${query}`, {
    method, headers: { origin, 'content-type': 'application/json', 'x-csrf-token': 'copy-test-csrf', ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), locals: { env: { ...env, APP_ORIGIN: origin }, session: principal, migrationSealed: true } });
}
beforeAll(async () => {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS app_users (id TEXT PRIMARY KEY)').run();
  for (const statement of schema.split(';').map(s => s.trim()).filter(Boolean)) await env.DB.prepare(statement).run();
  for (const statement of latestIndex.split(';').map(s => s.trim()).filter(Boolean)) await env.DB.prepare(statement).run();
  await env.DB.prepare("INSERT INTO app_users (id) VALUES ('copy-a'), ('copy-b')").run();
});
beforeEach(async () => { await env.DB.prepare('DELETE FROM scripture_copy_chapters').run(); });

describe('copying API on Cloudflare D1', () => {
  it('requires login for save and read, and keeps strict origin/CSRF checks', async () => {
    expect((await call('PUT', input(), null)).status).toBe(401);
    expect((await call('GET', null, null, {}, '?sutra=dia-tang&chapter=1')).status).toBe(401);
    expect((await call('GET', null, null, {}, '?latest=1')).status).toBe(401);
    expect((await call('PUT', input(), session, { 'x-csrf-token': 'invalid' })).status).toBe(403);
    expect((await call('PUT', input(), session, { origin: 'https://untrusted.example' })).status).toBe(403);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM scripture_copy_chapters').first()).n).toBe(0);
  });
  it('saves partial text only on PUT, retries idempotently and isolates account reads', async () => {
    const value = input(); value.texts[0] = 'Nam mô';
    const saved = await call('PUT', value);
    expect(saved.status).toBe(200);
    const ack = await saved.json(); expect(ack).toMatchObject({ revision: 1, complete: false });
    expect(await (await call('PUT', value)).json()).toEqual(ack);
    const copy = await (await call('GET', null, session, {}, `?sutra=dia-tang&chapter=1&run=${value.runId}`)).json();
    expect(copy.copy.texts[0]).toBe('Nam mô');
    const other = await (await call('GET', null, { ...session, appUserId: 'copy-b' }, {}, `?sutra=dia-tang&chapter=1&run=${value.runId}`)).json();
    expect(other.copy).toBeNull();
    expect((await call('PUT', { ...value, mutationId: crypto.randomUUID() })).status).toBe(409);
  });
  it('returns the latest complete snapshot across chapters without a run pointer and prevents caching private text', async () => {
    const empty = await call('GET', null, session, {}, '?latest=1');
    expect(empty.status).toBe(200);
    expect(empty.headers.get('cache-control')).toBe('no-store');
    expect(await empty.json()).toEqual({ copy: null });
    const older = input(); older.texts[0] = 'Phẩm đầu';
    await call('PUT', older);
    const newer = { ...input(), chapter: 2, texts: book.chapters[1].blocks.map(() => '') };
    newer.texts[0] = 'Phẩm hai đã lưu';
    const saved = await call('PUT', newer);
    const ack = await saved.json();
    await env.DB.prepare('UPDATE scripture_copy_chapters SET saved_at = ? WHERE run_id = ?')
      .bind('2000-01-01T00:00:00.000Z', older.runId).run();
    const latest = await call('GET', null, session, {}, '?latest=1');
    expect(latest.status).toBe(200);
    expect(latest.headers.get('cache-control')).toBe('no-store');
    expect(await latest.json()).toEqual({ copy: { sutraId: book.id, chapter: 2, runId: newer.runId,
      sourceVersion: book.version, texts: newer.texts, ...ack } });
    const other = await call('GET', null, { ...session, appUserId: 'copy-b' }, {}, '?latest=1');
    expect(await other.json()).toEqual({ copy: null });
    const oldRead = await call('GET', null, session, {}, `?sutra=dia-tang&chapter=1&run=${older.runId}`);
    expect(oldRead.headers.get('cache-control')).toBe('no-store');
    expect((await oldRead.json()).copy).toMatchObject({ runId: older.runId, texts: older.texts });
    const oldList = await call('GET', null, session, {}, '?sutra=dia-tang&chapter=1');
    expect(oldList.headers.get('cache-control')).toBe('no-store');
    expect(await oldList.json()).toMatchObject({ copies: [{ runId: older.runId }], nextCursor: null });
  });
});
