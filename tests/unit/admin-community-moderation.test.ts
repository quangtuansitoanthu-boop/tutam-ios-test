import { describe, expect, it, vi } from 'vitest';
import { createAdminCommunityModerationService } from '../../src/lib/server/services/admin-community-moderation';

const repository = () => ({ listModerationQueue: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
  moderate: vi.fn().mockResolvedValue(true) });
const service = (role: string | null = 'admin', repo = repository()) => createAdminCommunityModerationService({
  env: { DB: { prepare: vi.fn() } }, principal: role ? { appUserId: 'admin-a', role } : null,
} as never, { repository: repo as never, now: () => new Date('2026-11-04T00:00:00Z') });
describe('admin moderation authorization and stale-decision boundaries', () => {
  it.each([null, 'user', 'ctv'])('rejects queue reads and decisions for %s before SQL', async role => {
    const repo = repository();
    await expect(service(role, repo).list('comments')).rejects.toMatchObject({ status: role ? 403 : 401 });
    await expect(service(role, repo).decide('comments', '1', { action: 'approve', revision: 1 })).rejects.toMatchObject({ status: role ? 403 : 401 });
    expect(repo.listModerationQueue).not.toHaveBeenCalled(); expect(repo.moderate).not.toHaveBeenCalled();
  });
  it('passes a bounded admin queue and the current actor without fetching each row', async () => {
    const repo = repository();
    await expect(service('admin', repo).list('comments', { limit: 1000 })).resolves.toEqual({ items: [], nextCursor: null });
    expect(repo.listModerationQueue).toHaveBeenCalledExactlyOnceWith('comments', 'admin-a', { after: null, limit: 50 });
  });
  it.each([
    ['reports', { action: 'approve', revision: 1 }],
    ['comments', { action: 'resolve', revision: 1 }],
    ['profiles', { action: 'reject', revision: 1, reason: '' }],
    ['comments', { action: 'approve', revision: 0 }],
  ])('rejects incompatible action or missing explanation %s %j', async (kind, input) => {
    const repo = repository();
    await expect(service('admin', repo).decide(kind, '1', input)).rejects.toMatchObject({ status: 400 });
    expect(repo.moderate).not.toHaveBeenCalled();
  });
  it('uses optimistic revision and does not silently approve a replaced candidate', async () => {
    const repo = repository(); repo.moderate.mockResolvedValue(false);
    await expect(service('admin', repo).decide('profiles', 'public-a', { action: 'approve', revision: 1 })).rejects.toMatchObject({ status: 409 });
    expect(repo.moderate).toHaveBeenCalledExactlyOnceWith('profiles', 'public-a', { action: 'approve', revision: 1, reason: '' }, 'admin-a', '2026-11-04T00:00:00.000Z');
  });
  it.each([undefined, null, ''])('accepts the approved hide confirmation with optional reason %j', async reason => {
    const repo = repository();
    await expect(service('admin', repo).decide('comments', '1', { action: 'hide', revision: 1, reason })).resolves.toEqual({ updated: true });
    expect(repo.moderate).toHaveBeenCalledExactlyOnceWith('comments', '1', { action: 'hide', revision: 1, reason: '' }, 'admin-a', '2026-11-04T00:00:00.000Z');
  });
});

const mindfulRepository = () => ({
  list: vi.fn().mockResolvedValue({ items: [], nextCursor: null, summary: { pending: { count: 0, capped: false }, published: { count: 0, capped: false } } }),
  decide: vi.fn().mockResolvedValue({ updated: true }),
  prepareApproveAll: vi.fn().mockResolvedValue({ operationId: 'approve-all-a', cutoff: '2026-11-21T12:00:00.000Z',
    summary: { count: 99, capped: true }, expiresAt: '2026-11-22T12:00:00.000Z' }),
  approveAll: vi.fn().mockResolvedValue({ updated: 0, conflicted: 0, nextCursor: null,
    cutoff: '2026-11-21T12:00:00.000Z', operationId: 'approve-all-a' }),
});
function mindfulAdmin(role: string | null = 'admin', mindful = mindfulRepository(), legacy = repository()) {
  return { mindful, legacy, admin: createAdminCommunityModerationService({
    env: { DB: { prepare: vi.fn() } }, principal: role ? { appUserId: 'admin-a', role } : null,
  } as never, { repository: legacy, mindfulService: mindful, now: () => new Date('2026-11-21T12:00:00Z') } as never) };
}

