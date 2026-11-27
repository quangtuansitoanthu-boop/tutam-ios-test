import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import LePhatScreen from '$lib/components/practice/le-phat/LePhatScreen.svelte';
import { translations } from '$lib/i18n/translations';
import { triggerHaptic } from '$lib/utils/haptics';

const audio = vi.hoisted(() => ({ stop: vi.fn(), release: vi.fn(), request: vi.fn() }));
vi.mock('$lib/stores/locale.svelte', () => ({ getLocaleContext: () => ({ current: 'vi', t: translations.vi }) }));
vi.mock('$lib/browser/ambient-sound', () => ({
  AMBIENT_SOUND_OPTIONS: [], getAmbientSoundLabel: () => '',
  createAmbientSoundController: () => ({ start: vi.fn(), stop: audio.stop, destroy: vi.fn() }),
}));
vi.mock('$lib/browser/wake-lock', () => ({ createWakeLockController: () => ({
  request: audio.request, release: audio.release, destroy: vi.fn(),
}) }));
vi.mock('$lib/browser/modal-dialog', () => ({ modalDialog: () => ({ destroy() {} }) }));
vi.mock('$lib/utils/haptics', () => ({ triggerHaptic: vi.fn() }));

let component: ReturnType<typeof LePhatScreen> | undefined;
const audioElements: { currentTime: number; src: string; play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> }[] = [];
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); flushSync(); };
beforeEach(() => {
  vi.clearAllMocks();
  audioElements.length = 0;
  vi.stubGlobal('Audio', class {
    loop = false; preload = ''; src = ''; currentTime = 0;
    play = vi.fn(async () => {}); pause = vi.fn();
    constructor() { audioElements.push(this); }
  });
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  expect(fetch).not.toHaveBeenCalled();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('keeps one auto-pace timer across countdown ticks and manual bows, and uses native-capable haptics', async () => {
  component = mount(LePhatScreen, { target: document.body, props: { open: true, onExitRequest: vi.fn() } });
  await settle();
  const pace = document.querySelector<HTMLSelectElement>('.lp__pace-select')
    ?? [...document.querySelectorAll<HTMLSelectElement>('select')].find(select => [...select.options].some(option => option.value === '6'))!;
  pace.value = '6'; pace.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
  vi.useFakeTimers();
  const intervals = vi.spyOn(window, 'setInterval');
  [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find(button => button.textContent?.includes(translations.vi.practice.startBowing))!.click();
  flushSync();
  const timerCount = intervals.mock.calls.length;
  expect(timerCount).toBe(1);
  for (let second = 0; second < 3; second++) { vi.advanceTimersByTime(1000); flushSync(); }
  document.querySelector<HTMLButtonElement>('.lp-fullscreen-counter')!.click(); flushSync();
  expect(intervals).toHaveBeenCalledTimes(timerCount);
  expect(triggerHaptic).toHaveBeenCalledWith('medium');
  vi.advanceTimersByTime(3000); flushSync();
  expect(document.querySelector('.lp-fullscreen-counter [aria-live]')?.textContent).toContain('2 / 21');
  expect(intervals).toHaveBeenCalledTimes(timerCount);
});

it('pauses automatic bows in the background and preserves the remaining pace across resume and user pause', async () => {
  component = mount(LePhatScreen, { target: document.body, props: { open: true, onExitRequest: vi.fn() } });
  await settle();
  const pace = [...document.querySelectorAll<HTMLSelectElement>('select')].find(select => [...select.options].some(option => option.value === '6'))!;
  pace.value = '6'; pace.dispatchEvent(new Event('change', { bubbles: true })); await settle();
  const music = document.querySelector<HTMLSelectElement>('#lp-music-select')!;
  music.value = music.options[1].value; music.dispatchEvent(new Event('change', { bubbles: true })); await settle();
  vi.useFakeTimers();
  [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find(button => button.textContent?.includes(translations.vi.practice.startBowing))!.click(); flushSync();
  vi.advanceTimersByTime(2000); flushSync();
  audioElements[0].currentTime = 17;
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange')); flushSync();
  expect(audioElements[0].pause).toHaveBeenCalled();
  expect(audioElements[0].currentTime).toBe(17);
  vi.advanceTimersByTime(120000); flushSync();
  expect(document.querySelector('.lp-fullscreen-counter [aria-live]')?.textContent).toBe(`0 / 21 ${translations.vi.practice.bowsUnit}`);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange')); flushSync();
  expect(audioElements[0].play).toHaveBeenCalledTimes(2);
  expect(audioElements[0].currentTime).toBe(17);
  vi.advanceTimersByTime(3999); flushSync();
  expect(document.querySelector('.lp-fullscreen-counter [aria-live]')?.textContent).toBe(`0 / 21 ${translations.vi.practice.bowsUnit}`);
  vi.advanceTimersByTime(1); flushSync();
  expect(document.querySelector('.lp-fullscreen-counter [aria-live]')?.textContent).toContain('1 / 21');
  document.querySelector<HTMLButtonElement>('.lp-fullscreen-pace-btn')!.click(); flushSync();
  vi.advanceTimersByTime(120000); flushSync();
  document.dispatchEvent(new Event('visibilitychange')); flushSync();
  expect(document.querySelector('.lp-fullscreen-counter [aria-live]')?.textContent).toContain('1 / 21');
  expect(document.querySelector('.lp-fullscreen-pace-btn')?.textContent).toContain('Tiếp tục');
});

it('coalesces a delayed foreground tick and stops the timer at the selected goal', async () => {
  component = mount(LePhatScreen, { target: document.body, props: { open: true, onExitRequest: vi.fn() } });
  await settle();
  for (const [selector, value] of [['#lp-pace-select', '6'], ['#lp-goal-select', '3']]) {
    const select = document.querySelector<HTMLSelectElement>(selector)!;
    select.value = value; select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  await settle(); vi.useFakeTimers();
  [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find(button => button.textContent?.includes(translations.vi.practice.startBowing))!.click(); flushSync();
  vi.setSystemTime(Date.now() + 600000); vi.advanceTimersByTime(1000); flushSync();
  expect(document.querySelector('.lp-fullscreen-counter [aria-live]')?.textContent).toBe(`1 / 3 ${translations.vi.practice.bowsUnit}`);
  vi.advanceTimersByTime(12000); flushSync();
  expect(document.querySelector('.lp-fullscreen-counter [aria-live]')?.textContent).toBe(`3 / 3 ${translations.vi.practice.bowsUnit}`);
  expect(vi.getTimerCount()).toBe(0);
});

it('starts the selected soundtrack when a routine begins paused and is resumed for the first time', async () => {
  const state = new SvelteMap<string, unknown>([['paused', true], ['id', null]]);
  component = mount(LePhatScreen, { target: document.body, props: {
    open: true, onExitRequest: vi.fn(),
    get routinePaused() { return Boolean(state.get('paused')); },
    get routineSetup() { return state.get('id') ? { id: String(state.get('id')), phrase: 'a-di-da', count: 2 } : undefined; },
  } });
  await settle();
  const music = document.querySelector<HTMLSelectElement>('#lp-music-select')!;
  music.value = music.options[1].value; const selected = music.value;
  music.dispatchEvent(new Event('change', { bubbles: true })); await settle();
  state.set('id', 'initial-paused'); await settle();
  expect(audioElements[0].play).not.toHaveBeenCalled();
  state.set('paused', false); await settle();
  expect(audioElements[0].src).toBe(selected);
  expect(audioElements[0].play).toHaveBeenCalledOnce();
});

it('pauses without losing the count, resumes and completes exactly once with the selected Buddha', async () => {
  const state = new SvelteMap<string, unknown>([['paused', false], ['id', 'routine-step-1']]);
  const complete = vi.fn();
  const exit = vi.fn();
  component = mount(LePhatScreen, { target: document.body, props: {
    open: true, principal: 'owner-a',
    get routinePaused() { return Boolean(state.get('paused')); },
    get routineSetup() { return { id: String(state.get('id')), phrase: 'a-di-da', count: 2 }; },
    onRoutineComplete: complete, onExitRequest: exit,
  } });
  await settle();
  const counter = () => document.querySelector<HTMLButtonElement>('.lp-fullscreen-counter')!;
  counter().click(); await settle();
  expect(counter().textContent).toContain('1');
  state.set('paused', true); await settle();
  const released = audio.release.mock.calls.length;
  counter().click(); await settle();
  expect(counter().textContent).toContain('1');
  expect(complete).not.toHaveBeenCalled();
  expect(audio.stop).toHaveBeenCalled();
  expect(released).toBeGreaterThan(0);
  state.set('paused', false); await settle();
  counter().click(); await settle();
  expect(complete).toHaveBeenCalledOnce();
  expect(complete).toHaveBeenCalledWith(2, expect.objectContaining({ id: 'a-di-da' }));
  expect(exit).not.toHaveBeenCalled();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await settle();
  expect(complete).toHaveBeenCalledOnce();
  state.set('id', 'routine-step-2'); await settle();
  expect(counter().textContent).toContain('0');
});

it('keeps standalone prostrations manual and does not trigger routine completion', async () => {
  const complete = vi.fn();
  component = mount(LePhatScreen, { target: document.body, props: {
    open: true, routinePaused: true, onRoutineComplete: complete, onExitRequest() {},
  } });
  await settle();
  expect(document.querySelector('.lp-fullscreen-counter')).toBeNull();
  const start = [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find(button => button.textContent?.includes(translations.vi.practice.startBowing));
  expect(start).toBeDefined();
  start!.click(); await settle();
  document.querySelector<HTMLButtonElement>('.lp-fullscreen-counter')!.click(); await settle();
  expect(document.querySelector('.lp-fullscreen-counter')?.textContent).toContain('1');
  expect(complete).not.toHaveBeenCalled();
});

it('blocks held Enter from repeatedly activating the focused bow counter', async () => {
  component = mount(LePhatScreen, { target: document.body, props: {
    open: true, onExitRequest: vi.fn(),
  } });
  await settle();
  const start = [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find(button => button.textContent?.includes(translations.vi.practice.startBowing))!;
  start.click();
  await settle();
  const counter = document.querySelector<HTMLButtonElement>('.lp-fullscreen-counter')!;
  counter.focus();
  // jsdom does not synthesize a button's native click after an uncancelled Enter keydown.
  for (const repeat of [false, true, true]) {
    const key = new KeyboardEvent('keydown', { key: 'Enter', repeat, bubbles: true, cancelable: true });
    if (counter.dispatchEvent(key)) counter.click();
  }
  await settle();
  expect(counter.querySelector('[aria-live]')?.textContent).toBe(`1 / 21 ${translations.vi.practice.bowsUnit}`);
});
