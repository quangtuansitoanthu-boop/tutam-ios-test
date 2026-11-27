import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

const source = fs.readFileSync('ios/App/App/TuTapBridgeViewController.swift', 'utf8');
const start = source.indexOf('          const libraryInputTokens = new WeakMap();');
const end = source.indexOf("          for (const type of ['pointermove', 'touchmove']) {", start);
const helper = start < 0 || end < 0 ? '' : source.slice(start, end);

it('samples only the exact library search control, preserves node identity and never reads private fields', () => {
  expect(helper).not.toBe('');
  const records: Array<Record<string, unknown>> = [];
  const listeners: Array<{ type: string; options: { capture: boolean; passive: boolean } }> = [];
  const panel = { scrollTop: 2, scrollHeight: 160, clientHeight: 120,
    getBoundingClientRect: () => ({ x: 16, y: 120, width: 350, height: 160 }) };
  const shell = { classList: { contains: (name: string) => name === 'qts-shell--chrome-hidden' } };
  class Input {
    type = 'search';
    isConnected = true;
    owned = true;
    matches(selector: string) { return this.owned && selector === '.kinh-sach-container .search-input'; }
    closest(selector: string) {
      if (!this.isConnected) return null;
      return selector === '.library-top-bar' ? panel : selector === '.qts-shell' ? shell : null;
    }
    getBoundingClientRect() { return this.isConnected
      ? { x: 24, y: 213, width: 190, height: 44 } : { x: 0, y: 0, width: 0, height: 0 }; }
  }
  const input = new Input();
  for (const field of ['value', 'textContent', 'innerText', 'id', 'dataset', 'getAttribute']) {
    Object.defineProperty(input, field, { get() { throw new Error('SENSITIVE field read'); } });
  }
  const location = { pathname: '/kinh-sach' };
  for (const field of ['search', 'href', 'hash']) {
    Object.defineProperty(location, field, { get() { throw new Error('SENSITIVE URL read'); } });
  }
  const document = { activeElement: input as unknown,
    scrollingElement: { scrollTop: 12, scrollHeight: 1800, clientHeight: 844 } };
  const sample = runInNewContext(`(() => { ${helper}\nreturn logLibraryInput; })()`, {
    location, document, HTMLInputElement: Input, performance: { now: () => 1234 },
    numericRect: (rect: object) => ({ ...rect }),
    window: { scrollX: 0, scrollY: 12, innerWidth: 390, innerHeight: 844,
      visualViewport: { offsetLeft: 0, offsetTop: 0, pageLeft: 0, pageTop: 12, width: 390, height: 844, scale: 1 },
      addEventListener: (type: string, _callback: unknown, options: { capture: boolean; passive: boolean }) => listeners.push({ type, options }) },
    log: (detail: Record<string, unknown>) => records.push(JSON.parse(JSON.stringify(detail))),
  }) as (event: { type: string; target: unknown }) => void;
  expect(listeners).toEqual([
    { type: 'focusin', options: { capture: true, passive: true } },
    { type: 'focusout', options: { capture: true, passive: true } },
  ]);
  sample({ type: 'pointerdown', target: input });
  sample({ type: 'pointerup', target: input });
  sample({ type: 'focusin', target: input });
  expect(records[0]).toMatchObject({ scope: 'library-search', path: '/kinh-sach', tag: 'INPUT', inputType: 'search', targetToken: 1, connected: true, active: true });
  input.isConnected = false; input.owned = false; document.activeElement = {};
  sample({ type: 'pointercancel', target: input });
  sample({ type: 'focusout', target: input });
  expect(records[3]).toMatchObject({ targetToken: 1, connected: false, active: false, panelRect: null });
  const replacement = new Input();
  sample({ type: 'pointerdown', target: replacement });
  expect(records[5].targetToken).toBe(2);

  const before = records.length;
  for (const path of ['/ca-nhan', '/login', '/kinh-sach/other']) {
    location.pathname = path; sample({ type: 'pointerdown', target: replacement });
  }
  location.pathname = '/kinh-sach';
  for (const type of ['password', 'text', 'email']) {
    const other = new Input(); other.type = type; sample({ type: 'pointerdown', target: other });
  }
  const foreignSearch = new Input(); foreignSearch.owned = false;
  sample({ type: 'pointerdown', target: foreignSearch });
  sample({ type: 'pointerdown', target: { type: 'search', value: 'SENSITIVE textarea' } });
  sample({ type: 'private-sdk-payload', target: replacement });
  expect(records).toHaveLength(before);

  expect(Object.keys(records[0]).sort()).toEqual(['type', 'phase', 'scope', 'path', 'tag', 'inputType', 'time', 'targetToken', 'connected', 'active',
    'inputRect', 'panelRect', 'chromeHidden', 'panelScrollTop', 'panelScrollHeight', 'panelClientHeight', 'scrollX', 'scrollY',
    'documentScrollTop', 'documentScrollHeight', 'documentClientHeight', 'innerWidth', 'innerHeight', 'visualViewport'].sort());
  for (let index = 0; index < 100; index++) sample({ type: 'pointerdown', target: replacement });
  expect(records).toHaveLength(32);
  expect(JSON.stringify(records)).not.toContain('SENSITIVE');
  for (const record of records) expect(Buffer.byteLength(JSON.stringify(record))).toBeLessThanOrEqual(4096);
  expect(helper).not.toMatch(/preventDefault|stopPropagation|setPointerCapture|\.focus\(|\.blur\(|\.value\b|textContent|innerText|getAttribute|location\.(?:search|href|hash)/u);
});

it('keeps release bytes, footer schema, public numeric sampling, caps and observer counts unchanged', () => {
  const release = source.replace(/^[ \t]*#if DEBUG\n[\s\S]*?^[ \t]*#endif\n?/gmu, '');
  expect(Buffer.byteLength(release)).toBe(20273);
  expect(createHash('sha256').update(release).digest('hex')).toBe('a1ea83f292e700d6146b19f898aaef0fe0e5c62cbb591d8eee0ff7ad5c393afc');
  expect(release).not.toContain('libraryInputTokens');
  expect(release).not.toContain('native-library-search-state');
  expect(source).toContain('guard ProcessInfo.processInfo.arguments.contains("-tutam-qa-events") else { return nil }');
  expect(source).toContain('body.utf8.count <= 4096');
  expect(source).toContain('let limit: UInt64 = 256 * 1024');
  expect(source).toContain('guard size <= limit, UInt64(line.count) <= limit - size else { return }');
  expect(source.match(/addObserver\(/gu)).toHaveLength(3);
  expect(source.match(/new MutationObserver\(/gu)).toHaveLength(1);
  const receiver = source.slice(source.indexOf('    func userContentController('), source.indexOf('    private func appendEvent('));
  for (const clause of ['event["phase"] as? String == "capture"', '["pointerdown", "pointerup", "pointercancel"].contains(eventType)',
    'event["scope"] as? String == "library-search"', 'event["path"] as? String == "/kinh-sach"',
    'event["tag"] as? String == "INPUT"', 'event["inputType"] as? String == "search"', 'event["footer"] as? Bool == true']) expect(receiver).toContain(clause);
  expect(receiver).toContain('"type": capturedLibraryInputScope ? "native-library-search-state" : "native-footer-state", "sourceType": sourceType, "state": state');
  for (const field of ['sourceTime', 'panState', 'translationX', 'translationY', 'velocityX', 'velocityY', 'offsetX', 'offsetY', 'isTracking',
    'insetTop', 'insetBottom', 'insetLeft', 'insetRight', 'adjustedInsetTop', 'adjustedInsetBottom', 'adjustedInsetLeft', 'adjustedInsetRight', 'isDragging', 'isDecelerating']) expect(receiver).toContain(`"${field}":`);
  expect(receiver.indexOf('let scroll = webView.scrollView')).toBeLessThan(receiver.indexOf('eventsQueue.async'));
  expect(receiver.indexOf('NSLog')).toBeGreaterThan(receiver.indexOf('eventsQueue.async'));
});
