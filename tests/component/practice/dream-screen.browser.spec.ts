import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { chromium, webkit } from '@playwright/test';
import { flushSync, mount, unmount } from 'svelte';
import type { DreamJournalEntry } from '$lib/browser/spiritual-tools-storage';
import Harness from './dream-screen-harness.svelte';
import { dreamTestPage } from './dream-page-state.svelte';
import DreamArticle from '$lib/components/practice/divination/DreamArticle.svelte';
import DreamGuideDialog from '$lib/components/practice/divination/DreamGuideDialog.svelte';
import { getDreamCopy } from '$lib/i18n/dream-ui';

const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), remove: vi.fn(), clear: vi.fn(), goto: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: mocks.goto, pushState: mocks.push, replaceState: mocks.replace }));
vi.mock('$app/state', async () => ({ page: (await import('./dream-page-state.svelte')).dreamTestPage }));
vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/stores/locale.svelte', () => ({ getLocaleContext: () => ({ current: 'vi' }) }));
vi.mock('$lib/browser/spiritual-tools-storage', () => ({
  loadDreamJournal: mocks.read, saveDreamJournalEntry: mocks.save,
  deleteDreamJournalEntry: mocks.remove, clearDreamJournal: mocks.clear,
}));
vi.mock('$lib/browser/app-dialog', () => ({ confirmInApp: vi.fn().mockResolvedValue(true) }));
vi.mock('$lib/domain/practice/dream-interpretation', () => {
  const entry = { id: 'test-dream', category: 'test', title: 'Giấc mơ để kiểm tra', short: 'Bài tham khảo',
    overview: ['Tổng quan'], scenarioGroups: [], buddhist: ['Quán chiếu'], advice: ['Bình tâm'] };
  return {
    DREAM_ENTRIES: [entry], DREAM_TOPICS: [{ id: 'test', title: 'Chủ đề', titleEn: 'Topic', icon: 'lotus' }],
    filterDreamEntries: () => [entry], getDreamEntry: (id: string) => id === entry.id ? entry : undefined,
    getPopularDreamEntries: () => [entry],
  };
});

let component: ReturnType<typeof Harness> | undefined;
let backStates: App.PageState[];
let persistedPageState: App.PageState;
let headerBackHandler: (() => void) | undefined;
const onSubpageHeader = (event: Event) => {
  const detail = (event as CustomEvent<{ active?: boolean; onBack?: () => void }>).detail;
  headerBackHandler = detail?.active ? detail.onBack : undefined;
};
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); flushSync(); };

it('keeps the dream guide and its close actions reachable below the native safe top in both CSS engines', async () => {
  const guide = mount(DreamGuideDialog, { target: document.body, props: { copy: getDreamCopy(false), onClose() {} } });
  try {
    await settle();
    const html = document.querySelector('dialog')!.outerHTML;
    const css = ['tokens.css', 'master-shell.css', 'dream-interpretation.css'].map(file => readFileSync(`src/lib/styles/${file}`, 'utf8')).join('\n');
    for (const engine of [chromium, webkit]) {
      const browser = await engine.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.route('**/*', route => route.abort());
        for (const viewport of [{ width: 375, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 900 }]) for (const theme of ['light', 'dark']) {
          await page.setViewportSize(viewport);
          await page.setContent(`<html data-native-app="true" data-theme="${theme}" style="--app-safe-top:32px;--ui-font-scale:1.2"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${html}</body></html>`);
          await page.locator('dialog').evaluate(dialog => { dialog.removeAttribute('open'); (dialog as HTMLDialogElement).showModal(); });
          const bounds = await page.locator('dialog').boundingBox();
          expect(bounds!.y).toBeGreaterThanOrEqual(32);
          expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
          expect(bounds!.x).toBeGreaterThanOrEqual(0);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
          for (const close of await page.getByRole('button', { name: 'Đóng', exact: true }).all()) await close.click({ trial: true });
        }
      } finally { await browser.close(); }
    }
  } finally { await unmount(guide); }
}, 30_000);
function journalEntry(id: string, note: string): DreamJournalEntry {
  return { id, dreamId: 'test-dream', title: id, note, createdAt: '2026-11-27T04:00:00.000Z' };
}

