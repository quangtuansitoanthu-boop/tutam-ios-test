import type { CloudflareRequestContext, D1ResultRow } from '../cloudflare-context';
import { ServerInputError } from '../errors';
import { createMindfulModerationRepository } from '../repositories/mindful-moderation-repository';

export interface AdminNotificationItem {
  badge: string;
  id: string;
  level: 'info' | 'warning' | 'error' | 'success';
  link: string;
  message: string;
  timestamp: string;
  title: string;
  type: 'pending_article' | 'rejected_article' | 'approved_article' | 'new_member' | 'pending_mindful';
}

export interface AdminNotificationsResponse {
  notifications: AdminNotificationItem[];
  total: number;
}

export async function getAdminNotifications(
  context: CloudflareRequestContext,
): Promise<AdminNotificationsResponse> {
  const session = context.principal;
  if (!session) {
    throw new ServerInputError(401, 'authentication_required', 'Cần đăng nhập.');
  }
  const role = session.role;
  const env = context.env;
  const notifications: AdminNotificationItem[] = [];

  if (role === 'admin') {
    // 1. Pending articles for Admin approval
    try {
      const pendingArticles = await env.DB.prepare(`
        SELECT id, tieu_de, tac_gia, trang_thai, created_at, updated_at, ngay_dang
        FROM baiviet
        WHERE trang_thai = 'Chờ duyệt'
        ORDER BY COALESCE(updated_at, created_at, ngay_dang) DESC
        LIMIT 20
      `).all<D1ResultRow>();

      for (const row of pendingArticles.results ?? []) {
        const id = String(row.id);
        const title = String(row.tieu_de || 'Bài viết chưa đặt tên');
        const author = String(row.tac_gia || 'Quản trị viên');
        const timestamp = String(row.updated_at || row.created_at || row.ngay_dang || new Date().toISOString());

        notifications.push({
          id: `article-pending-${id}`,
          type: 'pending_article',
          title: 'Bài viết chờ duyệt',
          message: `“${title}” của tác giả ${author} đang chờ bạn duyệt và phát hành.`,
          timestamp,
          link: `/admin/books?tab=pending&book=${encodeURIComponent(id)}`,
          badge: '⏳',
          level: 'warning',
        });
      }
    } catch (error) {
      warnNotificationFailure('admin_notifications_pending_articles_failed', error);
    }

    // Reuse the current notifications read: one bounded query, no per-post fanout.
    try {
      const pendingMindful = await createMindfulModerationRepository(env).pendingNotifications(20, new Date().toISOString());
      for (const row of pendingMindful) {
        notifications.push({
          id: `mindful-pending-${row.id}`,
          type: 'pending_mindful',
          title: 'Bài quán chiếu chờ duyệt',
          message: `${row.kind === 'repentance' ? 'Bài sám hối' : 'Bài việc thiện'} của “${row.nickname}” đang chờ kiểm duyệt.`,
          timestamp: row.createdAt,
          link: '/admin/community?moderation=mindful',
          badge: '⏳', level: 'warning',
        });
      }
    } catch (error) {
      warnNotificationFailure('admin_notifications_pending_mindful_failed', error);
    }

    // 2. New members recently joined
    try {
      const recentUsers = await env.DB.prepare(`
        SELECT id, display_name, email, role, avatar_url, created_at
        FROM app_users
        ORDER BY created_at DESC
        LIMIT 10
      `).all<D1ResultRow>();

      for (const row of recentUsers.results ?? []) {
        const id = String(row.id);
        const name = String(row.display_name || row.email || 'Thành viên mới');
        const timestamp = String(row.created_at || new Date().toISOString());

        notifications.push({
          id: `user-new-${id}`,
          type: 'new_member',
          title: 'Thành viên mới',
          message: `“${name}” vừa đăng ký tài khoản trên hệ thống.`,
          timestamp,
          link: '/admin/members',
          badge: '👤',
          level: 'info',
        });
      }
    } catch (error) {
      warnNotificationFailure('admin_notifications_recent_users_failed', error);
    }
  }

  // Sort by newest timestamp first
  notifications.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  return {
    notifications,
    total: notifications.length,
  };
}

function warnNotificationFailure(event: string, error: unknown): void {
  const name = error instanceof Error ? error.name : 'UnknownError';
  console.warn(JSON.stringify({ level: 'warn', event, name }));
}
