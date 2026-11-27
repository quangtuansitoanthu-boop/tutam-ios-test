import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { serverStateKeys } from '$lib/browser/server-state';
import { MindfulCommunityError } from '$lib/browser/mindful-community-client';
import type { MindfulPost, MindfulPostPage } from '$lib/contracts/mindful-community';
import Harness from './mindful-query-harness.svelte';

const mocks = vi.hoisted(() => ({ read: vi.fn(), remove: vi.fn(), react: vi.fn() }));
vi.mock('$lib/stores/locale.svelte', () => ({ getLocaleContext: () => ({ current: 'vi' }) }));
vi.mock('$lib/stores/session.svelte', () => ({ getBrowserSessionSnapshot: () => ({ user: { id: 'A' } }), SESSION_CHANGE_EVENT: 'session-changed' }));
vi.mock('$lib/browser/mindful-community-client', async importOriginal => ({
  MindfulCommunityError: (await importOriginal<typeof import('$lib/browser/mindful-community-client')>()).MindfulCommunityError,
  fetchMindfulPosts: mocks.read, deleteMindfulPost: mocks.remove, sendMindfulReaction: mocks.react,
  MINDFUL_COMMUNITY_QUERY_POLICY: { staleTime: 15 * 60_000, retry: false },
}));
const page: MindfulPostPage = { enabled: true, nextCursor: null, items: [{ id: 'p', kind: 'repentance', nickname: 'Đồng Tu',
  content: 'Bài gốc', createdAt: new Date().toISOString(), reactionCount: 0, viewerReacted: false, isOwn: true, status: 'published' }] };
const key = serverStateKeys.mindfulCommunity.posts('A', 'repentance');
const ownKey = serverStateKeys.mindfulCommunity.posts('A', 'mine');
let client: QueryClient; let component: ReturnType<typeof Harness> | undefined;
let finishRead: (value: MindfulPostPage) => void;
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); flushSync(); };
const pendingPost = (): MindfulPost => ({ ...page.items[0], id: 'pending', content: 'Bản chờ xét duyệt chưa công khai',
  status: 'hidden', reviewState: 'pending', reviewDueAt: new Date(Date.now() + 60_000).toISOString() });
async function setup(canModerate = false) {
  component = mount(Harness, { target: document.body, props: { client, canModerate } }); await settle();
}
function setOwnPosts(items: MindfulPost[]) {
  client.setQueryData(ownKey, { pages: [{ ...page, items }], pageParams: [null] });
}
async function showOwnPosts(items: MindfulPost[]) {
  setOwnPosts(items);
  [...document.querySelectorAll<HTMLButtonElement>('nav button')].find(button => button.textContent === 'Bài của tôi')!.click(); await settle();
}
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(key, { pages: [page], pageParams: [null] }, { updatedAt: 1 });
  mocks.read.mockImplementation(() => new Promise<MindfulPostPage>(resolve => { finishRead = resolve; }));
  mocks.remove.mockResolvedValue(undefined);
  mocks.react.mockResolvedValue({ postId: 'p', reactionCount: 1, viewerReacted: true, templateId: 'tam-bao' });
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined; client.clear(); document.body.replaceChildren(); vi.restoreAllMocks();
});

it.each(['remove', 'react'] as const)('does not let a delayed pre-mutation feed undo confirmed %s', async action => {
  await setup(action === 'remove');
  expect(mocks.read).toHaveBeenCalledOnce();
  const button = document.querySelector<HTMLButtonElement>(action === 'remove' ? 'article .remove' : 'article .actions button');
  button!.click(); await settle();
  document.querySelector<HTMLButtonElement>('.practice-confirm__primary')!.click(); await settle();
  expect(action === 'remove' ? mocks.remove : mocks.react).toHaveBeenCalledOnce();
  finishRead(page); await settle();
  const items = client.getQueryData<{ pages: MindfulPostPage[] }>(key)!.pages[0].items;
  if (action === 'remove') expect(items).toEqual([]);
  else expect(items[0]).toMatchObject({ reactionCount: 1, viewerReacted: true });
  expect(mocks.read).toHaveBeenCalledOnce();
});

it('keeps pending writing private and lets the author withdraw it from cached own posts', async () => {
  await setup();
  const pending = pendingPost();
  const other: MindfulPost = { ...page.items[0], id: 'other', content: 'Bài của người khác', isOwn: false };
  finishRead({ ...page, items: [pending, other, ...page.items] }); await settle();
  expect(document.body.textContent).not.toContain(pending.content);
  expect(document.querySelectorAll('article')).toHaveLength(2);
  expect(document.querySelector('article .remove')).toBeNull();
  const legacyHidden: MindfulPost = { ...page.items[0], id: 'legacy-hidden', status: 'hidden' };
  const otherPosts = [...page.items, legacyHidden];
  await showOwnPosts([pending, ...otherPosts]);
  expect(document.body.textContent).toContain(pending.content);
  expect(document.querySelector(`article [data-review-state=pending] time[datetime="${pending.reviewDueAt}"]`)).not.toBeNull();
  expect(document.querySelectorAll('article .react')).toHaveLength(1);
  expect(document.querySelectorAll('article .remove')).toHaveLength(1);
  const withdraw = document.querySelector<HTMLButtonElement>('article .remove');
  expect(withdraw?.textContent ?? '').toContain('Rút bài');
  withdraw!.click(); await settle();
  expect(mocks.remove).not.toHaveBeenCalled();
  document.querySelector<HTMLButtonElement>('.practice-confirm__primary')!.click(); await settle();
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(pending.id, { signal: expect.any(AbortSignal) });
  expect(client.getQueryData<{ pages: MindfulPostPage[] }>(ownKey)!.pages[0].items).toEqual(otherPosts);
  expect(mocks.read).toHaveBeenCalledTimes(1);
});