beforeEach(() => {
  vi.clearAllMocks();
  dreamTestPage.state = {};
  backStates = [];
  persistedPageState = {};
  headerBackHandler = undefined;
  document.addEventListener('qts:subpage-header', onSubpageHeader);
  mocks.push.mockImplementation((_url: string, state: App.PageState) => { backStates.push(persistedPageState); persistedPageState = state; dreamTestPage.state = state; });
  mocks.replace.mockImplementation((_url: string, state: App.PageState) => { persistedPageState = state; dreamTestPage.state = state; });
  vi.spyOn(window.history, 'back').mockImplementation(() => { dreamTestPage.state = backStates.pop() ?? {}; });
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) });
  Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() });
});
afterEach(async () => {
  document.removeEventListener('qts:subpage-header', onSubpageHeader);
  if (component) await unmount(component);
  component = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('does not show a delayed previous-account journal after switching users', async () => {
  let finishA!: (entries: DreamJournalEntry[]) => void;
  mocks.read.mockImplementation((owner: string) => owner === 'A'
    ? new Promise<DreamJournalEntry[]>(resolve => { finishA = resolve; })
    : Promise.resolve([journalEntry('B-entry', 'Ghi chú riêng B')]));
  component = mount(Harness, { target: document.body });
  await settle();
  component.selectUser('B');
  await settle();
  finishA([journalEntry('A-entry', 'Ghi chú riêng A')]);
  await settle();
  expect(document.querySelector('.dream-history-body')?.textContent).toContain('Ghi chú riêng B');
  expect(document.querySelector('.dream-history-body')?.textContent).not.toContain('Ghi chú riêng A');
  expect(mocks.read.mock.calls.map(call => call[0])).toEqual(['A', 'B']);
});

it('keeps a late save result scoped to its original user and does not reload on draft edits', async () => {
  let finishSave!: (result: { ok: boolean; entries: DreamJournalEntry[] }) => void;
  mocks.read.mockImplementation((owner: string) => Promise.resolve(owner === 'B' ? [journalEntry('B-entry', 'Nhật ký B')] : []));
  mocks.save.mockImplementation(() => new Promise(resolve => { finishSave = resolve; }));
  component = mount(Harness, { target: document.body });
  await settle();
  const note = document.querySelector<HTMLTextAreaElement>('#dream-note-input')!;
  note.value = 'Bản ghi A'; note.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  expect(mocks.read).toHaveBeenCalledTimes(1);
  document.querySelector<HTMLButtonElement>('.dream-note-form button')!.click();
  await settle();
  expect(mocks.save).toHaveBeenCalledWith('A', expect.objectContaining({ note: 'Bản ghi A' }));
  component.selectUser('B');
  await settle();
  finishSave({ ok: true, entries: [journalEntry('A-entry', 'Bản ghi A')] });
  await settle();
  expect(document.querySelector('.dream-history-body')?.textContent).toContain('Nhật ký B');
  expect(document.querySelector('.dream-history-body')?.textContent).not.toContain('Bản ghi A');
  expect(document.querySelector<HTMLTextAreaElement>('#dream-note-input')!.value).toBe('');
});

it('keeps notes typed while a save is pending', async () => {
  let finishSave!: (result: { ok: boolean; entries: DreamJournalEntry[] }) => void;
  mocks.read.mockResolvedValue([]);
  mocks.save.mockImplementation(() => new Promise(resolve => { finishSave = resolve; }));
  component = mount(Harness, { target: document.body });
  await settle();
  const note = document.querySelector<HTMLTextAreaElement>('#dream-note-input')!;
  note.value = 'Bản đầu'; note.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  document.querySelector<HTMLButtonElement>('.dream-note-form button')!.click();
  await settle();
  note.value = 'Đang viết tiếp'; note.dispatchEvent(new Event('input', { bubbles: true }));
  finishSave({ ok: true, entries: [journalEntry('A-entry', 'Bản đầu')] });
  await settle();
  expect(note.value).toBe('Đang viết tiếp');
  expect(mocks.read).toHaveBeenCalledTimes(1);
});

it('prevents overwriting an unread journal and lets the reader retry without losing a draft', async () => {
  mocks.read.mockRejectedValueOnce(new Error('storage unavailable')).mockResolvedValue([]);
  component = mount(Harness, { target: document.body });
  await settle();
  const note = document.querySelector<HTMLTextAreaElement>('#dream-note-input')!;
  note.value = 'Giữ ghi chú khi đọc lại'; note.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  expect(document.querySelector<HTMLButtonElement>('.dream-note-form button')!.disabled).toBe(true);
  expect(document.querySelector('.dream-note-form [role="alert"]')).not.toBeNull();
  const retry = [...document.querySelectorAll<HTMLButtonElement>('.dream-note-form button')].find(button => button.textContent === 'Thử lại');
  retry!.click();
  await settle();
  expect(document.querySelector<HTMLButtonElement>('.dream-note-form button')!.disabled).toBe(false);
  expect(note.value).toBe('Giữ ghi chú khi đọc lại');
  expect(mocks.save).not.toHaveBeenCalled();
});

it('clears private state immediately when identity becomes unresolved and rejects a pending save', async () => {
  let finishSave!: (result: { ok: boolean; entries: DreamJournalEntry[] }) => void;
  mocks.read.mockImplementation((owner: string) => Promise.resolve([journalEntry(`${owner}-entry`, `Nhật ký ${owner}`)]));
  mocks.save.mockImplementation(() => new Promise(resolve => { finishSave = resolve; }));
  component = mount(Harness, { target: document.body });
  await settle();
  const note = document.querySelector<HTMLTextAreaElement>('#dream-note-input')!;
  note.value = 'Ghi chú riêng A'; note.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  document.querySelector<HTMLButtonElement>('.dream-note-form button')!.click();
  await settle();
  component.setIdentityReady(false);
  await settle();
  expect(note.value).toBe('');
  expect(document.querySelector('.dream-history-body')?.textContent).not.toContain('Nhật ký A');
  expect(document.querySelector<HTMLButtonElement>('.dream-note-form button')!.disabled).toBe(true);
  component.selectUser('B');
  await settle();
  finishSave({ ok: true, entries: [journalEntry('A-entry', 'Ghi chú riêng A')] });
  await settle();
  expect(mocks.read).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).not.toContain('Ghi chú riêng A');
  component.setIdentityReady(true);
  await settle();
  expect(mocks.read.mock.calls.map(call => call[0])).toEqual(['A', 'B']);
  expect(document.querySelector('.dream-history-body')?.textContent).toContain('Nhật ký B');
});

it('reopens journal notes inside mobile detail without stacking another detail Back step', async () => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({
    matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }) });
  mocks.read.mockResolvedValue([journalEntry('saved-dream', 'Ghi chú đã lưu')]);
  component = mount(Harness, { target: document.body });
  await settle();
  document.querySelector<HTMLButtonElement>('.dream-row-btn')!.click();
  await settle();
  expect(document.querySelector('.dream-list-col')).toBeNull();
  document.querySelector<HTMLButtonElement>('.dream-history-open')!.click();
  await settle();
  expect(document.querySelector<HTMLTextAreaElement>('#dream-note-input')!.value).toBe('Ghi chú đã lưu');
  expect(mocks.push).toHaveBeenCalledTimes(1);
  expect(mocks.replace).toHaveBeenCalledTimes(2);
  expect(document.querySelector('.dream-mobile-detail-top')).toBeNull();
  headerBackHandler?.();
  await settle();
  expect(document.querySelector('.dream-list-col')).not.toBeNull();
  expect(document.querySelector('.dream-article')).toBeNull();
});

