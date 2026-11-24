import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import application from '../../migrations/0001-application-schema.sql?raw';
import auth from '../../migrations/0002-auth-and-session-schema.sql?raw';
import members from '../../migrations/0026-member-status.sql?raw';
import mindful from '../../migrations/0041-mindful-community.sql?raw';
import review from '../../migrations/0047-mindful-review.sql?raw';
import { handleApiRequest } from '../../src/lib/server/http/api-handler.ts';

const origin = 'http://localhost:8787';
const principal = (role = 'admin') => ({
  appUserId: role === 'admin' ? 'admin-a' : 'member-a', userId: 'test-user', role,
  csrfToken: 'local-mindful-csrf', displayName: 'Local fixture',
});
const route = (path, { method = 'GET', body, actor = principal(), csrf = true } = {}) => handleApiRequest({
  request: new Request(`${origin}${path}`, { method,
    headers: { Origin: origin, 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': 'local-mindful-csrf' } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }),
  locals: { env: { ...env, APP_ORIGIN: origin }, session: actor, migrationSealed: true, requestId: 'mindful-admin-route' },
});
const queue = '/api/admin/community/moderation';
const preparePath = `${queue}/mindful/approve-all/prepare`;
const bulkPath = `${queue}/mindful/approve-all`;

beforeAll(async () => {
  await applyD1Migrations(env.DB, [application, auth, members, mindful, review].map((sql, index) => ({
    name: `mindful-admin-route-${index}.sql`, queries: sql.trim().split(/;\s*\n\s*\n/gu)
      .map(statement => statement.trim().endsWith(';') ? statement.trim() : `${statement.trim()};`),
  })));
});
async function seed(id, kind = 'repentance', published = false, createdAt = '2026-11-21T00:00:00.000Z') {
  await env.DB.prepare(`INSERT INTO mindful_posts
    (id,owner_id,client_post_id,kind,nickname,content,status,created_at,review_state,review_due_at,policy_state,published_at)
    VALUES (?,'member-a',?,?,'Đồng tu','Local synthetic content',?,?,?,?,'clear',?)`)
    .bind(id, id, kind, published ? 'published' : 'hidden', createdAt, published ? 'approved' : 'pending',
      published ? null : '2099-01-01T00:00:00.000Z', published ? createdAt : null).run();
}
beforeEach(async () => {
  for (const table of ['mindful_moderation_operations', 'mindful_moderation_audit', 'mindful_reactions', 'mindful_posts', 'app_users']) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  for (const [id, role] of [['admin-a', 'admin'], ['member-a', 'user']]) {
    await env.DB.prepare("INSERT INTO app_users(id,display_name,role,status) VALUES (?,? ,?,'active')").bind(id, id, role).run();
  }
  await seed('pending-a'); await seed('pending-b'); await seed('pending-good', 'good_deed');
  await seed('published-a', 'repentance', true);
});

describe('admin mindful routes keep native/web authorization and durable review operations', () => {
  it.each([null, 'user', 'ctv'])('denies list, prepare and mutations for %s without changing any post', async role => {
    const actor = role ? principal(role) : null;
    const expected = role ? 403 : 401;
    for (const [path, method, body] of [
      [`${queue}?kind=mindful`, 'GET'],
      [preparePath, 'POST', { operationId: 'operation-a' }],
      [bulkPath, 'POST', { operationId: 'operation-a', cutoff: '2026-11-21T00:00:00Z' }],
      [`${queue}/mindful/pending-a`, 'PATCH', { action: 'approve', revision: 1 }],
    ]) expect((await route(path, { method, body, actor })).status).toBe(expected);
    expect(await env.DB.prepare('SELECT COUNT(*) AS total FROM mindful_moderation_operations').first()).toEqual({ total: 0 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM mindful_posts WHERE review_state='pending'").first()).toEqual({ total: 3 });
  });
  it('returns both bounded state badges and applies the kind filter before paging', async () => {
    const response = await route(`${queue}?kind=mindful&state=pending&postKind=repentance&limit=1`);
    expect(response.status).toBe(200);
    const page = await response.json();
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ kind: 'mindful', mindfulKind: 'repentance', revision: 1, moderationStatus: 'pending' });
    expect(page.summary).toEqual({ pending: { count: 2, capped: false }, published: { count: 1, capped: false } });
    expect(page.nextCursor).toEqual(expect.any(String));
    const second = await route(`${queue}?kind=mindful&state=pending&postKind=repentance&limit=1&after=${encodeURIComponent(page.nextCursor)}`);
    const next = await second.json();
    expect(next.items).toHaveLength(1); expect(next.items[0].id).not.toBe(page.items[0].id);
    expect(next.nextCursor).toBeNull();
  });
  it('requires CSRF for prepare and leaves cancellation with no post decisions', async () => {
    expect((await route(preparePath, { method: 'POST', body: { operationId: 'operation-a' }, csrf: false })).status).toBe(403);
    const response = await route(preparePath, { method: 'POST', body: { operationId: 'operation-a', postKind: 'repentance' } });
    expect(response.status).toBe(200);
    const prepared = await response.json();
    expect(prepared).toMatchObject({ operationId: 'operation-a', summary: { count: 2, capped: false } });
    expect(Date.parse(prepared.expiresAt)).toBeGreaterThan(Date.parse(prepared.cutoff));
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM mindful_posts WHERE review_state='pending'").first()).toEqual({ total: 3 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS total FROM mindful_moderation_audit WHERE action<>'submitted'").first()).toEqual({ total: 0 });
  });
  it('keeps the prepared snapshot/filter on confirmation and excludes a later submission even at the same timestamp', async () => {
    const prepared = await (await route(preparePath, { method: 'POST', body: { operationId: 'operation-a', postKind: 'repentance' } })).json();
    await seed('later-same-timestamp', 'repentance', false, prepared.cutoff);
    const body = { operationId: prepared.operationId, cutoff: prepared.cutoff, postKind: 'repentance' };
    expect((await route(bulkPath, { method: 'POST', body, csrf: false })).status).toBe(403);
    const response = await route(bulkPath, { method: 'POST', body });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toEqual({ operationId: 'operation-a', cutoff: prepared.cutoff, updated: 2, conflicted: 0, nextCursor: null });
    expect(await (await route(bulkPath, { method: 'POST', body })).json()).toEqual(result);
    expect(await env.DB.prepare("SELECT id FROM mindful_posts WHERE review_state='pending' ORDER BY id").all())
      .toMatchObject({ results: [{ id: 'later-same-timestamp' }, { id: 'pending-good' }] });
    expect((await route(bulkPath, { method: 'POST', body: { ...body, postKind: 'good_deed' } })).status).toBe(409);
  });
  it('requires rejection reasons, preserves CAS conflicts, and deletes only the confirmed published target', async () => {
    const path = `${queue}/mindful/pending-a`;
    expect((await route(path, { method: 'PATCH', body: { action: 'reject', revision: 1, reason: ' ' } })).status).toBe(400);
    const decision = { action: 'approve', revision: 1, operationId: 'decision-a' };
    expect((await route(path, { method: 'PATCH', body: decision })).status).toBe(200);
    expect((await route(path, { method: 'PATCH', body: decision })).status).toBe(200);
    expect((await route(path, { method: 'PATCH', body: { action: 'reject', revision: 1, reason: 'Stale decision', operationId: 'different-a' } })).status).toBe(409);
    const deleted = await route(`${queue}/mindful/published-a`, { method: 'PATCH', body: { action: 'delete', revision: 1, operationId: 'remove-a' } });
    expect(deleted.status).toBe(200);
    expect(await env.DB.prepare("SELECT status,content FROM mindful_posts WHERE id='published-a'").first()).toEqual({ status: 'removed', content: '' });
    expect(await env.DB.prepare("SELECT status,content FROM mindful_posts WHERE id='pending-a'").first()).toEqual({ status: 'published', content: 'Local synthetic content' });
    expect((await route(bulkPath, { method: 'PATCH', body: decision })).status).toBe(405);
  });
});
