import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import DailyRoutineEditor from '$lib/components/practice/personal/DailyRoutineEditor.svelte';
import { createPersonalPracticeStorage } from '$lib/browser/personal-practice-storage';
import { ROSARY_PHRASES } from '$lib/domain/practice/guided-sessions';

vi.mock('$lib/stores/locale.svelte', () => ({ getLocaleContext: () => ({ current: 'vi' }) }));
let component: ReturnType<typeof DailyRoutineEditor> | undefined;
const scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
const settle = async () => { for (let index = 0; index < 5; index++) { await Promise.resolve(); flushSync(); } };
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent?.trim() === label)!;
function change(input: HTMLInputElement, value: string) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); flushSync(); }
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn());
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value() {} });
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  });
});
afterEach(async () => {
  if (component) await unmount(component);
  if (scrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  component = undefined; expect(fetch).not.toHaveBeenCalled(); document.body.replaceChildren(); localStorage.clear(); vi.unstubAllGlobals();
});
async function setup() {
  const owner = createPersonalPracticeStorage(localStorage, 'editor-validation');
  const save = vi.spyOn(owner, 'saveRoutine'); const run = vi.fn();
  component = mount(DailyRoutineEditor, { target: document.body, props: {
    storage: owner, onRun: run,
    dedicationTemplates: [{ id: 'local-test', title: 'HỒI HƯỚNG', text: 'HỒI HƯỚNG\nNguyện đem công đức này.' }],
  } });
  await settle(); button('Tạo thời khóa mới').click(); await settle();
  document.querySelector<HTMLElement>('[role="combobox"][aria-label="Thêm bước"]')!.click(); await settle();
  button('Lần tràng hạt').click(); await settle();
  document.querySelector<HTMLElement>('[role="combobox"][aria-label="Chọn danh hiệu"]')!.click(); await settle();
  button('Tùy chọn').click(); await settle();
  document.querySelector<HTMLElement>('[role="combobox"][aria-label="Thêm bước"]')!.click(); await settle();
  button('Thiền định').click(); await settle();
  document.querySelectorAll<HTMLElement>('.step-card summary')[0].click(); await settle();
  const phrase = document.querySelector<HTMLInputElement>('.step-card input[maxlength="500"]')!;
  save.mockClear();
  return { owner, save, run, phrase };
}
it('keeps the dialog open when an unsupported 121-character recitation cannot be saved', async () => {
  const { save, run, phrase } = await setup(); change(phrase, 'A'.repeat(121));
  button('Lưu thời khóa').click(); await settle();
  expect(document.querySelector('dialog[open] [role="status"]')?.textContent).toContain('120');
  expect(save).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
});
it('preserves long canonical recitations and trims surrounding whitespace before saving', async () => {
  const { owner, save, phrase } = await setup();
  const canonical = ROSARY_PHRASES.find(item => item.length > 120)!;
  expect(canonical).toBeDefined(); change(phrase, `  ${canonical}  `);
  button('Lưu thời khóa').click(); await settle();
  expect(save).toHaveBeenCalledOnce();
  const custom = owner.getRoutines().find(item => item.id !== 'sample_morning_routine' && item.id !== 'sample_evening_routine');
  expect(custom?.steps.find(step => step.kind === 'rosary')).toMatchObject({ phrase: canonical });
});
it('accepts a120character custom recitation without truncating its wording', async () => {
  const { owner, phrase } = await setup(); const text = 'A'.repeat(120); change(phrase, ` ${text} `);
  button('Lưu thời khóa').click(); await settle();
  const custom = owner.getRoutines().find(item => item.id !== 'sample_morning_routine' && item.id !== 'sample_evening_routine');
  expect(custom?.steps.find(step => step.kind === 'rosary')).toMatchObject({ phrase: text });
});