it('returns to Home in one header Back action after rotating mobile detail to desktop', async () => {
  let resize = () => {};
  const media = { matches: true, addEventListener: (_name: string, callback: () => void) => { resize = callback; }, removeEventListener: vi.fn() };
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => media });
  dreamTestPage.state = { homeDivination: true };
  mocks.read.mockResolvedValue([]);
  component = mount(Harness, { target: document.body });
  await settle();
  document.querySelector<HTMLButtonElement>('.dream-row-btn')!.click();
  await settle();
  media.matches = false; resize();
  await settle();
  expect(document.querySelector('.div-subbar .dream-circle-button')).toBeNull();
  headerBackHandler?.();
  expect(mocks.goto).toHaveBeenCalledWith('/');
  expect(window.history.back).not.toHaveBeenCalled();
});

it('replaces stale persisted detail state before opening a saved dream from the reloaded list', async () => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({
    matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }) });
  // SvelteKit rehydrates page.state as {}, while the browser retains the old shallow entry.
  persistedPageState = { dreamDetail: 'test-dream' };
  mocks.read.mockResolvedValue([journalEntry('saved-dream', 'Ghi chú sau tải lại')]);
  component = mount(Harness, { target: document.body });
  await settle();
  expect(document.querySelector('.dream-list-col')).not.toBeNull();
  document.querySelector<HTMLButtonElement>('.dream-history-open')!.click();
  await settle();
  expect(document.querySelector<HTMLTextAreaElement>('#dream-note-input')!.value).toBe('Ghi chú sau tải lại');
  headerBackHandler?.();
  await settle();
  expect(document.querySelector('.dream-list-col')).not.toBeNull();
  expect(document.querySelector('.dream-article')).toBeNull();
  expect(dreamTestPage.state.dreamDetail).toBeUndefined();
});

