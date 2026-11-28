// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Harness from './copying-editor-harness.svelte';
import { setRichCopySelection, richCopySelection, richCopyText } from '../../../src/lib/browser/copying-rich-text';

import { readFileSync } from 'node:fs';
import { chromium, webkit } from '@playwright/test';
import ts from 'typescript';

it('keeps the writing header above a locked, previously scrolled background and keyboard pan on each platform', async () => {
  const route = readFileSync('src/routes/tu-tap/chep-kinh/+page.svelte', 'utf8');
  const css = route.split('<style>')[1].split('</style>')[0].replace(/:global\(([^)]+)\)/g, '$1');
  const lock = ts.transpile(readFileSync('src/lib/browser/scroll-lock.ts', 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, ''), { target: ts.ScriptTarget.ES2022 });
  // Exercise the route's actual viewport owner, not a second implementation of its offsets.
  const viewportOwner = ts.transpile(route.slice(route.indexOf('    const viewport = window.visualViewport;'),
    route.indexOf('    untrack(update);') + '    untrack(update);'.length), { target: ts.ScriptTarget.ES2022 });
  for (const engine of process.env.COPYING_GEOMETRY_WEBKIT === '1' ? [chromium, webkit] : [chromium]) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 402, height: 874 } });
      for (const platform of ['ios', 'android', 'web']) for (const scroll of [0, 64, 180]) {
        await page.setContent(`<style>:root{--app-safe-top:32px}html,body{margin:0}body{min-height:2000px}${css}</style>
          <div class="copy-page copy-writing ${platform === 'ios' ? 'copy-ios' : ''}"><header class="writing-bar"><button aria-label="Đổi kinh hoặc phẩm">Quay lại</button></header>
          <div id="copy-text" contenteditable="true">TỊNH KHẨU NGHIỆP</div></div>`);
        const result = await page.evaluate(({ platform, scroll, lock, viewportOwner }) => {
          document.documentElement.dataset.nativeApp = String(platform !== 'web');
          window.scrollTo(0, scroll);
          const savedScroll = window.scrollY;
          const native = "const isNativeApp=()=>platform!=='web', nativePlatform=()=>platform;";
          const release = new Function('platform', `${native}${lock}; return acquireScrollLock();`)(platform) as () => void;
          const lockedTop = document.body.getBoundingClientRect().top;
          const viewport = new EventTarget() as EventTarget & { height: number; offsetTop: number; pageTop: number };
          Object.assign(viewport, { height: innerHeight, offsetTop: 0, pageTop: window.scrollY });
          Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
          const update = new Function('platform', `${native}let keyboardOpen=false,lastFollowTop=0,sourceLayoutVersion=0;
            const untrack=fn=>fn(),tick=()=>Promise.resolve(),followEditorCaret=()=>{},scheduleEditorReflow=()=>{};
            ${viewportOwner}; return update;`)(platform) as () => void;
          const back = document.querySelector('button')!;
          const before = back.getBoundingClientRect().top;
          document.getElementById('copy-text')!.focus({ preventScroll: true });
          Object.assign(viewport, { height: 480, offsetTop: 24, pageTop: window.scrollY + 24 });
          update();
          const keyboard = { top: back.getBoundingClientRect().top, bottom: back.getBoundingClientRect().bottom,
            workspaceHeight: document.querySelector('.copy-writing')!.getBoundingClientRect().height };
          release();
          return { savedScroll, lockedTop, before, keyboard, restoredScroll: window.scrollY };
        }, { platform, scroll, lock, viewportOwner });
        expect(result.savedScroll).toBe(scroll);
        expect(result.lockedTop).toBeCloseTo(-scroll);
        const safeTop = platform === 'web' ? 0 : 32;
        expect(result.before).toBeGreaterThanOrEqual(safeTop);
        expect(result.keyboard.top).toBeGreaterThanOrEqual(safeTop + 24);
        expect(result.keyboard.bottom).toBeLessThan(24 + 480);
        expect(result.keyboard.workspaceHeight).toBe(480);
        expect(result.restoredScroll).toBe(scroll);
      }
    } finally { await browser.close(); }
  }
});

let instance: ReturnType<typeof Harness> | undefined;
afterEach(async () => { if (instance) await unmount(instance); instance = undefined; document.body.replaceChildren(); });
function setup(props = {}) {
  instance = mount(Harness, { target: document.body, props }); flushSync();
  const editor = document.getElementById('copy-text')!; editor.focus();
  return { editor, text: () => instance!.text() };
}
function paste(editor: HTMLElement, text: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => type === 'text/plain' ? text : '<img src=x>' } });
  editor.dispatchEvent(event); flushSync(); return event;
}
// jsdom does not perform the browser's default contenteditable mutation.
function edit(editor: HTMLElement, inputType: string, data: string | null = null) {
  const event = new InputEvent('beforeinput', { inputType, data, bubbles: true, cancelable: true });
  editor.dispatchEvent(event);
  if (!event.defaultPrevented) {
    const text = editor.textContent ?? '';
    let [start, end] = richCopySelection(editor) ?? [text.length, text.length];
    if (inputType === 'deleteContentBackward' && start === end) start = Math.max(0, start - 1);
    if (inputType === 'deleteContentForward' && start === end) end = Math.min(text.length, end + 1);
    editor.textContent = text.slice(0, start) + (data ?? '') + text.slice(end);
    setRichCopySelection(editor, start + (data?.length ?? 0), start + (data?.length ?? 0));
    editor.dispatchEvent(new InputEvent('input', { inputType, data, bubbles: true }));
  }
  flushSync();
}
const traceRuns = [{ text: 'ABCDEF', bold: false, align: 'left' as const, line: 0 }];
it.each(['ddaf phaatj', 'd9a2 pha6t5'])('accepts contextual raw Telex/VNI keys without composing or false mismatch: %s', keys => {
  const view = setup({ showGhost: true, ghostRuns: [{ text: 'Đà Phật. Tâm.', bold: false, align: 'left', line: 0 }] });
  for (const key of keys) edit(view.editor, 'insertText', key);
  expect(view.text()).toBe('Đà Phật');
  expect(richCopyText(view.editor)).toBe(view.text());
  expect(instance!.mismatchWords()).toEqual([]);
  const before = view.text();
  edit(view.editor, 'insertText', 'j');
  expect(view.text()).toBe(before);
  expect(instance!.mismatchWords()).toHaveLength(1);
  edit(view.editor, 'insertText', ' ');
  edit(view.editor, 'insertText', 'j');
  expect(instance!.mismatchWords()).toHaveLength(2);
});

it('rolls a rejected IME DOM back before the next composition starts in the same task', async () => {
  const initial = 'Nam mô ';
  const view = setup({ initial, showGhost: true, ghostRuns: [{ text: 'Nam mô A Di Đà Phật.', bold: false, align: 'left', line: 0 }] });
  view.editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  const node = view.editor.querySelector('[data-copy-typed]')!.firstChild as Text;
  node.appendData('sai');
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: 'sai', bubbles: true }));
  view.editor.dispatchEvent(new CompositionEvent('compositionend', { data: 'sai', bubbles: true }));
  view.editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  expect(richCopyText(view.editor)).toBe(initial);
  expect(richCopySelection(view.editor)).toEqual([initial.length, initial.length]);
  const correctedNode = view.editor.querySelector('[data-copy-typed]')!.firstChild as Text;
  correctedNode.appendData('a');
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: 'a', bubbles: true }));
  view.editor.dispatchEvent(new CompositionEvent('compositionend', { data: 'a', bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0)); flushSync();
  expect(view.text()).toBe(initial + 'A');
  expect(richCopyText(view.editor)).toBe(initial + 'A');
  view.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); flushSync();
  expect(view.text()).toBe(initial);
});

