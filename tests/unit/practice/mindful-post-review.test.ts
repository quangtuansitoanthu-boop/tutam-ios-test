import { expect, it } from 'vitest';
import type { MindfulPost, MindfulPostPage } from '$lib/contracts/mindful-community';
import { isMindfulPostPublic, mergeMindfulReceiptPages, mindfulPostPublishedAt } from '$lib/domain/practice/mindful-post-review';

const post = (extra: Partial<MindfulPost> = {}): MindfulPost => ({
  id: 'new-post', kind: 'repentance', nickname: 'Đồng Tu', content: 'Private reflection',
  createdAt: '2026-11-21T09:00:00.000Z', reactionCount: 0, viewerReacted: false,
  isOwn: true, status: 'hidden', ...extra,
});
const pages: MindfulPostPage[] = [{ enabled: true, items: [post({ id: 'older', status: 'published' })], nextCursor: 'older-page' }];

it('keeps legacy visibility while refusing pending, rejected and removed review states in public feeds', () => {
  expect(isMindfulPostPublic(post({ status: 'published' }))).toBe(true);
  expect(isMindfulPostPublic(post({ status: 'published', reviewState: 'auto_approved' }))).toBe(true);
  for (const reviewState of ['pending', 'rejected', 'removed'] as const) {
    expect(isMindfulPostPublic(post({ status: 'published', reviewState }))).toBe(false);
  }
  expect(isMindfulPostPublic(post({ status: 'removed', reviewState: 'approved' }))).toBe(false);
});

it('adds accepted pending receipts only to owned pages while preserving pagination and old writing', () => {
  const receipt = post({ reviewState: 'pending', reviewDueAt: '2026-11-23T09:00:00.000Z' });
  expect(mergeMindfulReceiptPages(pages, receipt, 'repentance')[0].items.map(item => item.id)).toEqual(['older']);
  const mine = mergeMindfulReceiptPages(pages, receipt, 'mine');
  expect(mine[0]).toMatchObject({ nextCursor: 'older-page', enabled: true });
  expect(mine[0].items).toEqual([receipt, pages[0].items[0]]);
  expect(pages[0].items).toHaveLength(1);
  expect(mergeMindfulReceiptPages(pages, { ...receipt, isOwn: false }, 'mine')[0].items).toEqual(pages[0].items);
});

it('removes stale public copies without republishing a rejected receipt and deduplicates all owned pages', () => {
  const old = post({ status: 'published' });
  const cached = [{ ...pages[0], items: [old, ...pages[0].items] }, { ...pages[0], items: [old] }];
  const rejected = post({ reviewState: 'rejected', reviewReason: 'Private information' });
  expect(mergeMindfulReceiptPages(cached, rejected, 'repentance').flatMap(page => page.items).map(item => item.id)).toEqual(['older']);
  expect(mergeMindfulReceiptPages(cached, rejected, 'mine').flatMap(page => page.items).filter(item => item.id === rejected.id)).toEqual([rejected]);
  expect(mergeMindfulReceiptPages([{ ...pages[0], items: [old] }], rejected, 'repentance')[0])
    .toMatchObject({ items: [], nextCursor: 'older-page' });
});

it('uses the effective publication date for public order and falls back safely for installed legacy clients', () => {
  expect(mindfulPostPublishedAt(post({ status: 'published', publishedAt: '2026-11-23T09:00:00.000Z' })) ).toBe('2026-11-23T09:00:00.000Z');
  expect(mindfulPostPublishedAt(post())).toBe('2026-11-21T09:00:00.000Z');
  expect(mindfulPostPublishedAt(post({ publishedAt: 'invalid' }))).toBe('2026-11-21T09:00:00.000Z');
});