it('places search results immediately below the search box while typing and restores topics when cleared', async () => {
  mocks.read.mockResolvedValue([]);
  component = mount(Harness, { target: document.body });
  await settle();

  const search = document.querySelector<HTMLInputElement>('input[type="search"]')!;
  search.focus();
  const topicsBefore = document.querySelector('.dream-topics')!;
  const workspaceBefore = document.querySelector('.dream-workspace')!;
  expect(Boolean(topicsBefore.compareDocumentPosition(workspaceBefore) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);

  search.value = 'ran';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  const topicsWhileSearching = document.querySelector('.dream-topics')!;
  const workspaceWhileSearching = document.querySelector('.dream-workspace')!;
  expect(Boolean(workspaceWhileSearching.compareDocumentPosition(topicsWhileSearching) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  expect(document.activeElement).toBe(search);

  search.value = '';
  search.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
  const topicsAfterClear = document.querySelector('.dream-topics')!;
  const workspaceAfterClear = document.querySelector('.dream-workspace')!;
  expect(Boolean(topicsAfterClear.compareDocumentPosition(workspaceAfterClear) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
});

it('keeps font controls below the dream hero and clamps local reading size without changing a draft or global settings', async () => {
  mocks.read.mockResolvedValue([]);
  component = mount(Harness, { target: document.body });
  await settle();
  const rootStyle = document.documentElement.getAttribute('style');
  const article = document.querySelector<HTMLElement>('.dream-article')!;
  const controls = article.querySelector<HTMLElement>('.dream-reading-controls');
  expect(controls).not.toBeNull();
  const hero = article.querySelector('.dream-sheet-hero')!;
  const overview = article.querySelector('.dream-detail-section')!;
  expect(Boolean(hero.compareDocumentPosition(controls!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  expect(Boolean(controls!.compareDocumentPosition(overview) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);

  const decrease = controls!.querySelector<HTMLButtonElement>('[aria-label="Giảm cỡ chữ bài giải mộng"]')!;
  const increase = controls!.querySelector<HTMLButtonElement>('[aria-label="Tăng cỡ chữ bài giải mộng"]')!;
  const current = controls!.querySelector('output')!;
  expect(current.textContent).toBe('100%');
  expect(current.getAttribute('aria-live')).toBe('polite');
  expect(decrease.disabled).toBe(true);
  const note = document.querySelector<HTMLTextAreaElement>('#dream-note-input')!;
  note.value = 'Giữ ghi chú khi chỉnh chữ';
  note.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();

  for (let index = 0; index < 9; index += 1) { increase.click(); flushSync(); }
  expect(current.textContent).toBe('160%');
  expect(increase.disabled).toBe(true);
  expect(article.style.getPropertyValue('--dream-reading-scale')).toBe('1.6');
  for (let index = 0; index < 9; index += 1) { decrease.click(); flushSync(); }
  expect(current.textContent).toBe('100%');
  expect(decrease.disabled).toBe(true);
  expect(article.style.getPropertyValue('--dream-reading-scale')).toBe('1');
  expect(note.value).toBe('Giữ ghi chú khi chỉnh chữ');
  expect(document.documentElement.getAttribute('style')).toBe(rootStyle);
  expect(mocks.read).toHaveBeenCalledTimes(1);
  expect(mocks.save).not.toHaveBeenCalled();
});

it('labels dream font controls in English while preserving Vietnamese reading content', async () => {
  const articleComponent = mount(DreamArticle, {
    target: document.body,
    props: {
      entry: { id: 'font-test', category: 'test', title: 'Giấc mơ kiểm thử', short: 'Mô tả tiếng Việt',
        overview: ['Nội dung tiếng Việt'], scenarioGroups: [], buddhist: [], advice: [] },
      copy: getDreamCopy(true), note: '', pending: false, status: '', canSave: true, storageError: false,
      onNote: vi.fn(), onSave: vi.fn(), onRetry: vi.fn(),
    },
  });
  try {
    flushSync();
    const controls = document.querySelector('.dream-reading-controls');
    expect(controls?.getAttribute('aria-label')).toBe('Font size');
    expect(controls?.querySelector('[aria-label="Decrease dream article font size"]')).not.toBeNull();
    const increase = controls?.querySelector<HTMLButtonElement>('[aria-label="Increase dream article font size"]');
    expect(increase).not.toBeNull();
    increase!.click(); flushSync();
    expect(controls?.querySelector('output')?.textContent).toBe('110%');
    expect(document.querySelector('.dream-article')?.getAttribute('lang')).toBe('vi');
    expect(document.querySelector('.dream-sheet-title')?.textContent).toContain('Giấc mơ kiểm thử');
  } finally {
    await unmount(articleComponent);
  }
});