it('reconciles non-cancelable raw Telex keys and keeps modifier no-ops out of undo history', () => {
  const view = setup({ showGhost: true, ghostRuns: [{ text: 'Đà Phật.', bold: false, align: 'left', line: 0 }] });
  for (const key of 'ddaf phaatj') {
    const current = view.text();
    view.editor.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: key, bubbles: true, cancelable: false }));
    view.editor.textContent = current + key;
    setRichCopySelection(view.editor, current.length + 1, current.length + 1);
    view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: key, bubbles: true }));
    flushSync();
    expect(richCopyText(view.editor)).toBe(view.text());
  }
  expect(view.text()).toBe('Đà Phật');
  expect(instance!.mismatchWords()).toEqual([]);
  view.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); flushSync();
  expect(view.text()).toBe('Đà Phậ');
  edit(view.editor, 'insertText', 'j');
  expect(instance!.mismatchWords()).toHaveLength(1);
  setRichCopySelection(view.editor, 0, 1);
  edit(view.editor, 'insertText', 'd');
  expect(view.text()).toBe('dà Phậ');
});
it.each(['X', 'LỜI NGUYỆN TRƯỚC KHI TỤNG KINH\n' + 'Con thàmh tâm đảnh lễ chư Phật. '.repeat(4)])('aligns restored imperfect draft %j and caret corrections with the ghost without forcing its spelling', async initial => {
  const heading = 'LỜI NGUYỆN TRƯỚC KHI TỤNG KINH\n';
  const view = setup({ initial, showGhost: true, ghostRuns: [
    { text: heading, bold: false, align: 'center', line: 0 },
    { text: 'Con thành tâm đảnh lễ chư Phật. '.repeat(16), bold: false, align: 'justify', line: 1 },
  ] });
  const css = readFileSync('src/lib/components/RichCopyEditor.svelte', 'utf8').split('<style>')[1].split('</style>')[0].replace(/:global\(([^)]+)\)/g, '$1');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const check = async (expectedText: string) => {
      expect(view.text()).toBe(expectedText);
      expect(richCopyText(view.editor)).toBe(expectedText);
      expect(view.editor.textContent).toBe(expectedText);
      await page.setContent(`<style>${css}</style>${document.querySelector('.rich-copy-container')!.outerHTML}`);
      for (const width of [300, 700]) {
        const displacement = await page.evaluate(({ width, length }) => {
          const container = document.querySelector<HTMLElement>('.rich-copy-container')!;
          container.style.cssText += `;width:${width}px;height:180px`;
          const ink = document.querySelector<HTMLElement>('#copy-text')!, ghost = document.querySelector<HTMLElement>('.rich-copy-ghost')!;
          const glyphs = (root: HTMLElement) => {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), rects: DOMRect[] = [];
            let node: Node | null;
            while ((node = walker.nextNode()) && rects.length < length) for (let offset = 0; offset < (node.textContent?.length ?? 0) && rects.length < length; offset++) {
              const range = document.createRange(); range.setStart(node, offset); range.setEnd(node, offset + 1);
              rects.push(range.getBoundingClientRect());
            }
            return rects;
          };
          let maximum = 0;
          for (const scroll of [0, 60]) {
            ink.scrollTop = scroll; ghost.scrollTop = ink.scrollTop;
            const actual = glyphs(ink), expected = glyphs(ghost);
            for (let index = 0; index < actual.length; index++) maximum = Math.max(maximum, Math.abs(actual[index].x - expected[index].x), Math.abs(actual[index].y - expected[index].y));
          }
          return maximum;
        }, { width, length: expectedText.length });
        expect(displacement).toBeLessThanOrEqual(0.5);
      }
    };
    await check(initial);
    setRichCopySelection(view.editor, 1, 1);
    edit(view.editor, 'insertText', '?');
    expect(richCopySelection(view.editor)).toEqual([2, 2]);
    await check(initial.slice(0, 1) + '?' + initial.slice(1));
    setRichCopySelection(view.editor, view.text().length, view.text().length);
    edit(view.editor, 'insertText', '!');
    await check(initial.slice(0, 1) + '?' + initial.slice(1) + '!');
  } finally { await browser.close(); }
});
it('continues the ghost on the same line as the draft when there is room', async () => {
  const heading = 'LỜI NGUYỆN TRƯỚC KHI TỤNG KINH\n';
  const prefix = 'Con thanh tam danh le, cui xin chu Phat tu bi';
  setup({ initial: heading + prefix, showGhost: true, ghostRuns: [
    { text: heading, bold: true, align: 'center', line: 0 },
    { text: 'Con thành tâm đảnh lễ, cúi xin chư Phật từ bi chứng giám. Con tự biết thân tâm còn nhiều nghiệp chướng.', bold: false, align: 'justify', line: 1 },
  ] });
  const css = readFileSync('src/lib/components/RichCopyEditor.svelte', 'utf8').split('<style>')[1].split('</style>')[0].replace(/:global\(([^)]+)\)/g, '$1');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 750 } });
    await page.setContent('<style>' + css + '</style>' + document.querySelector('.rich-copy-container')!.outerHTML);
    const positions = await page.evaluate(() => {
      const box = document.querySelector<HTMLElement>('.rich-copy-container')!;
      box.style.cssText += ';width:355px;height:450px;--copy-font-size:24px';
      const line = (selector: string) => document.querySelector(selector + ' [data-copy-line="1"]')!;
      const tail = line('#copy-text').querySelector('[data-copy-typed]')!.lastChild!;
      const future = line('.rich-copy-ghost').lastChild!.firstChild!;
      const range = document.createRange();
      const measure = (node: Node, offset: number) => { range.setStart(node, offset); range.setEnd(node, offset + 1); return range.getBoundingClientRect(); };
      const ink = measure(tail, tail.textContent!.length - 1);
      const ghost = measure(future, future.textContent!.search(/\S/));
      return { inkY: ink.y, ghostY: ghost.y, inkRight: ink.right, ghostLeft: ghost.left };
    });
    expect(positions.ghostY).toBe(positions.inkY);
    expect(positions.ghostLeft).toBeGreaterThanOrEqual(positions.inkRight);
  } finally { await browser.close(); }
});

