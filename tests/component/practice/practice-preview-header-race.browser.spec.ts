import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { QueryClient } from '@tanstack/svelte-query';
import Harness from './practice-preview-header-race-harness.svelte';
import type { PracticeArticleDetail } from '../../../src/lib/domain/practice/state';

const mocks = vi.hoisted(() => ({ goto: vi.fn(), fetch: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: mocks.goto }));
vi.mock('$lib/browser/mindful-community-client', () => ({ fetchMindfulNotifications: mocks.fetch }));
vi.mock('$lib/browser/session-csrf', () => ({ fetchWithSessionRefresh: vi.fn() }));
vi.mock('$lib/stores/session.svelte', () => ({ SESSION_CONTEXT: Symbol('session') }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: () => false }));
vi.mock('$lib/browser/native-system-bars', () => ({ nativeSystemBarsSurface: () => ({ destroy() {} }) }));
vi.mock('$lib/browser/scroll-lock', () => ({ acquireScrollLock: () => () => {} }));
vi.mock('$lib/browser/session-cover', () => ({ savedContentImages: () => ({ destroy() {} }) }));
vi.mock('$lib/components/lunar/lunar-events', () => ({ getLunarEvent: () => ({ lunarDay: 2, lunarMonth: 1, isThapTrai: false }) }));
vi.mock('$lib/stores/locale.svelte', async () => {
  const { translations } = await import('$lib/i18n/translations');
  return { getLocaleContext: () => ({ current: 'vi', t: translations.vi }) };
});

const article: PracticeArticleDetail = {
  id: 'tt_kinh_thu_lang_nghiem',
  title: 'KINH THỦ LĂNG NGHIÊM',
  category: 'KINH PHẬT',
  publishedAt: '2026-09-04',
  author: 'Cư Sĩ Tâm Minh',
  imageUrl: '',
  hasTableOfContents: true,
  tags: [],
  content: '',
  tocTitles: ['Quyển 1']
};

let client: QueryClient;
let component: ReturnType<typeof Harness> | undefined;
const settle = async () => { await new Promise((resolve) => setTimeout(resolve, 0)); flushSync(); };

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() });
  client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
});

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  client.clear();
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
});

it('keeps the SiteHeader back button visible when entering PracticePreview from a catalog section and returning back', async () => {
  component = mount(Harness, { target: document.body, props: { client, article } });
  await settle();
  await settle();

  // Catalog section (Kinh Phật) should show back button.
  expect(document.querySelector('.qts-nav .nav-back-circle-btn')).not.toBeNull();

  // Open sutra into PracticePreview: back button MUST remain visible and functional!
  component.openPreview();
  await settle();
  await settle();

  const previewBack = document.querySelector<HTMLButtonElement>('.qts-nav .nav-back-circle-btn');
  expect(previewBack).not.toBeNull();

  // Clicking Back returns to catalog section, and Back button stays visible to return to hub!
  previewBack!.click();
  await settle();
  await settle();

  expect(document.querySelector('.tt-preview')).toBeNull();
  expect(document.querySelector('.qts-nav .nav-back-circle-btn')).not.toBeNull();
});
