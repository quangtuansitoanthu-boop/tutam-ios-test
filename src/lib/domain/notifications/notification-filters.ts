export type NotificationCategory = 'member' | 'approval' | 'reminder' | 'community' | 'other';
export type NotificationFilterTab = 'unread' | 'member' | 'approval' | 'reminder' | 'all';

export interface NotificationFilterableItem {
  id: string;
  type: string;
}

const ADMIN_TABS: readonly NotificationFilterTab[] = ['unread', 'member', 'approval', 'all'];
const PERSONAL_TABS: readonly NotificationFilterTab[] = ['unread', 'reminder', 'all'];

const APPROVAL_TYPES = new Set(['pending_article', 'pending_mindful', 'approved_article', 'rejected_article']);
const REMINDER_TYPES = new Set([
  'lunar_via',
  'lunar_ram',
  'lunar_mung1',
  'lunar_chay',
  'lunar_abstinence',
  'practice_morning',
  'practice_evening',
]);

/** Return the fixed 1-row filter tabs appropriate for admin (4) vs personal (3) accounts. */
export function notificationTabsForRole(isAdmin: boolean): readonly NotificationFilterTab[] {
  return isAdmin ? ADMIN_TABS : PERSONAL_TABS;
}

/** Classify a notification item type into a top-level filter bucket. */
export function notificationCategoryForType(type: string): NotificationCategory {
  if (type === 'new_member') return 'member';
  if (APPROVAL_TYPES.has(type)) return 'approval';
  if (REMINDER_TYPES.has(type)) return 'reminder';
  if (type.startsWith('mindful_')) return 'community';
  return 'other';
}

/** Filter notification items according to the active tab without mutating the source array. */
export function filterNotifications<T extends NotificationFilterableItem>(
  items: readonly T[],
  filter: NotificationFilterTab,
  readIds: ReadonlySet<string>,
): T[] {
  if (filter === 'unread') return items.filter(item => !readIds.has(item.id));
  if (filter === 'all') return [...items];
  return items.filter(item => notificationCategoryForType(item.type) === filter);
}

/** Count unread notifications belonging to a tab; 'all' intentionally shows no badge. */
export function tabUnreadCount<T extends NotificationFilterableItem>(
  items: readonly T[],
  tab: NotificationFilterTab,
  readIds: ReadonlySet<string>,
): number {
  if (tab === 'all') return 0;
  if (tab === 'unread') return items.filter(item => !readIds.has(item.id)).length;
  return items.filter(item => !readIds.has(item.id) && notificationCategoryForType(item.type) === tab).length;
}

export function notificationTabLabel(tab: NotificationFilterTab, isEn: boolean): string {
  switch (tab) {
    case 'unread':
      return isEn ? 'Unread' : 'Chưa đọc';
    case 'member':
      return isEn ? 'Members' : 'Thành viên';
    case 'approval':
      return isEn ? 'Approvals' : 'Phê duyệt';
    case 'reminder':
      return isEn ? 'Reminders' : 'Nhắc nhở';
    case 'all':
      return isEn ? 'All' : 'Tất cả';
  }
}

export function notificationCategoryLabel(type: string, isEn: boolean): string {
  if (type === 'new_member') return isEn ? 'Member' : 'Thành viên';
  if (APPROVAL_TYPES.has(type)) return isEn ? 'Approval' : 'Phê duyệt';
  if (type === 'lunar_via' || type === 'lunar_ram' || type === 'lunar_mung1' || type === 'lunar_chay') {
    return isEn ? 'Feast Day' : 'Ngày lễ';
  }
  if (type === 'lunar_abstinence') return isEn ? 'Reminder' : 'Nhắc nhở';
  if (type.startsWith('practice_')) return isEn ? 'Practice' : 'Tu tập';
  if (type.startsWith('mindful_')) return isEn ? 'Community' : 'Cộng đồng';
  return isEn ? 'Notice' : 'Thông báo';
}

export function notificationEmptyState(
  filter: NotificationFilterTab,
  totalCount: number,
  isEn: boolean,
): { icon: string; title: string; description: string; showViewAll: boolean } {
  if (filter === 'unread' && totalCount > 0) {
    return {
      icon: '✨',
      title: isEn ? 'All caught up' : 'Đã xem hết thông báo mới',
      description: isEn
        ? 'Notifications read on this device stay synced across web and mobile.'
        : 'Thông báo đã xem trên thiết bị này sẽ được đồng bộ để không hiện lại.',
      showViewAll: true,
    };
  }
  switch (filter) {
    case 'member':
      return {
        icon: '👤',
        title: isEn ? 'No new members yet' : 'Chưa có thành viên mới',
        description: isEn ? 'Newly registered member accounts will appear here.' : 'Tài khoản đăng ký mới sẽ hiển thị tại đây.',
        showViewAll: false,
      };
    case 'approval':
      return {
        icon: '✅',
        title: isEn ? 'Nothing awaiting approval' : 'Không có mục chờ phê duyệt',
        description: isEn ? 'Pending articles and community posts are up to date.' : 'Bài viết và bài quán chiếu cần duyệt đã xử lý xong.',
        showViewAll: false,
      };
    case 'reminder':
      return {
        icon: '🪷',
        title: isEn ? 'No new reminders' : 'Không có nhắc nhở mới',
        description: isEn ? 'Lunar feasts and daily practice reminders appear here.' : 'Nhắc nhở ngày lễ âm lịch và thời khóa tu tập sẽ hiện ở đây.',
        showViewAll: false,
      };
    default:
      return {
        icon: '🔔',
        title: isEn ? 'No notifications yet' : 'Chưa có thông báo nào',
        description: isEn ? 'New notifications will appear here.' : 'Thông báo mới sẽ xuất hiện tại đây.',
        showViewAll: false,
      };
  }
}