it.each(['lời', 'lời'.normalize('NFD')])('snaps committed Vietnamese IME text %j to canonical ghost and aligns at narrow and wide wraps', async committed => {
  const view = setup({ showGhost: true, ghostRuns: [
    { text: 'LỜI NGUYỆN TRƯỚC KHI TỤNG KINH', bold: false, align: 'center', line: 0 },
    { text: '\nCon thành tâm đảnh lễ chư Phật.', bold: false, align: 'left', line: 1 },
  ] });
  view.editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  view.editor.textContent = committed;
  setRichCopySelection(view.editor, committed.length, committed.length);
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: committed, bubbles: true }));
  view.editor.dispatchEvent(new CompositionEvent('compositionend', { data: committed, bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0)); flushSync();
  expect(view.text()).toBe('LỜI');
  expect(richCopyText(view.editor)).toBe('LỜI');
  expect(richCopySelection(view.editor)).toEqual([3, 3]);

  // Use the mounted component's actual DOM, not an independent renderer model.
  const markup = document.querySelector('.rich-copy-container')!.outerHTML;
  const source = readFileSync('src/lib/components/RichCopyEditor.svelte', 'utf8');
  const css = source.split('<style>')[1].split('</style>')[0].replace(/:global\(([^)]+)\)/g, '$1');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>${css}</style>${markup}`);
    for (const width of [300, 700]) {
      const displacement = await page.evaluate(width => {
        const container = document.querySelector<HTMLElement>('.rich-copy-container')!;
        container.style.cssText += `;width:${width}px;height:180px;font-family:monospace`;
        const ink = document.querySelector<HTMLElement>('#copy-text')!, ghost = document.querySelector<HTMLElement>('.rich-copy-ghost')!;
        ink.style.fontFamily = ghost.style.fontFamily = 'monospace';
        const firstGlyph = (root: HTMLElement) => {
          const node = document.createTreeWalker(root, NodeFilter.SHOW_TEXT).nextNode()!;
          const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, 1);
          return range.getBoundingClientRect();
        };
        const actual = firstGlyph(ink), expected = firstGlyph(ghost);
        return Math.max(Math.abs(actual.x - expected.x), Math.abs(actual.y - expected.y));
      }, width);
      expect(displacement).toBeLessThanOrEqual(0.5);
    }
  } finally { await browser.close(); }
  view.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
  flushSync(); expect(view.text()).toBe('');
});
it('places the caret inside the next paragraph when tracing ends on its separator', () => {
  const heading = 'LỜI NGUYỆN\n';
  const view = setup({ initial: heading, showGhost: true, ghostRuns: [
    { text: heading, bold: true, align: 'center', line: 0 },
    { text: 'Con thành tâm.', bold: false, align: 'justify', line: 2 },
  ] });
  setRichCopySelection(view.editor, heading.length, heading.length);
  const anchor = window.getSelection()!.anchorNode as Text;
  expect(anchor.parentElement?.closest('[data-copy-line]')?.getAttribute('data-copy-line')).toBe('2');
  view.editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  anchor.appendData('Con');
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: 'Con', bubbles: true }));
  flushSync();
  expect(view.text()).toBe(heading + 'Con');
});

it.each([['C', 'on', 'Con thành tâm.', 'Con'], ['Con da b', 'iet', 'Con da biết rồi.', 'Con da biết']])('keeps a composed word together after %s when the keyboard inserts a block wrapper', async (initial, inserted, reference, expected) => {
  const view = setup({ initial, showGhost: true, ghostRuns: [{ text: reference, bold: false, align: 'left', line: 0 }] });
  setRichCopySelection(view.editor, initial.length, initial.length);
  view.editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  const fragment = document.createElement('div');
  fragment.textContent = inserted;
  view.editor.querySelector('[data-copy-line]')!.append(fragment);
  expect(richCopyText(view.editor)).toBe(initial + '\n' + inserted);
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: inserted, bubbles: true }));
  view.editor.dispatchEvent(new CompositionEvent('compositionend', { data: inserted, bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0)); flushSync();
  expect(view.text()).toBe(expected);
  expect(richCopyText(view.editor)).toBe(expected);
  expect(richCopySelection(view.editor)).toEqual([expected.length, expected.length]);
});

it('keeps an empty tracing caret at the first paragraph without future draft text', () => {
  const view = setup({ showGhost: true, ghostRuns: [...traceRuns, { text: 'Later paragraph', bold: false, align: 'left', line: 1 }] });
  expect(richCopyText(view.editor)).toBe('');
  setRichCopySelection(view.editor, 0, 0);
  const anchor = window.getSelection()!.anchorNode;
  expect(anchor?.parentElement?.closest('[data-copy-line]')?.getAttribute('data-copy-line')).toBe('0');
  edit(view.editor, 'insertText', 'A');
  expect(richCopyText(view.editor)).toBe('A');
});
it('keeps real glyph geometry aligned with the full reference at every font, wrap and scroll position', async () => {
  const renderer = readFileSync('src/lib/browser/copying-layout.ts', 'utf8').split('/** Measure')[0]
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  const script = ts.transpile(renderer, { target: ts.ScriptTarget.ES2022 });
  const component = readFileSync('src/lib/components/RichCopyEditor.svelte', 'utf8');
  const css = component.split('<style>')[1].split('</style>')[0].replace(/:global\(([^)]+)\)/g, '$1');
  const fonts = [
    ['CopyBookerly', 'static/fonts/bookerly/bookerly-regular.ttf'],
    ['CopyMali', 'static/fonts/copying/Mali-Regular.ttf'],
    ['CopyBrignola', 'static/fonts/copying/MTD-Brignola-PUA-Script.otf'],
  ].map(([family, path]) => `@font-face{font-family:${family};src:url(data:font/ttf;base64,${readFileSync(path).toString('base64')})}`).join('');
  // CI installs Chromium; opt in to the installed WebKit engine for compatibility checks.
  for (const engine of process.env.COPYING_GEOMETRY_WEBKIT === '1' ? [chromium, webkit] : [chromium]) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>${fonts}${css}</style><div class="rich-copy-container" style="height:180px;--copy-paper-ink:#222;--border:#ccc"><div class="rich-copy-ghost" contenteditable="true" inert tabindex="-1"></div><div id="copy-text" class="rich-copy" data-has-ghost="true" contenteditable="true"></div></div>`);
    await page.evaluate(() => Promise.all(['CopyBookerly', 'CopyMali', 'CopyBrignola'].map(font => document.fonts.load(`20px ${font}`))));
    const results = await page.evaluate(({ script }) => {
      const render = new Function(`${script}; return { renderCopyRuns, renderGhostRuns, traced: typeof renderTracedCopyRuns === 'function' ? renderTracedCopyRuns : null };`)();
      const container = document.querySelector<HTMLElement>('.rich-copy-container')!;
      const ink = document.querySelector<HTMLElement>('#copy-text')!, ghost = document.querySelector<HTMLElement>('.rich-copy-ghost')!;
      const hasRules = () => [container, ink, ghost].some(element => [null, '::before', '::after'].some(pseudo => getComputedStyle(element, pseudo).backgroundImage.includes('repeating-linear-gradient')));
      ghost.focus();
      if (document.activeElement === ghost) throw new Error('visual ghost layer must remain unfocusable');
      for (const enabled of ['false', 'true']) {
        ink.dataset.hasGhost = enabled;
        if (!hasRules()) throw new Error(`notebook rules missing when ghost=${enabled}`);
      }
      const reference = [{ text: 'LỜI NGUYỆN TRƯỚC KHI TỤNG KINH', bold: true, align: 'center', line: 0 },
        { text: ' Con thành tâm đảnh lễ, cúi xin chư Phật từ bi chứng giám. '.repeat(12), bold: false, align: 'left', line: 1 }];
      const glyphs = (root: HTMLElement, maximum: number) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), rects: DOMRect[] = [];
        const range = document.createRange();
        let node: Node | null;
        while ((node = walker.nextNode()) && rects.length < maximum) {
          const length = Math.min(node.textContent?.length ?? 0, maximum - rects.length);
          for (let i = 0; i < length; i++) {
            range.setStart(node, i); range.setEnd(node, i + 1); rects.push(range.getBoundingClientRect());
          }
        }
        return rects;
      };
      const results: number[] = [];
      for (const width of [300, 700]) for (const size of [20, 24]) for (const font of ['Arial', 'CopyBookerly', 'CopyMali', 'CopyBrignola']) for (const scale of [1, 1.35]) for (const length of [4, 180]) for (const spacing of [1.5, 1.8, 1.9, 2]) {
        container.style.width = `${width}px`; container.style.fontFamily = font; container.style.setProperty('--copy-font-size', `${size}px`);
        container.style.setProperty('--copy-font-scale', String(scale));
        container.style.setProperty('--copy-line-height', String(spacing));
        if (render.traced) render.traced(ink, reference, length);
        else render.renderCopyRuns(ink, reference, 0, length);
        render.renderGhostRuns(ghost, reference, length);
        for (const scroll of [0, 80]) {
          ink.scrollTop = scroll; ghost.scrollTop = ink.scrollTop;
          const actual = glyphs(ink, length), expected = glyphs(ghost, length);
          results.push(Math.max(0, ...actual.flatMap((rect, i) => [Math.abs(rect.x - expected[i].x), Math.abs(rect.y - expected[i].y), Math.abs(rect.width - expected[i].width)])));
        }
        if (ink.textContent !== reference.map(run => run.text).join('').slice(0, length)) throw new Error('future text leaked into draft');
        const range = document.createRange(); range.selectNodeContents(ink);
        window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
        if (window.getSelection()!.toString().replace(/\s/g, '') !== ink.textContent!.replace(/\s/g, '')) throw new Error('future text leaked into native copy selection');
        if (!hasRules()) throw new Error('notebook rules missing from blank paper');
        if (Math.abs(parseFloat(getComputedStyle(ink).lineHeight) - size * scale * spacing) > 0.1) throw new Error('existing line spacing setting ignored');
      }
      return results;
    }, { script });
    expect(Math.max(...results)).toBeLessThanOrEqual(0.5);
  } finally { await browser.close(); }
  }
}, process.env.COPYING_GEOMETRY_WEBKIT === '1' ? 20_000 : 5_000);
it('paints notebook rules behind ghost glyphs rather than erasing their pixels', async () => {
  setup({ showGhost: true, ghostRuns: [{ text: 'MMMMMMMM', bold: false, align: 'center', line: 0 }] });
  const component = readFileSync('src/lib/components/RichCopyEditor.svelte', 'utf8');
  const css = component.split('<style>')[1].split('</style>')[0].replace(/:global\(([^)]+)\)/g, '$1');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>body{margin:0;background:white}${css}</style>${document.querySelector('.rich-copy-container')!.outerHTML}`);
    await page.evaluate(() => {
      const container = document.querySelector<HTMLElement>('.rich-copy-container')!;
      container.style.cssText += ';width:300px;height:180px;background:white;--border:rgb(255,0,0);--copy-paper-ink:black';
      const ink = document.querySelector<HTMLElement>('#copy-text')!, ghost = document.querySelector<HTMLElement>('.rich-copy-ghost')!;
      const node = document.createTreeWalker(ghost, NodeFilter.SHOW_TEXT).nextNode()!;
      const range = document.createRange(); range.selectNodeContents(node);
      const rect = range.getBoundingClientRect(), style = getComputedStyle(ink);
      const rule = ink.getBoundingClientRect().top + parseFloat(style.paddingTop) + parseFloat(style.lineHeight) - 1;
      // Deliberately intersect a glyph with a rule to verify paint order even
      // for a handwriting font whose ink extends beyond its normal line box.
      (node.parentElement!.closest('[data-copy-line]') as HTMLElement).style.transform = `translateY(${rule - rect.top - rect.height / 2}px)`;
    });
    const paper = page.locator('.rich-copy-container');
    const combined = (await paper.screenshot()).toString('base64');
    await page.locator('.rich-copy-ghost').evaluate(el => (el as HTMLElement).style.visibility = 'hidden');
    const ruleOnly = (await paper.screenshot()).toString('base64');
    await page.locator('.rich-copy-ghost').evaluate(el => (el as HTMLElement).style.visibility = '');
    await paper.evaluate(el => (el as HTMLElement).style.setProperty('--border', 'transparent'));
    const ghostOnly = (await paper.screenshot()).toString('base64');
    const pixels = await page.evaluate(async images => {
      const decoded = await Promise.all(images.map(async source => {
        const image = new Image(); image.src = `data:image/png;base64,${source}`; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, image.width, image.height).data;
      }));
      let intersections = 0, erased = 0;
      for (let i = 0; i < decoded[0].length; i += 4) {
        if (decoded[1][i] > 240 && decoded[1][i + 1] < 20 && decoded[1][i + 2] < 20 && decoded[2][i] < 240) {
          intersections++;
          if (decoded[0][i] >= 250) erased++;
        }
      }
      return { intersections, erased };
    }, [combined, ruleOnly, ghostOnly]);
    expect(pixels.intersections).toBeGreaterThan(5);
    expect(pixels.erased).toBe(0);
  } finally { await browser.close(); }
});
it('preserves the suffix when deleting a selected range in ghost mode', () => {
  const view = setup({ initial: 'ABCDEF', showGhost: true, ghostRuns: traceRuns });
  setRichCopySelection(view.editor, 1, 3);
  edit(view.editor, 'deleteContentBackward');
  expect(view.text()).toBe('ADEF');
});
it('deletes at the caret rather than the end of a ghost draft', () => {
  const view = setup({ initial: 'ABCDEF', showGhost: true, ghostRuns: traceRuns });
  setRichCopySelection(view.editor, 2, 2);
  edit(view.editor, 'deleteContentBackward');
  expect(view.text()).toBe('ACDEF');
});
it('retains an existing noncanonical draft when typing with ghost mode enabled', () => {
  const view = setup({ initial: 'My own draft', showGhost: true, ghostRuns: traceRuns });
  expect(view.text()).toBe('My own draft');
  setRichCopySelection(view.editor, 2, 2);
  edit(view.editor, 'insertText', '!');
  expect(view.text()).toBe('My! own draft');
  setRichCopySelection(view.editor, view.text().length, view.text().length);
  edit(view.editor, 'insertText', '?');
  expect(view.text()).toBe('My! own draft?');
});

const noteReference = [{ text: 'Nam mô A Di Đà Phật.', bold: false, align: 'left' as const, line: 0 }];
it('renders the actual saved optional note and resumes tracing after it', () => {
  const initial = 'Nam mô (3 lần) ';
  const view = setup({ initial, showGhost: true, ghostRuns: noteReference });
  expect(richCopyText(view.editor)).toBe(initial);
  edit(view.editor, 'insertText', 'a');
  expect(view.text()).toBe(initial + 'A');
  expect(richCopyText(view.editor)).toBe(view.text());
});

it('accepts an optional note typed manually in ghost mode, then resumes tracing', () => {
  const view = setup({ initial: 'Nam mô ', showGhost: true, ghostRuns: noteReference });
  for (const letter of '(3 lần) ') edit(view.editor, 'insertText', letter);
  expect(richCopyText(view.editor)).toBe('Nam mô (3 lần) ');
  edit(view.editor, 'insertText', 'a');
  expect(view.text()).toBe('Nam mô (3 lần) A');
});

it('rejects a mismatching IME commit even after its provisional spelling changes page tracing eligibility', async () => {
  const initial = 'Nam mô ';
  const view = setup({ initial, showGhost: true, ghostRuns: noteReference });
  view.editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  view.editor.textContent = initial + 'sai';
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: 'sai', bubbles: true })); flushSync();
  expect(view.text()).toBe(initial + 'sai');
  view.editor.dispatchEvent(new CompositionEvent('compositionend', { data: 'sai', bubbles: true })); flushSync();
  await new Promise(resolve => setTimeout(resolve, 0)); flushSync();
  expect(view.text()).toBe(initial);
  expect(richCopyText(view.editor)).toBe(initial);
  edit(view.editor, 'insertText', 'a');
  expect(view.text()).toBe(initial + 'A');
});

it.each(['insertReplacementText', 'insertText'])('restores ink and caret after non-cancelable keyboard input %s', inputType => {
  const initial = 'Nam mô ';
  const view = setup({ initial, showGhost: true, ghostRuns: noteReference });
  for (const word of ['sai', 'a']) {
    view.editor.dispatchEvent(new InputEvent('beforeinput', { inputType, data: word, bubbles: true, cancelable: false }));
    view.editor.textContent = initial + word;
    setRichCopySelection(view.editor, initial.length + word.length, initial.length + word.length);
    view.editor.dispatchEvent(new InputEvent('input', { inputType, data: word, bubbles: true }));
    flushSync();
    const expected = word === 'sai' ? initial : initial + 'A';
    expect(view.text()).toBe(expected);
    expect(richCopyText(view.editor)).toBe(expected);
    expect(richCopySelection(view.editor)).toEqual([expected.length, expected.length]);
  }
});
it('keeps a pointer-established selection when the editor receives focus', () => {
  const view = setup({ initial: 'Nam mô Phật' });
  view.editor.blur();
  view.editor.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  setRichCopySelection(view.editor, 0, 3);
  // Dispatch the browser-established range to the handler; jsdom's focus()
  // restores its own range before delivering focus, unlike a pointer gesture.
  view.editor.dispatchEvent(new FocusEvent('focus'));
  expect(richCopySelection(view.editor)).toEqual([0, 3]);
  window.dispatchEvent(new Event('pointerup')); flushSync();
});
it('reports selection-only caret corrections, ignores outside ranges and releases its listener on unmount', () => {
  const view = setup({ initial: 'Nam mô Phật' });
  setRichCopySelection(view.editor, 3, 3);
  document.dispatchEvent(new Event('selectionchange'));
  expect(instance!.caret().end).toBe(3);
  const notifications = instance!.caret().notifications;
  const outside = document.createElement('p'); outside.textContent = 'Kinh mẫu'; document.body.append(outside);
  const range = document.createRange(); range.selectNodeContents(outside);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  expect(instance!.caret().notifications).toBe(notifications);
  instance!.closeEditor(); flushSync();
  document.dispatchEvent(new Event('selectionchange'));
  expect(instance!.caret().notifications).toBe(notifications);
  expect(view.text()).toBe('Nam mô Phật');
});
it('does not replace text nodes beneath an active pointer selection during a layout refresh', () => {
  const view = setup({ initial: 'Nam mô Phật' });
  const original = view.editor.firstChild;
  view.editor.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  setRichCopySelection(view.editor, 0, 6);
  instance!.refreshFormatting(); flushSync();
  expect(view.editor.firstChild).toBe(original);
  expect(richCopySelection(view.editor)).toEqual([0, 6]);
  window.dispatchEvent(new Event('pointerup')); flushSync();
  expect(richCopySelection(view.editor)).toEqual([0, 6]);
});
it('blocks guest paste and accepts administrator plain text without HTML', () => {
  let view = setup(); expect(paste(view.editor, 'Nam mô Phật').defaultPrevented).toBe(true); expect(view.text()).toBe('');
});
it('pastes literal text for administrators and supports undo/redo', () => {
  const view = setup({ allowPaste: true }); paste(view.editor, 'Nam mô Phật <img>');
  expect(view.text()).toBe('Nam mô Phật <img>'); expect(view.editor.querySelector('img')).toBeNull();
  view.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); flushSync(); expect(view.text()).toBe('');
  view.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })); flushSync(); expect(view.text()).toBe('Nam mô Phật <img>');
});
it.each([
  ['guest:dia-tang:1:1:0', 'NFC'],
  ['guest:dia-tang:1:0:1', 'NFD'],
  ['account:other:dia-tang:1:0:0', 'NFD'],
] as const)('isolates undo across equal blank editing contexts %s (%s) without remounting or losing focus', (context, normalization) => {
  const view = setup({ allowPaste: true });
  const raw = 'Nam mô Địa Tạng'.normalize(normalization);
  paste(view.editor, raw);
  setRichCopySelection(view.editor, 0, raw.length);
  edit(view.editor, 'deleteContentBackward');
  expect(view.text()).toBe('');
  instance!.switchEditingContext(context, ''); flushSync();
  expect(document.getElementById('copy-text')).toBe(view.editor);
  expect(document.activeElement).toBe(view.editor);
  view.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); flushSync();
  expect(view.text()).toBe('');
  expect(richCopyText(view.editor)).toBe('');
  paste(view.editor, raw);
  expect(view.text()).toBe(raw);
  view.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); flushSync();
  expect(view.text()).toBe('');
  view.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); flushSync();
  expect(view.text()).toBe('');
});
it('preserves Enter, accents and the insertion point for the next sentence', () => {
  const view = setup({ allowPaste: true, initial: 'Nam mô Phật' });
  setRichCopySelection(view.editor, 11, 11);
  view.editor.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true })); flushSync();
  paste(view.editor, 'Địa Tạng'); expect(view.text()).toBe('Nam mô Phật\nĐịa Tạng');
});
it.each(['NFC', 'NFD'] as const)('keeps the latest plain-text IME commit and consecutive Enter edits before rendering (%s)', normalization => {
  const view = setup({ initial: 'Nam ' });
  const raw = 'Nam mô'.normalize(normalization);
  view.editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  view.editor.textContent = raw;
  setRichCopySelection(view.editor, raw.length, raw.length);
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', bubbles: true }));
  view.editor.dispatchEvent(new CompositionEvent('compositionend', { data: 'mô', bubbles: true }));
  for (const inputType of ['insertParagraph', 'insertLineBreak']) {
    view.editor.dispatchEvent(new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true }));
  }
  flushSync();
  expect(view.text()).toBe(raw + '\n\n');
  expect(richCopyText(view.editor)).toBe(raw + '\n\n');
  expect(richCopySelection(view.editor)).toEqual([raw.length + 2, raw.length + 2]);
  view.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })); flushSync();
  expect(view.text()).toBe(raw + '\n');
});
it('treats a Vietnamese IME composition as one undoable edit', async () => {
  const view = setup({ initial: 'Nam ' }); setRichCopySelection(view.editor, 4, 4);
  view.editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  view.editor.textContent = 'Nam mô';
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', bubbles: true })); flushSync();
  view.editor.textContent = 'Nam mô Phật';
  view.editor.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })); flushSync();
  await new Promise(resolve => setTimeout(resolve, 0)); flushSync();
  expect(view.text()).toBe('Nam mô Phật');
  view.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); flushSync(); expect(view.text()).toBe('Nam ');
});
it('releases parent composition state when the editor unmounts before its deferred IME commit', async () => {
  const view = setup({ initial: 'Nam ' });
  await new Promise(resolve => setTimeout(resolve, 0)); flushSync();
  const raw = 'Nam mô'.normalize('NFD');
  view.editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  view.editor.textContent = raw;
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', bubbles: true }));
  view.editor.dispatchEvent(new CompositionEvent('compositionend', { data: 'mô', bubbles: true }));
  flushSync();
  expect(instance!.isComposing()).toBe(true);
  instance!.closeEditor(); flushSync();
  expect(instance!.isComposing()).toBe(false);
  expect(view.text()).toBe(raw);
  instance!.openEditor(); flushSync();
  await new Promise(resolve => setTimeout(resolve, 0)); flushSync();
  expect(instance!.isComposing()).toBe(false);
  expect(instance!.text()).toBe(raw);
  expect(richCopyText(document.getElementById('copy-text')!)).toBe(raw);
});
it.each(['NFC', 'NFD'] as const)('does not commit an old IME DOM into a new stable editing context (%s)', async normalization => {
  const view = setup({ initial: 'Old ' });
  await new Promise(resolve => setTimeout(resolve, 0)); flushSync();
  const oldRaw = 'Old mô'.normalize(normalization);
  const newRaw = 'Bản chép mới'.normalize(normalization);
  const newContext = 'account:other:dia-tang:1:1:0';
  view.editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  view.editor.textContent = oldRaw;
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', bubbles: true }));
  view.editor.dispatchEvent(new CompositionEvent('compositionend', { data: 'mô', bubbles: true }));
  flushSync();
  expect(instance!.isComposing()).toBe(true);
  instance!.switchEditingContext(newContext, newRaw); flushSync();
  expect(document.getElementById('copy-text')).toBe(view.editor);
  expect(instance!.text()).toBe(newRaw);
  await new Promise(resolve => setTimeout(resolve, 0)); flushSync();
  expect(instance!.text()).toBe(newRaw);
  expect(richCopyText(view.editor)).toBe(newRaw);
  expect(instance!.isComposing()).toBe(false);
  expect(instance!.committedValues().filter(commit => commit.context === newContext)).toEqual([]);
});
it('keeps the IME replacement range alive through compositionend until the final commit input', async () => {
  const view = setup({ initial: 'Nam ' });
  view.editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  const node = view.editor.querySelector('span')!.firstChild as Text;
  node.appendData('thiền');
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: 'thiền', bubbles: true })); flushSync();
  const commitRange = document.createRange(); commitRange.setStart(node, 4); commitRange.setEnd(node, 9);
  view.editor.dispatchEvent(new CompositionEvent('compositionend', { data: 'thiền', bubbles: true })); flushSync();
  expect(commitRange.toString()).toBe('thiền');
  commitRange.deleteContents(); commitRange.insertNode(document.createTextNode('thiền'));
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 'thiền', bubbles: true })); flushSync();
  await new Promise(resolve => setTimeout(resolve, 0)); flushSync();
  expect(view.text()).toBe('Nam thiền');
  view.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); flushSync();
  expect(view.text()).toBe('Nam ');
});
it('does not accept a paste while a draft replacement is readonly', () => {
  const view = setup({ allowPaste: true, readonly: true, initial: 'Bản cũ' });
  paste(view.editor, 'Bản khác'); expect(view.text()).toBe('Bản cũ');
});
it('resumes a restored draft at the end and retains the caret across toolbar focus', () => {
  const view = setup({ allowPaste: true, initial: 'Nam mô' });
  paste(view.editor, ' Phật');
  expect(view.text()).toBe('Nam mô Phật');
  setRichCopySelection(view.editor, 3, 3);
  const toolbar = document.createElement('button'); document.body.append(toolbar); toolbar.focus();
  view.editor.focus(); paste(view.editor, ' thật');
  expect(view.text()).toBe('Nam thật mô Phật');
});

it('renders ghost text underlay when showGhost is enabled without polluting typed draft', () => {
  const ghostRuns = [
    { text: 'Kinh Địa Tạng in mờ', bold: true, align: 'center' as const, line: 0 },
    { text: 'Câu kinh tiếp theo in mờ.', bold: false, align: 'justify' as const, line: 1 },
  ];
  const originalRuns = JSON.stringify(ghostRuns);
  const view = setup({ showGhost: true, ghostRuns, allowPaste: true });
  const ghostEl = document.querySelector('.rich-copy-ghost');
  expect(ghostEl).not.toBeNull();
  expect(ghostEl?.getAttribute('aria-hidden')).toBe('true');
  const ghostEdit = new InputEvent('beforeinput', { inputType: 'insertText', data: 'x', bubbles: true, cancelable: true });
  ghostEl!.dispatchEvent(ghostEdit);
  expect(ghostEdit.defaultPrevented).toBe(true);
  expect(paste(ghostEl as HTMLElement, 'Not editable').defaultPrevented).toBe(true);
  expect(ghostEl?.textContent).toContain('Kinh Địa Tạng in mờ');
  expect(ghostEl?.textContent).toContain('Câu kinh tiếp theo in mờ.');

  // User types on top of ghost layer
  paste(view.editor, 'Con gõ chữ đè lên');
  expect(view.text()).toBe('Con gõ chữ đè lên');
  // The hidden prefix uses actual draft metrics; only its untouched canonical
  // tail remains visible. Neither display layer may rewrite the source/draft.
  const raw = 'Con gõ chữ đè lên';
  const tail = ghostRuns.map(run => run.text).join('').slice(raw.length);
  const ghostGlyphs = Array.from(ghostEl!.querySelectorAll<HTMLElement>('span, strong'));
  expect(ghostGlyphs.filter(el => el.style.visibility === 'hidden').map(el => el.textContent).join('')).toBe(raw);
  expect(ghostGlyphs.filter(el => el.style.visibility !== 'hidden').map(el => el.textContent).join('')).toBe(tail);
  expect(ghostEl?.textContent).toBe(raw + tail);
  expect(JSON.stringify(ghostRuns)).toBe(originalRuns);
  expect(richCopyText(view.editor)).toBe(raw);
  expect(view.editor.textContent).toBe(raw);
  expect(Array.from(view.editor.querySelectorAll<HTMLElement>('[data-copy-future]')).map(el => el.dataset.copyFuture).join('')).toBe(tail);
});

it('automatically advances canonical characters when typing on ghost text mode', () => {
  const ghostRuns = [
    { text: 'Con thành tâm', bold: false, align: 'left' as const, line: 0 },
  ];
  const view = setup({ showGhost: true, ghostRuns });
  // Type matching letter, e.g. 'c' -> advances canonical 'C'
  view.editor.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'c', bubbles: true, cancelable: true }));
  flushSync();
  expect(view.text()).toBe('C');
  expect(richCopyText(view.editor)).toBe('C');
  expect(view.editor.textContent).toBe('C');
  expect(view.editor.querySelector('[data-copy-future]')?.getAttribute('aria-hidden')).toBe('true');
  setRichCopySelection(view.editor, 1, 1);
  expect(richCopySelection(view.editor)).toEqual([1, 1]);

  // Next letter -> advances canonical 'o'
  view.editor.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'o', bubbles: true, cancelable: true }));
  flushSync();
  expect(view.text()).toBe('Co');

  // Backspace steps back
  view.editor.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
  flushSync();
  expect(view.text()).toBe('C');
});

it('keeps the ghost draft suffix for Delete at a caret and over a selection', () => {
  const view = setup({ initial: 'ABCDEF', showGhost: true, ghostRuns: traceRuns });
  setRichCopySelection(view.editor, 2, 2);
  edit(view.editor, 'deleteContentForward');
  expect(view.text()).toBe('ABDEF');
  setRichCopySelection(view.editor, 1, 3);
  edit(view.editor, 'deleteContentForward');
  expect(view.text()).toBe('AEF');
});
it('retains undo and redo for canonical tracing and Backspace without future text', () => {
  const view = setup({ showGhost: true, ghostRuns: traceRuns });
  edit(view.editor, 'insertText', 'A');
  edit(view.editor, 'insertText', 'B');
  expect(view.text()).toBe('AB');
  edit(view.editor, 'deleteContentBackward');
  expect(view.text()).toBe('A');
  view.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); flushSync();
  expect(view.text()).toBe('AB');
  view.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })); flushSync();
  expect(view.text()).toBe('A');
  expect(richCopyText(view.editor)).toBe('A');
  expect(view.editor.textContent).toBe('A');
});
it('preserves the native Vietnamese replacement range and one undo while ghost mode is enabled', async () => {
  const view = setup({ initial: 'Nam ', showGhost: true, ghostRuns: [{ text: 'Nam thiền định.', bold: false, align: 'left', line: 0 }] });
  view.editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  const node = view.editor.querySelector('[data-copy-typed]')?.firstChild ?? view.editor.querySelector('span')!.firstChild;
  (node as Text).appendData('thiền');
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: 'thiền', bubbles: true })); flushSync();
  const commitRange = document.createRange(); commitRange.setStart(node!, 4); commitRange.setEnd(node!, 9);
  view.editor.dispatchEvent(new CompositionEvent('compositionend', { data: 'thiền', bubbles: true })); flushSync();
  expect(commitRange.toString()).toBe('thiền');
  commitRange.deleteContents(); commitRange.insertNode(document.createTextNode('thiền'));
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: 'thiền', bubbles: true })); flushSync();
  await new Promise(resolve => setTimeout(resolve, 0)); flushSync();
  expect(view.text()).toBe('Nam thiền');
  expect(richCopyText(view.editor)).toBe('Nam thiền');
  view.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); flushSync();
  expect(view.text()).toBe('Nam ');
});

it('handles Enter immediately after Vietnamese IME compositionend on a punctuated line without sticking words together', async () => {
  const ghostRuns = [
    { text: 'Nam Mô A Di Đà Phật.\n', bold: true, align: 'center' as const, line: 0 },
    { text: 'Con thành tâm đảnh lễ.', bold: false, align: 'justify' as const, line: 1 },
  ];
  const view = setup({ initial: 'Nam Mô A Di Đà ', showGhost: true, ghostRuns });
  setRichCopySelection(view.editor, view.text().length, view.text().length);
  view.editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  const typedNode = view.editor.querySelector('[data-copy-typed]')!.firstChild as Text;
  typedNode.appendData('phật'.normalize('NFD'));
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: 'phật'.normalize('NFD'), bubbles: true }));
  view.editor.dispatchEvent(new CompositionEvent('compositionend', { data: 'phật'.normalize('NFD'), bubbles: true }));
  // User immediately presses Enter before the deferred 0ms timer fires
  const enterEvent = new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true });
  view.editor.dispatchEvent(enterEvent);
  flushSync();
  expect(enterEvent.defaultPrevented).toBe(true);
  expect(view.text()).toBe('Nam Mô A Di Đà Phật.\n');
  const anchor = window.getSelection()!.anchorNode as Text;
  expect(anchor.parentElement?.closest('[data-copy-line]')?.getAttribute('data-copy-line')).toBe('1');
});

it('reconciles rapid consecutive Vietnamese IME words without losing sync when compositionstart precedes timer', async () => {
  const ghostRuns = [
    { text: 'TỊNH KHẨU NGHIỆP', bold: true, align: 'center' as const, line: 0 },
  ];
  const view = setup({ showGhost: true, ghostRuns });
  // Word 1: "tịnh "
  view.editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  const node1 = view.editor.querySelector('[data-copy-typed]')!.firstChild as Text;
  node1.appendData('tịnh');
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: 'tịnh', bubbles: true }));
  view.editor.dispatchEvent(new CompositionEvent('compositionend', { data: 'tịnh', bubbles: true }));
  node1.appendData(' ');
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: ' ', bubbles: true }));
  // Immediately start Word 2 BEFORE setTimeout(0) runs!
  view.editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  // Composition cũ đã kết thúc: dùng range hiện tại sau khi canonical DOM được đồng bộ.
  const node2 = view.editor.querySelector('[data-copy-typed]')!.firstChild as Text;
  node2.appendData('khẩu'.normalize('NFD'));
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: 'khẩu'.normalize('NFD'), bubbles: true }));
  view.editor.dispatchEvent(new CompositionEvent('compositionend', { data: 'khẩu'.normalize('NFD'), bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0)); flushSync();
  expect(view.text()).toBe('TỊNH KHẨU');
  expect(richCopyText(view.editor)).toBe('TỊNH KHẨU');
});

it('keeps ghost aligned to live composed text while composing and snaps to canonical on commit', async () => {
  const ghostRuns = [
    { text: 'TỊNH KHẨU NGHIỆP', bold: true, align: 'center' as const, line: 0 },
  ];
  const view = setup({ showGhost: true, ghostRuns });
  view.editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  const node = view.editor.querySelector('[data-copy-typed]')!.firstChild as Text;
  node.appendData('tinh');
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: 'tinh', bubbles: true }));
  flushSync();
  // While composing, ghost hidden prefix must match the live composed text "tinh", not jump to uppercase "TỊNH"
  const ghostEl = document.querySelector('.rich-copy-ghost')!;
  const hiddenWhileComposing = Array.from(ghostEl.querySelectorAll<HTMLElement>('span, strong'))
    .filter(el => el.style.visibility === 'hidden').map(el => el.textContent).join('');
  expect(hiddenWhileComposing).toBe('tinh');
  // On commit, snaps cleanly to canonical "TỊNH"
  view.editor.dispatchEvent(new CompositionEvent('compositionend', { data: 'tinh', bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 0)); flushSync();
  expect(view.text()).toBe('TỊNH');
  const hiddenAfterCommit = Array.from(ghostEl.querySelectorAll<HTMLElement>('span, strong'))
    .filter(el => el.style.visibility === 'hidden').map(el => el.textContent).join('');
  expect(hiddenAfterCommit).toBe('TỊNH');
});

it('traces Space and non-composing keys immediately after compositionend and keeps remaining ghost words intact while composing Telex', () => {
  const ghostRuns = [
    { text: 'TỊNH KHẨU NGHIỆP CHƠN NGÔN', bold: true, align: 'center' as const, line: 0 },
  ];
  const view = setup({ showGhost: true, ghostRuns });
  view.editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  const node1 = view.editor.querySelector('[data-copy-typed]')!.firstChild as Text;
  node1.appendData('tịnh');
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: 'tịnh', bubbles: true }));
  view.editor.dispatchEvent(new CompositionEvent('compositionend', { data: 'tịnh', bubbles: true }));

  // Immediately press Space + 'k' BEFORE setTimeout(0) flushes compositionCommitTimer
  edit(view.editor, 'insertText', ' ');
  edit(view.editor, 'insertText', 'k');
  expect(view.text()).toBe('TỊNH K');

  // Re-start composition for a longer raw Telex string "nghieepj" after "TỊNH KHẨU "
  edit(view.editor, 'insertText', 'h');
  edit(view.editor, 'insertText', 'a');
  edit(view.editor, 'insertText', 'u');
  edit(view.editor, 'insertText', ' ');
  expect(view.text()).toBe('TỊNH KHẨU ');

  view.editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  const node2 = view.editor.querySelector('[data-copy-typed]')!.firstChild as Text;
  node2.appendData('nghieepj');
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: 'nghieepj', bubbles: true }));
  flushSync();

  const ghostEl = document.querySelector('.rich-copy-ghost')!;
  const visibleGhostTail = Array.from(ghostEl.querySelectorAll<HTMLElement>('span, strong'))
    .filter(el => el.style.visibility !== 'hidden').map(el => el.textContent).join('');
  expect(visibleGhostTail).toBe(' CHƠN NGÔN');
});


it.each(['div', 'p'])('native empty paragraphs: preserve a middle blank line and its caret (%s)', tag => {
  const view = setup();
  view.editor.innerHTML = `<${tag}>Nam</${tag}><${tag}><br></${tag}><${tag}>mô</${tag}>`;
  const end = view.editor.lastElementChild!.firstChild!;
  const range = document.createRange(); range.setStart(end, end.textContent!.length); range.collapse(true);
  const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  expect(richCopyText(view.editor)).toBe('Nam\n\nmô');
  expect(richCopySelection(view.editor)).toEqual([7, 7]);
});

it.each([['div', 'NFC'], ['p', 'NFD']] as const)('native empty paragraphs: survive non-cancelable input commit (%s, %s)', (tag, normalization) => {
  const view = setup({ initial: 'Nam' });
  const tail = 'mô'.normalize(normalization), expected = 'Nam\n\n' + tail;
  const before = new InputEvent('beforeinput', { inputType: 'insertReplacementText', data: tail, bubbles: true, cancelable: false });
  view.editor.dispatchEvent(before);
  expect(before.defaultPrevented).toBe(false);
  // Model the native DOM mutation explicitly; jsdom has no contenteditable default action.
  view.editor.innerHTML = `<${tag}>Nam</${tag}><${tag}><br></${tag}><${tag}>${tail}</${tag}>`;
  const end = view.editor.lastElementChild!.firstChild!;
  const range = document.createRange(); range.setStart(end, tail.length); range.collapse(true);
  const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  view.editor.dispatchEvent(new InputEvent('input', { inputType: 'insertReplacementText', data: tail, bubbles: true }));
  flushSync();
  expect(view.text()).toBe(expected);
  expect(richCopyText(view.editor)).toBe(expected);
  expect(richCopySelection(view.editor)).toEqual([expected.length, expected.length]);
});

it.each([
  ['leading', '<div><br></div><div>mô</div>', '\nmô'],
  ['trailing', '<div>Nam</div><div><br></div><div><br></div>', 'Nam\n\n'],
])('native empty paragraphs: retain the %s edge', (_edge, html, expected) => {
  const view = setup();
  view.editor.innerHTML = html;
  expect(richCopyText(view.editor)).toBe(expected);
});

it('native empty paragraphs: exclude structural placeholders and visual line wrappers', () => {
  const view = setup();
  view.editor.innerHTML = '<br data-copy-placeholder>';
  expect(richCopyText(view.editor)).toBe('');
  view.editor.innerHTML = '<div data-copy-line="0"><span>Nam</span></div><div data-copy-line="1"><br data-copy-placeholder></div><div data-copy-line="2"><span> mô</span></div>';
  expect(richCopyText(view.editor)).toBe('Nam mô');
});


it.each([false, true])('keeps raw NFD selection edits, caret and one undo beneath source heading casing (ghost %s)', async showGhost => {
  const { default: Editor } = await import('../../../src/lib/components/RichCopyEditor.svelte');
  const { fromStore, writable } = await import('svelte/store');
  const { copyingSentences } = await import('../../../src/lib/domain/practice/copying-follow');
  const { formatTypedCopy } = await import('../../../src/lib/domain/practice/copying-typed-format');
  const { formatGhostRuns, alignGhostRuns } = await import('../../../src/lib/domain/practice/copying-ghost-format');
  const source = copyingSentences(['{align:center|**TỊNH TÂM** (3 lần)}\n{align:center|**Tu rị ta bà ha.**}'], 0);
  const reference = formatGhostRuns(source);
  const initial = 'TỊNH TAM (3 lần)\nTu rị ta bà ha.';
  const draft = fromStore(writable(initial));
  const component = mount(Editor, {
    target: document.body,
    props: {
      get value() { return draft.current; },
      get runs() { return formatTypedCopy(source, draft.current); },
      get ghostRuns() { return alignGhostRuns(reference, draft.current) ?? reference; },
      canonicalGhostRuns: reference, showGhost,
      label: 'Bản chép đúng định dạng', placeholder: '', invalid: false, maxlength: 1000, font: 'serif',
      onvalue: next => { draft.current = next; },
      onbeforeinput: () => {}, ondisallow: () => {}, oncaret: () => {}, oncomposing: () => {},
    },
  });
  try {
    flushSync();
    const editor = document.getElementById('copy-text')!;
    editor.focus();
    const start = initial.indexOf('TAM'), end = start + 3;
    setRichCopySelection(editor, start, end);
    editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    const committed = 'tâm'.normalize('NFD');
    const expected = initial.slice(0, start) + committed + initial.slice(end);
    const selection = window.getSelection()!, range = selection.getRangeAt(0);
    range.deleteContents();
    const inserted = document.createTextNode(committed); range.insertNode(inserted);
    range.setStart(inserted, inserted.length); range.collapse(true);
    selection.removeAllRanges(); selection.addRange(range);
    editor.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: committed, isComposing: true, bubbles: true }));
    flushSync();
    expect(draft.current).toBe(expected);
    expect(richCopyText(editor)).toBe(expected);
    expect(richCopySelection(editor)).toEqual([start + committed.length, start + committed.length]);
    const assertPresentation = () => {
      expect(getComputedStyle(editor.querySelector('[data-copy-line="0"] strong')!).textTransform).toBe('uppercase');
      const note = editor.querySelector('em')!;
      expect(note.textContent).toBe('(3 lần)');
      expect(getComputedStyle(note).textTransform).toBe('none');
      const verse = editor.querySelector('[data-copy-line="1"] strong')!;
      expect(verse.textContent?.trim()).toBe('Tu rị ta bà ha.');
      expect(getComputedStyle(verse).textTransform).not.toBe('uppercase');
    };
    assertPresentation();
    editor.dispatchEvent(new CompositionEvent('compositionend', { data: committed, bubbles: true }));
    editor.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: committed, bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0)); flushSync();
    expect(draft.current).toBe(expected);
    expect(editor.textContent).toBe(expected);
    expect(richCopySelection(editor)).toEqual([start + committed.length, start + committed.length]);
    assertPresentation();
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); flushSync();
    expect(draft.current).toBe(initial);
    expect(richCopyText(editor)).toBe(initial);
    expect(richCopySelection(editor)).toEqual([start, end]);
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true, cancelable: true })); flushSync();
    expect(draft.current).toBe(expected);
    expect(richCopyText(editor)).toBe(expected);
    expect(richCopySelection(editor)).toEqual([start + committed.length, start + committed.length]);
    assertPresentation();
  } finally { await unmount(component); }
});

it('shares uppercase glyph styling across plain ink, traced ink and ghost without transforming notes or saved text', async () => {
  const { renderCopyRuns, renderTracedCopyRuns, renderGhostRuns } = await import('../../../src/lib/browser/copying-layout');
  const raw = 'tịnh tâm (3 lần (đọc chậm))'.normalize('NFD'), tail = ' NGHIỆP';
  const runs = [
    { text: raw + tail, bold: true, align: 'center' as const, line: 0, uppercase: true as const },
    { text: '\nTu rị ta bà ha.', bold: true, align: 'center' as const, line: 1 },
  ];
  const ink = document.createElement('div'), ghost = document.createElement('div');
  document.body.append(ink, ghost);
  const assertInk = () => {
    expect(richCopyText(ink)).toBe(raw);
    const typed = ink.querySelector('strong')!, note = typed.querySelector('em')!;
    expect(getComputedStyle(typed).textTransform).toBe('uppercase');
    expect(note.textContent).toBe('(3 lần (đọc chậm))'.normalize('NFD'));
    expect(getComputedStyle(note).textTransform).toBe('none');
  };
  renderCopyRuns(ink, runs, 0, raw.length);
  assertInk();
  renderTracedCopyRuns(ink, runs, raw.length);
  assertInk();
  const future = ink.querySelector<HTMLElement>('[data-copy-future]')!;
  expect(future.dataset.copyFuture).toBe(tail);
  expect(future.textContent).toBe('');
  expect(getComputedStyle(future).textTransform).toBe('uppercase');
  expect(future.getAttribute('contenteditable')).toBe('false');
  renderGhostRuns(ghost, runs, raw.length);
  const hidden = ghost.querySelector<HTMLElement>('strong')!, visible = hidden.nextElementSibling!;
  expect(hidden.textContent).toBe(raw);
  expect(getComputedStyle(hidden).visibility).toBe('hidden');
  expect(getComputedStyle(hidden).textTransform).toBe('uppercase');
  expect(getComputedStyle(hidden.querySelector('em')!).textTransform).toBe('none');
  expect(visible.textContent).toBe(tail);
  expect(getComputedStyle(visible).textTransform).toBe('uppercase');
  expect(getComputedStyle(ghost.querySelector('[data-copy-line="1"] strong')!).textTransform).not.toBe('uppercase');
});
