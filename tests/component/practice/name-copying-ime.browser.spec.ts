import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import NameCopying from '$lib/components/practice/name-copying/NameCopying.svelte';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/stores/locale.svelte', () => ({ getLocaleContext: () => ({ current: 'vi' }) }));

let component: ReturnType<typeof NameCopying> | undefined;
const scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
const line = (index: number) => document.getElementById(`name-line-${index}`) as HTMLInputElement;
const settle = async () => { for (let turn = 0; turn < 5; turn++) { await Promise.resolve(); flushSync(); } };

beforeEach(async () => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn());
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value() {} });
  component = mount(NameCopying, { target: document.body, props: { principal: null } });
  await settle();
  line(0).focus();
});

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  if (scrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  expect(fetch).not.toHaveBeenCalled();
  document.body.replaceChildren(); localStorage.clear(); vi.unstubAllGlobals();
});

async function input(value: string, { composing = false, caret = value.length, data = null as string | null } = {}) {
  const field = line(0);
  field.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data, isComposing: composing }));
  field.value = value;
  field.setSelectionRange(caret, caret);
  field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data, isComposing: composing }));
  await settle();
}

it.each(['Telex', 'VNI'])('waits for the final exact tone in a non-composing %s syllable before advancing', async method => {
  const prefix = 'NAM MÔ A DI ĐÀ ';
  const stages = method === 'Telex'
    ? [['p', 'p'], ['ph', 'h'], ['pha', 'a'], ['phâ', 'a'], ['phât', 't']]
    : [['p', 'p'], ['ph', 'h'], ['pha', 'a'], ['phat', 't'], ['phât', '6']];
  for (const [syllable, data] of stages) {
    await input(prefix + syllable, { data });
    expect(line(0).value).toBe(prefix + syllable);
    expect(document.activeElement).toBe(line(0));
    expect(line(1).value).toBe('');
    expect(document.querySelectorAll('.status.checked')).toHaveLength(0);
  }
  await input(prefix + 'phật', { data: method === 'Telex' ? 'j' : '5' });
  expect(line(0).value).toBe('NAM MÔ A DI ĐÀ PHẬT');
  expect(document.activeElement).toBe(line(1));
  expect(line(1).value).toBe('');
  expect(document.querySelectorAll('.status.checked')).toHaveLength(1);
});

it('retains the exact live value and insertion point when editing a previous word', async () => {
  await input('NAM MÔ A DI ĐÀ phât');
  await input('NAM mo A DI ĐÀ phât', { caret: 6, data: 'o' });
  expect(line(0).value).toBe('NAM mo A DI ĐÀ phât');
  expect(line(0).selectionStart).toBe(6);
  expect(line(0).selectionEnd).toBe(6);
  expect(document.activeElement).toBe(line(0));
  expect(line(1).value).toBe('');
});

it('keeps decomposed pending text intact and advances once after a committed exact composition', async () => {
  const field = line(0);
  field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  const pending = 'Nam mô A Di Đà phât'.normalize('NFD');
  await input(pending, { composing: true });
  expect(field.value).toBe(pending);
  expect(document.activeElement).toBe(field);
  field.value = 'Nam mô A Di Đà phật'.normalize('NFD');
  field.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'phật' }));
  await settle();
  expect(field.value).toBe('NAM MÔ A DI ĐÀ PHẬT');
  expect(document.activeElement).toBe(line(1));
  field.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'phật', inputType: 'insertText' }));
  await settle();
  expect(document.activeElement).toBe(line(1));
  expect(line(1).value).toBe('');
  expect(document.querySelectorAll('.status.checked')).toHaveLength(1);
});

it('retains the explicit whitespace and Enter commits for an unaccented final word', async () => {
  await input('nam mo a di da phat');
  expect(line(0).value).toBe('NAM MÔ A DI ĐÀ phat');
  expect(document.activeElement).toBe(line(0));
  line(0).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }));
  await settle();
  expect(line(0).value).toBe('NAM MÔ A DI ĐÀ PHẬT');
  expect(document.activeElement).toBe(line(1));
});
