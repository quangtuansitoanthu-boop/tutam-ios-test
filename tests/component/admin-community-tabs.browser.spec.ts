import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AdminCommunity from '../../src/lib/components/admin/community/AdminCommunity.svelte';
import { SESSION_CHANGE_EVENT } from '../../src/lib/stores/session.svelte';

const request = vi.hoisted(() => vi.fn());
vi.mock('$lib/browser/session-csrf', () => ({ fetchWithSessionRefresh: request }));
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/admin/community?section=practice') } }));
vi.mock('$app/navigation', () => ({ afterNavigate: vi.fn(), goto: vi.fn() }));

let view: ReturnType<typeof AdminCommunity>;
const requests = new Map<string, (value: Response) => void>();

async function displayed() {
  await new Promise(resolve => setTimeout(resolve, 0));
  flushSync();
}

async function openPractice() {
  request.mockImplementation((url: string) => {
    const module = new URL(url, 'http://localhost').searchParams.get('module');
    if (!module) return Promise.resolve(Response.json([]));
    return new Promise<Response>(resolve => requests.set(module, resolve));
  });
  view = mount(AdminCommunity, { target: document.body, props: { initialData: {
    generatedAt: '2026-11-25T00:00:00Z', period: 'month', ranking: [],
    online: { members: 0, guests: 0, internal: 0, total: 0, visitors: [] },
  } } });
  flushSync();
  await displayed();
}

function selectTab(label: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('.practice-tab-btn')].find(tab => tab.textContent?.includes(label));
  expect(button).toBeDefined();
  button!.click();
  flushSync();
}

function resolveRows(module: string, name: string) {
  requests.get(module)!(Response.json({ rows: [{ ownerId: module, name, event: 'recorded', at: '2026-11-25T00:00:00Z' }] }));
}

afterEach(async () => {
  if (view) await unmount(view);
  document.body.replaceChildren();
  requests.clear();
  request.mockReset();
});

it('loads each requested tab once across rapid A/B/A switching and out-of-order results', async () => {
  await openPractice();
  selectTab('Ngũ giới');
  selectTab('Bát quan trai');
  selectTab('Ngũ giới');
  expect([...requests.keys()]).toEqual(['five', 'eight']);
  resolveRows('eight', 'Người tám giới');
  await displayed();
  expect(document.body.textContent).not.toContain('Người tám giới');
  resolveRows('five', 'Người năm giới');
  await displayed();
  expect(document.body.textContent).toContain('Người năm giới');
  selectTab('Bát quan trai');
  expect(document.body.textContent).toContain('Người tám giới');
  expect(request).toHaveBeenCalledTimes(3);
});

it('keeps the participation table cleared when an administrative session ends during loading', async () => {
  await openPractice();
  selectTab('Ngũ giới');
  window.dispatchEvent(new CustomEvent(SESSION_CHANGE_EVENT, { detail: { authenticated: false, user: null } }));
  resolveRows('five', 'Tên từ phiên trước');
  await displayed();
  expect(document.body.textContent).not.toContain('Tên từ phiên trước');
});