describe('mindful admin queue integration preserves authorization and CAS', () => {
  it.each([null, 'user', 'ctv'])('rejects mindful list, one and all before repositories for %s', async role => {
    const { admin, mindful, legacy } = mindfulAdmin(role);
    const status = role ? 403 : 401;
    await expect(admin.list('mindful', { state: 'pending' } as never)).rejects.toMatchObject({ status });
    await expect(admin.decide('mindful', 'post-a', { action: 'approve', revision: 1 })).rejects.toMatchObject({ status });
    await expect(admin.prepareApproveAll({ operationId: 'approve-all-a' })).rejects.toMatchObject({ status });
    await expect(admin.approveAll({ operationId: 'approve-all-a' })).rejects.toMatchObject({ status });
    expect(mindful.list).not.toHaveBeenCalled(); expect(mindful.decide).not.toHaveBeenCalled();
    expect(mindful.approveAll).not.toHaveBeenCalled(); expect(mindful.prepareApproveAll).not.toHaveBeenCalled();
    expect(legacy.moderate).not.toHaveBeenCalled();
  });
  it('filters pending/published kinds before pagination through the core owner and maps only the admin DTO', async () => {
    const { admin, mindful, legacy } = mindfulAdmin();
    mindful.list.mockResolvedValue({ items: [{ id: 'post-a', kind: 'repentance', nickname: 'Đồng tu',
      content: 'Nội dung cần duyệt', createdAt: '2026-11-21T10:00:00Z', reactionCount: 0,
      viewerReacted: false, isOwn: false, status: 'hidden', publishedAt: null, reviewState: 'pending',
      reviewDueAt: '2026-11-23T10:00:00Z', reviewRevision: 2, reviewReason: null, policyCode: null,
      member: { id: 'owner-a', name: 'Member A', role: 'user', status: 'active', isSelf: false },
    }] as never, nextCursor: 'cursor-a', summary: { pending: { count: 99, capped: true }, published: { count: 3, capped: false } } });
    const page = await admin.list('mindful', { state: 'pending', postKind: 'repentance', after: 'cursor-old', limit: 20 } as never);
    expect(mindful.list).toHaveBeenCalledExactlyOnceWith('pending', { after: 'cursor-old', limit: 20, kind: 'repentance' });
    expect(legacy.listModerationQueue).not.toHaveBeenCalled();
    expect(page).toEqual({ items: [{ id: 'post-a', kind: 'mindful', mindfulKind: 'repentance', revision: 2,
      submittedAt: '2026-11-21T10:00:00Z', displayName: 'Đồng tu', avatarUrl: '', content: 'Nội dung cần duyệt',
      articleId: null, moderationStatus: 'pending', publishedAt: null, reviewDueAt: '2026-11-23T10:00:00Z',
      reviewState: 'pending', reviewReason: null, policyCode: null,
      member: { id: 'owner-a', name: 'Member A', role: 'user', status: 'active', isSelf: false },
    }], nextCursor: 'cursor-a', summary: { pending: { count: 99, capped: true }, published: { count: 3, capped: false } } });
    await admin.list('mindful', { state: 'published', postKind: 'good_deed', limit: 1000 } as never);
    expect(mindful.list).toHaveBeenLastCalledWith('published', { after: null, limit: 50, kind: 'good_deed' });
  });
  it.each([
    { state: 'unknown' }, { state: 'rejected' }, { postKind: 'unknown' },
  ])('rejects out-of-scope mindful queue filters %j before core reads', async options => {
    const { admin, mindful } = mindfulAdmin();
    await expect(admin.list('mindful', options as never)).rejects.toMatchObject({ status: 400 });
    expect(mindful.list).not.toHaveBeenCalled();
  });
  it.each(['approve', 'delete'])('delegates mindful %s with the exact revision and stable operation identifier', async action => {
    const { admin, mindful, legacy } = mindfulAdmin();
    const body = { action, revision: 4, operationId: 'decision-a' };
    await expect(admin.decide('mindful', 'post-a', body)).resolves.toEqual({ updated: true });
    expect(mindful.decide).toHaveBeenCalledExactlyOnceWith('post-a', body);
    expect(legacy.moderate).not.toHaveBeenCalled();
  });
  it.each([
    { action: 'reject', revision: 1 }, { action: 'reject', revision: 1, reason: ' ' },
    { action: 'hide', revision: 1 }, { action: 'approve', revision: 0 },
    { action: 'delete', revision: 1, status: 'published' },
  ])('rejects invalid mindful decisions before the core mutation %j', async body => {
    const { admin, mindful } = mindfulAdmin();
    await expect(admin.decide('mindful', 'post-a', body)).rejects.toMatchObject({ status: 400 });
    expect(mindful.decide).not.toHaveBeenCalled();
  });
  it('preserves explicit rejection reason and returns a cron/admin CAS conflict without replay', async () => {
    const { admin, mindful } = mindfulAdmin();
    mindful.decide.mockRejectedValue({ status: 409, code: 'moderation_conflict' });
    await expect(admin.decide('mindful', 'post-a', { action: 'reject', revision: 2, reason: 'Cần sửa nội dung' }))
      .rejects.toMatchObject({ status: 409 });
    expect(mindful.decide).toHaveBeenCalledTimes(1);
  });
  it('resumes all filtered matching pending rows across 100+1 chunks only after an explicit next call', async () => {
    const { admin, mindful } = mindfulAdmin();
    const cutoff = '2026-11-21T12:00:00.000Z';
    mindful.approveAll.mockResolvedValueOnce({ updated: 100, conflicted: 0, nextCursor: 'page-2', cutoff, operationId: 'approve-all-a' })
      .mockResolvedValueOnce({ updated: 1, conflicted: 1, nextCursor: null, cutoff, operationId: 'approve-all-a' });
    await expect(admin.approveAll({ operationId: 'approve-all-a', postKind: 'repentance', cutoff })).resolves
      .toEqual({ updated: 100, conflicted: 0, nextCursor: 'page-2', cutoff, operationId: 'approve-all-a' });
    expect(mindful.approveAll).toHaveBeenCalledTimes(1);
    await expect(admin.approveAll({ operationId: 'approve-all-a', postKind: 'repentance', cutoff, after: 'page-2' })).resolves
      .toEqual({ updated: 1, conflicted: 1, nextCursor: null, cutoff, operationId: 'approve-all-a' });
    expect(mindful.approveAll.mock.calls).toEqual([
      [{ operationId: 'approve-all-a', kind: 'repentance', cutoff }],
      [{ operationId: 'approve-all-a', kind: 'repentance', cutoff, after: 'page-2' }],
    ]);
  });
  it('prepares a server snapshot before confirmation without making any post decision', async () => {
    const { admin, mindful } = mindfulAdmin();
    await expect(admin.prepareApproveAll({ operationId: 'approve-all-a', postKind: 'good_deed' })).resolves.toEqual({
      operationId: 'approve-all-a', cutoff: '2026-11-21T12:00:00.000Z',
      summary: { count: 99, capped: true }, expiresAt: '2026-11-22T12:00:00.000Z',
    });
    expect(mindful.prepareApproveAll).toHaveBeenCalledExactlyOnceWith({ operationId: 'approve-all-a', kind: 'good_deed' });
    expect(mindful.approveAll).not.toHaveBeenCalled(); expect(mindful.decide).not.toHaveBeenCalled();
  });
  it.each([{}, { operationId: '' }, { operationId: 'batch-a', postKind: 'other' },
    { operationId: 'batch-a', cutoff: '2026-11-21T12:00:00Z', after: 'x'.repeat(513) },
    { operationId: 'batch-a', items: [{ id: 'visible-page-only', revision: 1 }] },
    { operationId: 'batch-a', action: 'delete' }])('does not broaden approve-all with malformed or page-only payload %j', async body => {
    const { admin, mindful } = mindfulAdmin();
    await expect(admin.approveAll(body)).rejects.toMatchObject({ status: 400 });
    expect(mindful.approveAll).not.toHaveBeenCalled();
  });
});
