import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import ThanhTinhScreen from '$lib/components/practice/thanh-tinh/ThanhTinhScreen.svelte';
import DailyDhammapadaCard from '$lib/components/home/DailyDhammapadaCard.svelte';
import { translations } from '$lib/i18n/translations';
import { DAILY_DHARMA_QUOTES } from '$lib/data/daily-dharma-quotes';

const mocks = vi.hoisted(() => ({ request: vi.fn(async () => true), destroy: vi.fn(async () => {}), active: undefined as (() => void) | undefined }));
vi.mock('$lib/stores/locale.svelte', () => ({ getLocaleContext: () => ({ current: 'vi', t: translations.vi }) }));
vi.mock('$lib/stores/theme.svelte', () => ({ getThemeContext: () => ({ current: 'light' }) }));
vi.mock('$lib/browser/wake-lock', () => ({ createWakeLockController: () => ({ request: mocks.request, destroy: mocks.destroy, release: vi.fn(async () => {}) }) }));
vi.mock('$lib/browser/native-app-lifecycle', () => ({ addAppActiveListener: (active: () => void) => { mocks.active = active; return () => { mocks.active = undefined; }; } }));
vi.mock('$lib/browser/thanh-tinh-client', () => ({ fetchCommunityThanhTinhStats: vi.fn(async () => ({ participantCount: 0, totalDaysClean: 0, totalUrgesResisted: 0 })), submitThanhTinhPledge: vi.fn(), syncDailyThanhTinhProgress: vi.fn() }));
vi.mock('$lib/browser/practice-participation', () => ({ recordPracticeParticipation: vi.fn() }));
vi.mock('$lib/components/reader/QuoteCardModal.svelte', () => ({ default: () => {} }));

let component: object | undefined;
async function settle() { flushSync(); await Promise.resolve(); flushSync(); await Promise.resolve(); flushSync(); }
function parameter() { return { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }; }
class AudioContextStub {
  static instances: AudioContextStub[] = [];
  oscillators: { stop: ReturnType<typeof vi.fn> }[] = [];
  state = 'running'; currentTime = 0; destination = {};
  constructor() { AudioContextStub.instances.push(this); }
  createGain() { return { gain: parameter(), connect: vi.fn(), disconnect: vi.fn() }; }
  createOscillator() {
    const node = { type: 'sine', frequency: parameter(), connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null };
    this.oscillators.push(node); return node;
  }
  resume() { return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-27T09:00:00Z'));
  AudioContextStub.instances.length = 0;
  vi.stubGlobal('AudioContext', AudioContextStub);
  vi.stubGlobal('fetch', vi.fn());
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  localStorage.clear();
  localStorage.setItem('tutam_thanh_tinh_v1', JSON.stringify({ joined: true, joinedAt: new Date().toISOString(), cleanSince: new Date().toISOString(), lastCheckInDate: '2026-11-27', checkInDates: ['2026-11-27'], relapseHistory: [] }));
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  expect(fetch).not.toHaveBeenCalled();
  document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function startSos() {
  component = mount(ThanhTinhScreen, { target: document.body, props: { open: true, onClose: vi.fn() } });
  await settle();
  const sos = document.querySelector<HTMLButtonElement>('.tt-tab-btn--sos')!;
  expect(sos).toBeDefined(); sos.click(); await settle();
  expect(document.querySelector('.sos-alarm-strobe-banner')).not.toBeNull();
  // Giới hạn tiếng còi bằng audio clock ngay cả khi callback JS chưa được chạy.
  for (const oscillator of AudioContextStub.instances[0].oscillators) expect(oscillator.stop).toHaveBeenCalledWith(120);
}

it('reacquires the released SOS wake lock on foreground without restarting the siren or duplicating requests', async () => {
  await startSos();
  expect(mocks.request).toHaveBeenCalledOnce();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange')); await settle();
  vi.setSystemTime(Date.now() + 30000);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange')); await settle();
  expect(mocks.request).toHaveBeenCalledTimes(2);
  expect(document.querySelector('.alarm-banner-text')?.textContent).toContain('01:30');
});

it('ends SOS at its wall-clock deadline on native resume even when background timers never ran', async () => {
  await startSos();
  vi.setSystemTime(Date.now() + 121000);
  mocks.active?.(); await settle();
  expect(document.querySelector('.sos-alarm-strobe-banner')).toBeNull();
  expect(document.querySelector('.sos-alarm-stopped-bar')).not.toBeNull();
  expect(mocks.destroy).toHaveBeenCalled();
  expect(mocks.request).toHaveBeenCalledOnce();
});

it('changes the daily quote at Vietnam midnight and catches up once after foreground resume', async () => {
  vi.setSystemTime(new Date('2026-11-27T16:59:59Z'));
  component = mount(DailyDhammapadaCard, { target: document.body }); await settle();
  const quoteFor = (day: number) => DAILY_DHARMA_QUOTES[Math.floor((Date.UTC(2026, 10, day) - Date.UTC(2026, 0, 1)) / 86400000) % DAILY_DHARMA_QUOTES.length].verseVi;
  expect(document.querySelector('.verse-text')?.textContent?.trim()).toBe(quoteFor(27));
  vi.advanceTimersByTime(1100); await settle();
  expect(document.querySelector('.verse-text')?.textContent?.trim()).toBe(quoteFor(28));
  vi.setSystemTime(new Date('2026-11-30T02:00:00Z'));
  window.dispatchEvent(new Event('focus')); await settle();
  expect(document.querySelector('.verse-text')?.textContent?.trim()).toBe(quoteFor(30));
});
