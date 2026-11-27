import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { chromium, webkit } from '@playwright/test';
import { flushSync, mount, unmount } from 'svelte';
import type { BiorhythmProfile } from '$lib/browser/spiritual-tools-storage';
import Harness from './biorhythm-screen-harness.svelte';

const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/state', () => ({ page: { state: {} } }));
vi.mock('$lib/stores/locale.svelte', () => ({ getLocaleContext: () => ({ current: 'vi' }) }));
vi.mock('$lib/browser/spiritual-tools-storage', () => ({
  loadBiorhythmProfile: mocks.read,
  saveBiorhythmProfile: mocks.save,
}));

let component: ReturnType<typeof Harness> | undefined;
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); flushSync(); };
const profile = (name: string): BiorhythmProfile => ({ version: 1, name, birthDate: '1992-08-15' });
const nameInput = () => document.querySelector<HTMLInputElement>('input[autocomplete="name"]')!;
const birthTextInput = () => document.querySelector<HTMLInputElement>('#bio-birth-input')!;
const birthInput = () => document.querySelector<HTMLInputElement>('input[type="date"]')!;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue(true);
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('keeps the opened biorhythm guide below the native safe top in both CSS engines', async () => {
  mocks.read.mockResolvedValue(null);
  component = mount(Harness, { target: document.body }); await settle(); await settle();
  document.querySelector<HTMLButtonElement>('.div-guide-btn')!.click(); await settle();
  const html = document.querySelector('dialog')!.outerHTML;
  const css = ['tokens.css', 'master-shell.css', 'biorhythm.css'].map(file => readFileSync(`src/lib/styles/${file}`, 'utf8')).join('\n');
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
        await page.getByRole('button', { name: 'Đóng', exact: true }).click({ trial: true });
      }
    } finally { await browser.close(); }
  }
}, 30_000);

it('clears a displayed profile as soon as identity resolution becomes pending', async () => {
  mocks.read.mockImplementation((owner: string) => Promise.resolve(profile(`Hồ sơ ${owner}`)));
  component = mount(Harness, { target: document.body });
  await settle();
  expect(nameInput().value).toBe('Hồ sơ A');
  component.setReady(false);
  await settle();
  expect(nameInput().value).toBe('');
  expect(birthInput().value).toBe('');
  expect(nameInput().disabled).toBe(true);
  component.selectUser('B');
  await settle();
  expect(mocks.read).toHaveBeenCalledTimes(1);
  component.setReady(true);
  await settle();
  expect(nameInput().value).toBe('Hồ sơ B');
  expect(mocks.read.mock.calls.map(call => call[0])).toEqual(['A', 'B']);
});

it('ignores delayed reads and saves when the profile owner changes', async () => {
  let finishA!: (value: BiorhythmProfile) => void;
  mocks.read.mockImplementation((owner: string) => owner === 'A'
    ? new Promise<BiorhythmProfile>(resolve => { finishA = resolve; })
    : Promise.resolve(profile(`Hồ sơ ${owner}`)));
  component = mount(Harness, { target: document.body });
  await settle();
  component.selectUser('B');
  await settle();
  finishA(profile('Hồ sơ A'));
  await settle();
  expect(nameInput().value).toBe('Hồ sơ B');
  let finishSave!: (value: boolean) => void;
  mocks.save.mockImplementation(() => new Promise<boolean>(resolve => { finishSave = resolve; }));
  nameInput().value = 'Đang sửa B';
  nameInput().dispatchEvent(new Event('input', { bubbles: true }));
  nameInput().dispatchEvent(new Event('blur', { bubbles: true }));
  await settle();
  expect(mocks.save).toHaveBeenCalledWith('B', expect.objectContaining({ name: 'Đang sửa B' }));
  component.selectUser('C');
  await settle();
  finishSave(false);
  await settle();
  expect(nameInput().value).toBe('Hồ sơ C');
  expect(document.querySelector('.bio-error')).toBeNull();
});

it('blocks writes after read failure and saves the current date after a successful retry', async () => {
  mocks.read.mockRejectedValueOnce(new Error('storage unavailable')).mockResolvedValue(profile('Đã đọc lại'));
  component = mount(Harness, { target: document.body });
  await settle();
  expect(nameInput().disabled).toBe(true);
  nameInput().dispatchEvent(new Event('blur', { bubbles: true }));
  await settle();
  expect(mocks.save).not.toHaveBeenCalled();
  document.querySelector<HTMLButtonElement>('.bio-profile .bio-chip')!.click();
  await settle();
  birthInput().value = '1995-01-31';
  birthInput().dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
  expect(birthTextInput().value).toBe('31/01/1995');
  expect(mocks.save).toHaveBeenCalledWith('A', { version: 1, name: 'Đã đọc lại', birthDate: '1995-01-31' });
});