it('removes only the author’s rejected share after confirmation', async () => {
  await setup();
  const rejected: MindfulPost = { ...pendingPost(), id: 'rejected', content: 'Bài bị từ chối', reviewState: 'rejected' };
  const other = { ...rejected, id: 'other-rejected', isOwn: false };
  finishRead({ ...page, items: [rejected, other, ...page.items] }); await settle();
  expect(document.body.textContent).not.toContain(rejected.content);
  await showOwnPosts([rejected, other, ...page.items]);
  const buttons = document.querySelectorAll<HTMLButtonElement>('article .remove');
  expect(buttons).toHaveLength(1);
  expect(buttons[0].textContent).toContain('Gỡ bài');
  buttons[0].click(); await settle();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(document.querySelector('.practice-confirm')?.textContent).toContain('Nhật ký riêng trên máy được giữ nguyên.');
  document.querySelector<HTMLButtonElement>('.practice-confirm__primary')!.click(); await settle();
  expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(rejected.id, { signal: expect.any(AbortSignal) });
  expect(client.getQueryData<{ pages: MindfulPostPage[] }>(ownKey)!.pages[0].items).toEqual([other, ...page.items]);
  expect(mocks.read).toHaveBeenCalledOnce();
});

it.each(['approved in cache', 'public on the server', 'still pending on the server'] as const)('honors the current review state at confirmation (%s)', async state => {
  await setup();
  finishRead(page); await settle();
  const pending = pendingPost();
  if (state !== 'approved in cache') pending.reviewDueAt = new Date(Date.now() - 60_000).toISOString();
  await showOwnPosts([pending]);
  document.querySelector<HTMLButtonElement>('article .remove')!.click(); await settle();
  const published: MindfulPost = { ...pending, status: 'published', reviewState: 'approved' };
  if (state === 'approved in cache') setOwnPosts([published]);
  if (state === 'public on the server') mocks.remove.mockRejectedValueOnce(new MindfulCommunityError(404, 'mindful_post_unavailable'));
  await settle();
  document.querySelector<HTMLButtonElement>('.practice-confirm__primary')!.click(); await settle();
  expect(mocks.remove).toHaveBeenCalledTimes(state === 'approved in cache' ? 0 : 1);
  expect(document.querySelector('.practice-confirm')).toBeNull();
  const alert = document.querySelector('.error-banner');
  const remaining = client.getQueryData<{ pages: MindfulPostPage[] }>(ownKey)!.pages[0].items;
  if (state === 'still pending on the server') {
    expect(alert).toBeNull();
    expect(remaining).toEqual([]);
  } else {
    expect(alert?.textContent).toContain('Bài này không còn ở trạng thái có thể rút hoặc gỡ.');
    expect(remaining).toEqual([state === 'approved in cache' ? published : pending]);
  }
  expect(mocks.read).toHaveBeenCalledTimes(1);
});

it('disables withdrawal offline and protects an already-open confirmation', async () => {
  const connection = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  await setup();
  finishRead(page); await settle();
  await showOwnPosts([pendingPost()]);
  const withdraw = document.querySelector<HTMLButtonElement>('article .remove')!;
  withdraw.click(); await settle();
  connection.mockReturnValue(false);
  try {
    window.dispatchEvent(new Event('offline')); await settle();
    expect(withdraw.disabled).toBe(true);
    document.querySelector<HTMLButtonElement>('.practice-confirm__primary')!.click(); await settle();
    expect(mocks.remove).not.toHaveBeenCalled();
  } finally {
    connection.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
  }
});

it('keeps a fully filtered page open for explicit pagination to an older visible post', async () => {
  await setup();
  finishRead({ enabled: true, items: [], nextCursor: 'after-blocked-prefix' });
  await vi.waitFor(() => expect(document.querySelector('article')).toBeNull());
  expect(document.body.textContent).not.toContain('Chưa có bài chia sẻ.');
  const more = document.querySelector<HTMLButtonElement>('button.more')!;
  expect(more.disabled).toBe(false);
  expect(mocks.read).toHaveBeenCalledTimes(1);
  mocks.read.mockResolvedValueOnce({ ...page, items: [{ ...page.items[0], id: 'older-visible', content: 'Bài cũ vẫn hiển thị sau nhóm đã chặn' }] });
  more.click();
  await vi.waitFor(() => expect(document.querySelector('article .content')?.textContent).toBe('Bài cũ vẫn hiển thị sau nhóm đã chặn'));
  expect(mocks.read).toHaveBeenCalledTimes(2);
  expect(mocks.read.mock.calls[1][0]).toMatchObject({ after: 'after-blocked-prefix', kind: 'repentance', mine: false });
  expect(document.querySelector('button.more')).toBeNull();
});
