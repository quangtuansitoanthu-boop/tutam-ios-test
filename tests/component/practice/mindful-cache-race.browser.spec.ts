import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { serverStateKeys } from '$lib/browser/server-state';
import type { MindfulPost, MindfulPostPage } from '$lib/contracts/mindful-community';
import Harness from './mindful-query-harness.svelte';

const mocks = vi.hoisted(() => ({ read: vi.fn(), remove: vi.fn(), react: vi.fn() }));
vi.mock('$lib/stores/locale.svelte', () => ({ getLocaleContext: () => ({ current: 'vi' }) }));
vi.mock('$lib/stores/session.svelte', () => ({ getBrowserSessionSnapshot: () => ({ user: { id: 'A' } }), SESSION_CHANGE_EVENT: 'session-changed' }));
vi.mock('$lib/browser/mindful-community-client', () => ({ fetchMindfulPosts: mocks.read, deleteMindfulPost: mocks.remove,
  sendMindfulReaction: mocks.react, MINDFUL_COMMUNITY_QUERY_POLICY: { staleTime: 15 * 60_000, retry: false } }));
const page: MindfulPostPage = { enabled: true, nextCursor: null, items: [{ id: 'p', kind: 'repentance', nickname: 'Đồng Tu',
  content: 'Bài gốc', createdAt: new Date().toISOString(), reactionCount: 0, viewerReacted: false, isOwn: true, status: 'published' }] };
const key = serverStateKeys.mindfulCommunity.posts('A', 'repentance');
let client: QueryClient; let component: ReturnType<typeof Harness>;
let finishRead: (value: MindfulPostPage) => void;
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); flushSync(); };
beforeEach(async () => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(key, { pages: [page], pageParams: [null] }, { updatedAt: 1 });
  mocks.read.mockImplementation(() => new Promise<MindfulPostPage>(resolve => { finishRead = resolve; }));
  mocks.remove.mockResolvedValue(undefined);
  mocks.react.mockResolvedValue({ postId: 'p', reactionCount: 1, viewerReacted: true, templateId: 'tam-bao' });
  component = mount(Harness, { target: document.body, props: { client } }); await settle();
});
afterEach(async () => { await unmount(component); client.clear(); document.body.replaceChildren(); });

it.each(['remove', 'react'] as const)('does not let a delayed pre-mutation feed undo confirmed %s', async action => {
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

it('keeps pending writing out of public UI and shows its receipt only in cached own posts without another read', async () => {
  const pending: MindfulPost = { ...page.items[0], id: 'pending', content: 'Bản chờ xét duyệt chưa công khai', status: 'hidden',
    reviewState: 'pending', reviewDueAt: '2026-11-23T09:00:00.000Z' };
  finishRead({ ...page, items: [pending, ...page.items] }); await settle();
  expect(document.body.textContent).not.toContain(pending.content);
  const ownKey = serverStateKeys.mindfulCommunity.posts('A', 'mine');
  client.setQueryData(ownKey, { pages: [{ ...page, items: [pending] }], pageParams: [null] });
  [...document.querySelectorAll<HTMLButtonElement>('nav button')].find(button => button.textContent === 'Bài của tôi')!.click(); await settle();
  expect(document.body.textContent).toContain(pending.content);
  expect(document.querySelector('article [data-review-state=pending] time[datetime="2026-11-23T09:00:00.000Z"]')).not.toBeNull();
  expect(document.querySelector('article .actions')).toBeNull();
  expect(mocks.read).toHaveBeenCalledTimes(1);
});

it('keeps a fully filtered page open for explicit pagination to an older visible post', async () => {
  finishRead({ enabled: true, items: [], nextCursor: 'after-blocked-prefix' }); await settle();
  expect(document.querySelector('article')).toBeNull();
  expect(document.body.textContent).not.toContain('Chưa có bài chia sẻ.');
  const more = document.querySelector<HTMLButtonElement>('button.more')!;
  expect(more.disabled).toBe(false);
  expect(mocks.read).toHaveBeenCalledTimes(1);
  mocks.read.mockResolvedValueOnce({ ...page, items: [{ ...page.items[0], id: 'older-visible', content: 'Bài cũ vẫn hiển thị sau nhóm đã chặn' }] });
  more.click(); await settle();
  expect(mocks.read).toHaveBeenCalledTimes(2);
  expect(mocks.read.mock.calls[1][0]).toMatchObject({ after: 'after-blocked-prefix', kind: 'repentance', mine: false });
  expect(document.querySelector('article .content')?.textContent).toBe('Bài cũ vẫn hiển thị sau nhóm đã chặn');
  expect(document.querySelector('button.more')).toBeNull();
});