it('accepts manual Vietnamese DD/MM/YYYY birth dates and rejects invalid calendar dates', async () => {
  mocks.read.mockResolvedValue(profile('An'));
  component = mount(Harness, { target: document.body });
  await settle();
  expect(birthTextInput().value).toBe('15/08/1992');

  birthTextInput().value = '5/8/1990';
  birthTextInput().dispatchEvent(new Event('input', { bubbles: true }));
  birthTextInput().dispatchEvent(new Event('blur', { bubbles: true }));
  await settle();
  expect(birthTextInput().value).toBe('05/08/1990');
  expect(birthInput().value).toBe('1990-08-05');
  expect(mocks.save).toHaveBeenLastCalledWith('A', { version: 1, name: 'An', birthDate: '1990-08-05' });

  mocks.save.mockClear();
  birthTextInput().value = '31/02/2000';
  birthTextInput().dispatchEvent(new Event('input', { bubbles: true }));
  birthTextInput().dispatchEvent(new Event('blur', { bubbles: true }));
  await settle();
  expect(document.querySelector('.bio-error[role="alert"]')).not.toBeNull();
  expect(mocks.save).not.toHaveBeenCalled();
});

async function openChart() {
  mocks.read.mockResolvedValue(profile('An'));
  component = mount(Harness, { target: document.body });
  await settle();
  const chart = document.querySelector<SVGSVGElement>('.bio-chart svg')!;
  vi.spyOn(chart, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 600, bottom: 200, width: 600, height: 200,
    toJSON: () => ({ x: 0, y: 0, width: 600, height: 200 }),
  });
  return chart;
}

function chartPointer(
  chart: SVGSVGElement,
  type: string,
  options: { id?: number; x?: number; y?: number; primary?: boolean; button?: number; pointerType?: string } = {},
) {
  const event = new MouseEvent(type, {
    bubbles: true, cancelable: true, button: options.button ?? 0,
    clientX: options.x ?? 590, clientY: options.y ?? 80,
  });
  Object.defineProperties(event, {
    pointerId: { value: options.id ?? 7 },
    isPrimary: { value: options.primary ?? true },
    pointerType: { value: options.pointerType ?? 'touch' },
  });
  chart.dispatchEvent(event);
  flushSync();
  expect(event.defaultPrevented).toBe(false);
}

const chartDay = () => document.querySelector('.bio-day-center strong')!.textContent;
const finalChartDay = (chart: SVGSVGElement) => [...chart.querySelectorAll('text')].at(-1)!.textContent!.trim();

it.each(['touch', 'mouse', 'pen'])('selects a biorhythm chart day only after a deliberate primary %s release', async pointerType => {
  const chart = await openChart();
  const before = chartDay();
  chartPointer(chart, 'pointerdown', { pointerType });
  expect(chartDay()).toBe(before);
  chartPointer(chart, 'pointermove', { pointerType, x: 592, y: 81 });
  chartPointer(chart, 'pointerup', { pointerType, x: 592, y: 81 });
  expect(chartDay()).toBe(finalChartDay(chart));
});

it.each(['cancel-before-up', 'up-before-cancel'])('keeps the biorhythm chart day during a vertical pan (%s)', async order => {
  const chart = await openChart();
  const before = chartDay();
  chartPointer(chart, 'pointerdown');
  if (order === 'cancel-before-up') {
    chartPointer(chart, 'pointermove', { y: 120 });
    chartPointer(chart, 'pointercancel', { y: 120 });
    chartPointer(chart, 'pointerup', { y: 120 });
  } else {
    // Native WebKit can deliver the moved release before its cancellation.
    chartPointer(chart, 'pointerup', { y: 120 });
    chartPointer(chart, 'pointercancel', { y: 120 });
  }
  expect(chartDay()).toBe(before);
});

it('does not select a biorhythm chart day when a moved pointer returns to its starting point', async () => {
  const chart = await openChart();
  const before = chartDay();
  chartPointer(chart, 'pointerdown');
  chartPointer(chart, 'pointermove', { y: 120 });
  chartPointer(chart, 'pointermove');
  chartPointer(chart, 'pointerup');
  expect(chartDay()).toBe(before);
});

it.each(['pointerup', 'pointercancel'])('ignores a mismatched biorhythm chart %s without selecting for that pointer', async type => {
  const chart = await openChart();
  const before = chartDay();
  chartPointer(chart, 'pointerdown');
  chartPointer(chart, type, { id: 8 });
  expect(chartDay()).toBe(before);
  chartPointer(chart, 'pointerup');
  expect(chartDay()).toBe(finalChartDay(chart));
});

it('does not select a biorhythm chart day after another pointer joins the gesture', async () => {
  const chart = await openChart();
  const before = chartDay();
  chartPointer(chart, 'pointerdown');
  chartPointer(chart, 'pointerdown', { id: 8, primary: false });
  chartPointer(chart, 'pointerup', { id: 8, primary: false });
  chartPointer(chart, 'pointerup');
  expect(chartDay()).toBe(before);
});

it.each(['pointercancel', 'pointerleave', 'lostpointercapture'])('does not select a canceled biorhythm chart tap after %s', async type => {
  const chart = await openChart();
  const before = chartDay();
  chartPointer(chart, 'pointerdown');
  chartPointer(chart, type);
  chartPointer(chart, 'pointerup');
  expect(chartDay()).toBe(before);
});

it.each([{ primary: false }, { button: 2 }])('ignores a non-primary biorhythm chart action %j', async options => {
  const chart = await openChart();
  const before = chartDay();
  chartPointer(chart, 'pointerdown', options);
  chartPointer(chart, 'pointerup', options);
  expect(chartDay()).toBe(before);
});
