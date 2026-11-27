import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  filterNotifications,
  notificationCategoryForType,
  notificationCategoryLabel,
  notificationEmptyState,
  notificationTabsForRole,
  tabUnreadCount,
} from '../../../src/lib/domain/notifications/notification-filters';

const sampleItems = [
  { id: 'm1', type: 'new_member' },
  { id: 'm2', type: 'new_member' },
  { id: 'a1', type: 'pending_article' },
  { id: 'a2', type: 'pending_mindful' },
  { id: 'r1', type: 'lunar_via' },
  { id: 'r2', type: 'practice_morning' },
  { id: 'c1', type: 'mindful_prayer' },
];

describe('notification filter domain helpers', () => {
  it('returns 4 equal tabs for admin and 3 equal tabs for personal users', () => {
    expect(notificationTabsForRole(true)).toEqual(['unread', 'member', 'approval', 'all']);
    expect(notificationTabsForRole(false)).toEqual(['unread', 'reminder', 'all']);
  });

  it('classifies notification types into clean domain categories', () => {
    expect(notificationCategoryForType('new_member')).toBe('member');
    expect(notificationCategoryForType('pending_article')).toBe('approval');
    expect(notificationCategoryForType('pending_mindful')).toBe('approval');
    expect(notificationCategoryForType('lunar_via')).toBe('reminder');
    expect(notificationCategoryForType('lunar_ram')).toBe('reminder');
    expect(notificationCategoryForType('lunar_mung1')).toBe('reminder');
    expect(notificationCategoryForType('lunar_chay')).toBe('reminder');
    expect(notificationCategoryForType('lunar_abstinence')).toBe('reminder');
    expect(notificationCategoryForType('practice_morning')).toBe('reminder');
    expect(notificationCategoryForType('practice_evening')).toBe('reminder');
    expect(notificationCategoryForType('mindful_rejoice')).toBe('community');
  });

  it('filters notifications and counts unread items per tab accurately', () => {
    const readIds = new Set(['m2', 'r2']);
    expect(filterNotifications(sampleItems, 'unread', readIds).map(i => i.id)).toEqual(['m1', 'a1', 'a2', 'r1', 'c1']);
    expect(filterNotifications(sampleItems, 'member', readIds).map(i => i.id)).toEqual(['m1', 'm2']);
    expect(filterNotifications(sampleItems, 'approval', readIds).map(i => i.id)).toEqual(['a1', 'a2']);
    expect(filterNotifications(sampleItems, 'reminder', readIds).map(i => i.id)).toEqual(['r1', 'r2']);
    expect(filterNotifications(sampleItems, 'all', readIds)).toHaveLength(7);

    expect(tabUnreadCount(sampleItems, 'unread', readIds)).toBe(5);
    expect(tabUnreadCount(sampleItems, 'member', readIds)).toBe(1);
    expect(tabUnreadCount(sampleItems, 'approval', readIds)).toBe(2);
    expect(tabUnreadCount(sampleItems, 'reminder', readIds)).toBe(1);
    expect(tabUnreadCount(sampleItems, 'all', readIds)).toBe(0);
  });

  it('provides localized labels and contextual empty states', () => {
    expect(notificationCategoryLabel('new_member', false)).toBe('Thành viên');
    expect(notificationCategoryLabel('pending_article', false)).toBe('Phê duyệt');
    expect(notificationCategoryLabel('lunar_ram', false)).toBe('Ngày lễ');
    expect(notificationCategoryLabel('practice_evening', false)).toBe('Tu tập');
    expect(notificationCategoryLabel('mindful_prayer', false)).toBe('Cộng đồng');

    expect(notificationEmptyState('unread', 5, false).showViewAll).toBe(true);
    expect(notificationEmptyState('member', 5, false).showViewAll).toBe(false);
    expect(notificationEmptyState('approval', 0, false).title).toContain('phê duyệt');
    expect(notificationEmptyState('reminder', 0, false).title).toContain('nhắc nhở');
  });

  it('wires NotificationBell to the single-row segmented iOS-badge UI without left vertical bars or visible scrollbar', () => {
    const svelte = readFileSync('src/lib/components/notifications/NotificationBell.svelte', 'utf8');
    expect(svelte).toContain('seg-track');
    expect(svelte).toContain('tab-ios-badge');
    expect(svelte).toMatch(/scrollbar-width:\s*none/u);
    expect(svelte).toContain('::-webkit-scrollbar');
    expect(svelte).not.toContain('.notification-item.unread::before');

    const homeReminders = readFileSync('src/lib/components/home/HomeDailyReminders.svelte', 'utf8');
    expect(homeReminders).toMatch(/\.personal-count-pill[\s\S]*?#ff3b30/u);
  });
});
