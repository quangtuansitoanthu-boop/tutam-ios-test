import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PracticeSession from '../../../src/lib/components/practice/reader/PracticeSession.svelte';
import { dismissTopModal } from '../../../src/lib/browser/modal-dialog';
import { renderReaderContent } from '../../../src/lib/components/reader/content-renderer';
import { readFileSync } from 'node:fs';

vi.mock('$lib/browser/practice-fab-controller', () => ({ createPracticeFabController: () => ({ destroy() {} }) }));
vi.mock('$lib/browser/session-cover', () => ({ savedContentImages: () => ({ destroy() {} }) }));
let component: ReturnType<typeof PracticeSession> | undefined;
const selected = vi.fn(), toggled = vi.fn();
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); flushSync(); };
const methods = ['showModal', 'close'].map(name => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const);
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined; document.body.replaceChildren();
  vi.restoreAllMocks();
  for (const [name, descriptor] of methods) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});
async function ready(navigationReady = true, fixture?: { id: string; category?: 'KINH PHẬT'; content: string; count: (delta: number) => void }) {
  const noop = () => {};
  component = mount(PracticeSession, { target: document.body, props: {
    article: { id: fixture?.id ?? 'mantra', title: 'NGHI THỨC', category: fixture?.category ?? 'TRÌ CHÚ', publishedAt: '', author: '', imageUrl: '', hasTableOfContents: true, tags: [], content: '', tocTitles: [] },
    chapters: [{ index: 0, title: 'BẢN TIẾNG PHẠN', summary: '' }, { index: 1, title: 'BẢN TIẾNG VIỆT', summary: '' }],
    currentChapterIndex: 0, navigationReady, onChapterSelect: selected, autoScrollActive: false, autoScrollSpeed: .5,
    fabPosition: null, fontSize: 15, meditationMusicActive: false, selectedMeditationTrack: null, modelChantActive: false,
    moActive: false, panelOpen: true, practiceBackground: 'cream', practiceBold: false, practiceCount: 0,
    practiceHtml: fixture?.content ?? '<p>Đang tụng</p>', practiceTitle: 'BẢN TIẾNG PHẠN', showChapterNavigation: true, totalChapters: 2,
    onAutoScrollToggle: noop, onAutoScrollSpeedChange: noop, onBackgroundChange: noop, onCountChange: fixture?.count ?? noop,
    onExit: noop, onFabPositionSave: noop, onFontSizeChange: noop, onNextChapter: noop, onPanelToggle: toggled,
    onPreviousChapter: noop, onSelectMeditationTrack: noop, onStopMeditationMusic: noop, onModelChantToggle: noop,
    onToggleBold: noop, onToggleMo: noop,
  } });
  await settle();
  return document.querySelector<HTMLButtonElement>('.ttp-toc-trigger')!;
}
it('places TOC before font controls and switches by original chapter index after Vietnamese-first display', async () => {
  const trigger = await ready();
  expect(trigger.parentElement?.firstElementChild).toBe(trigger);
  trigger.focus(); trigger.click(); await settle();
  const choices = [...document.querySelectorAll<HTMLButtonElement>('.ttp-toc-dialog nav button')];
  expect(choices[0].textContent).toContain('TIẾNG VIỆT');
  expect(choices[1].getAttribute('aria-current')).toBe('true');
  choices[0].click(); await settle();
  expect(selected).toHaveBeenCalledExactlyOnceWith(1);
  expect(document.querySelector('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
it('closes with hardware Back without selecting, or collapsing the expanded support panel', async () => {
  const trigger = await ready(); trigger.click(); await settle();
  expect(dismissTopModal()).toBe(true); await settle();
  expect(document.querySelector('dialog')).toBeNull(); expect(selected).not.toHaveBeenCalled(); expect(toggled).not.toHaveBeenCalled();
});
it('keeps support tools expanded on outside touches and toggles only with the main button', async () => {
  await ready();
  expect(document.querySelector('.tt-practice__toggle')?.getAttribute('aria-expanded')).toBe('true');
  window.dispatchEvent(new Event('pointerdown')); await settle(); expect(toggled).not.toHaveBeenCalled();
  document.querySelector<HTMLButtonElement>('.tt-practice__toggle')!.click(); expect(toggled).toHaveBeenCalledOnce();
});
it('prevents opening another chapter while the current position is still loading', async () => {
  const trigger = await ready(false); expect(trigger.disabled).toBe(true); trigger.click(); await settle();
  expect(document.querySelector('dialog')).toBeNull(); expect(selected).not.toHaveBeenCalled();
});

it.each([
  ['tt_1781275267452', 'chapters', 'ĐỆ NHẤT'],
  ['tt_1781275267452', 'chapters-en', 'FIRST ASSEMBLY (ĐỆ NHẤT HỘI)'],
  ['tt_1781274943336', 'chapters', 'Thiên Thủ Thiên Nhãn'],
  ['tt_1781274943336', 'chapters-en', 'THOUSAND HANDS AND THOUSAND EYES'],
])('counts once and scrolls beneath the toolbar to the bundled opening (%s, %s)', async (id, folder, heading) => {
  const rows = JSON.parse(readFileSync(`static/offline-data/${folder}/${id}.json`, 'utf8'));
  const count = vi.fn();
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  await ready(true, { id, content: renderReaderContent(rows[1].noi_dung), count });
  const marker = [...document.querySelectorAll('.ttp-content .tt-content__line')].find(line => line.textContent?.trim().startsWith(heading))!;
  const toolbar = document.querySelector('.ttp-reader-bar')!;
  vi.spyOn(marker, 'getBoundingClientRect').mockReturnValue({ ...marker.getBoundingClientRect(), top: 400 });
  vi.spyOn(toolbar, 'getBoundingClientRect').mockReturnValue({ ...toolbar.getBoundingClientRect(), bottom: 100 });
  document.querySelector<HTMLButtonElement>('.ttr-side-btn-plus')!.click();
  expect(count).toHaveBeenCalledExactlyOnceWith(1);
  expect(scroll).toHaveBeenCalledExactlyOnceWith({ top: 300, behavior: 'instant' });
  expect(selected).not.toHaveBeenCalled();
});

it.each([['KINH PHẬT', 1], [undefined, -1]] as const)('keeps position for category %s with counter change %s', async (category, delta) => {
  const count = vi.fn();
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  await ready(true, { id: 'tt_1781275267452', category, content: '<p>ĐỆ NHẤT</p>', count });
  document.querySelector<HTMLButtonElement>(`[aria-label="${delta === 1 ? '+1' : '-1'}"]`)!.click();
  expect(count).toHaveBeenCalledExactlyOnceWith(delta);
  expect(scroll).not.toHaveBeenCalled();
  expect(selected).not.toHaveBeenCalled();
});

it('returns from an explanatory section through the existing chapter loader', async () => {
  const count = vi.fn();
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  await ready(true, { id: 'tt_1781274943336', content: '<p>Công năng oai lực</p>', count });
  document.querySelector<HTMLButtonElement>('.ttr-side-btn-plus')!.click();
  await settle();
  expect(count).toHaveBeenCalledExactlyOnceWith(1);
  expect(selected).toHaveBeenCalledExactlyOnceWith(1);
  expect(scroll).not.toHaveBeenCalled();
});
