import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
