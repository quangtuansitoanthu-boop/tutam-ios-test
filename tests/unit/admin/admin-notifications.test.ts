import { describe, expect, it, vi } from 'vitest';
import { getAdminNotifications } from '../../../src/lib/server/services/admin-notifications';
import type { CloudflareRequestContext } from '../../../src/lib/server/cloudflare-context';

describe('admin notifications service', () => {
  it('appends a bounded pending mindful notice in the existing read with exactly three business SQL calls', async () => {
    const statements: string[] = [];
    const parameters = new Map<string, unknown[]>();
    const prepare = vi.fn((sql: string) => {
      statements.push(sql);
      const statement = {
        bind: (...values: unknown[]) => { parameters.set(sql, values); return statement; },
        all: async () => ({ results: sql.includes('mindful_posts') ? [{
          id: 'post-pending', kind: 'repentance', nickname: 'Đồng tu',
          created_at: '2026-11-21T10:00:00Z', review_due_at: '2026-11-23T10:00:00Z',
        }] : [] }),
      };
      return statement;
    });
    const response = await getAdminNotifications({ env: { DB: { prepare } },
      principal: { appUserId: 'admin-a', role: 'admin' }, requestId: 'notice-budget',
    } as never);
    expect(statements).toHaveLength(3);
    expect(statements.filter(sql => sql.includes('mindful_posts'))).toHaveLength(1);
    const mindfulSql = statements.find(sql => sql.includes('mindful_posts'))!;
    expect(mindfulSql).toMatch(/LIMIT\s+(?:20\b|\?)/u);
    if (/LIMIT\s+\?/u.test(mindfulSql)) expect(parameters.get(mindfulSql)).toContain(20);
    expect(response.notifications).toEqual([expect.objectContaining({
      id: 'mindful-pending-post-pending', type: 'pending_mindful',
      link: '/admin/community?moderation=mindful', level: 'warning',
    })]);
    expect(response.total).toBe(1);
    expect(JSON.stringify(response)).not.toMatch(/owner_id|email|principalId/u);
  });
  it.each([null, 'user', 'ctv'])('does not issue mindful admin notice reads for %s', async role => {
    const statements: string[] = [];
    const prepare = vi.fn((sql: string) => {
      statements.push(sql);
      const statement = { bind: (..._values: unknown[]) => statement, all: async () => ({ results: [] }) };
      return statement;
    });
    const task = getAdminNotifications({ env: { DB: { prepare } },
      principal: role ? { appUserId: 'member-a', role } : null, requestId: 'notice-access',
    } as never);
    if (role) await expect(task).resolves.toEqual({ notifications: [], total: 0 });
    else await expect(task).rejects.toMatchObject({ status: 401 });
    expect(statements.some(sql => sql.includes('mindful_posts'))).toBe(false);
  });
  it('returns pending articles and new users for admin role', async () => {
    const mockEnv = {
      DB: {
        prepare: (sql: string) => {
          const statement = {
          bind: (..._values: unknown[]) => statement,
          all: async () => {
            if (sql.includes('FROM baiviet')) {
              return {
                results: [
                  { id: 'art-1', tieu_de: 'Kinh Pháp Cú', tac_gia: 'CTV1', trang_thai: 'Chờ duyệt', created_at: '2026-08-30T09:00:00Z' },
                ],
              };
            }
            if (sql.includes('FROM app_users')) {
              return {
                results: [
                  { id: 'user-1', display_name: 'Nguyen Van A', email: 'a@gmail.com', role: 'user', created_at: '2026-08-30T08:00:00Z' },
                ],
              };
            }
            return { results: [] };
          },
          };
          return statement;
        },
      },
    };

    const context: CloudflareRequestContext = {
      env: mockEnv as any,
      principal: {
        id: 'sess-1',
        userId: 'admin-1',
        appUserId: 'admin-1',
        displayName: 'Admin',
        email: 'admin@tutam.vn',
        role: 'admin',
        avatarUrl: null,
        expiresAt: '2026-09-01T00:00:00Z',
        csrfToken: 'token',
        rawToken: 'raw',
      },
      requestId: 'req-1',
    };

    const res = await getAdminNotifications(context);
    expect(res.notifications.length).toBe(2);
    expect(res.notifications[0].type).toBe('pending_article');
    expect(res.notifications[0].badge).toBe('⏳');
    expect(res.notifications[1].type).toBe('new_member');
    expect(res.notifications[1].badge).toBe('👤');
  });

  it('returns empty notifications with zero DB queries for non-admin and legacy ctv roles', async () => {
    let queried = false;
    const mockEnv = {
      DB: {
        prepare: () => {
          queried = true;
          return { bind: () => ({ all: async () => ({ results: [] }) }), all: async () => ({ results: [] }) };
        },
      },
    };
    for (const legacyRole of ['user', 'ctv']) {
      const res = await getAdminNotifications({
        env: mockEnv as any,
        principal: {
          id: 'sess-non-admin',
          userId: 'u-1',
          appUserId: 'u-1',
          displayName: 'Member User',
          email: 'member@tutam.vn',
          role: legacyRole as any,
          avatarUrl: null,
          expiresAt: '2026-09-01T00:00:00Z',
          csrfToken: 'token',
          rawToken: 'raw',
        },
        requestId: 'req-non-admin',
      });
      expect(res).toEqual({ notifications: [], total: 0 });
    }
    expect(queried).toBe(false);
  });
});
