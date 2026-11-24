import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPracticeFabController } from '../../../src/lib/browser/practice-fab-controller';

function makeMockElement() {
  const listeners = new Map<string, Array<(e: unknown) => void>>();
  const classes = new Set<string>();
  const style: Record<string, string> = {};
  const rect = { left: 300, top: 400, width: 46, height: 46, right: 346, bottom: 446 };

  const el = {
    style,
    classList: {
      add: (c: string) => classes.add(c),
      remove: (c: string) => classes.delete(c),
      contains: (c: string) => classes.has(c)
    },
    getBoundingClientRect: () => ({ ...rect }),
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener: (type: string, fn: (e: unknown) => void) => {
      const list = listeners.get(type) ?? [];
      listeners.set(type, list.filter((item) => item !== fn));
    },
    dispatch: (type: string, event: Record<string, unknown>) => {
      for (const fn of listeners.get(type) ?? []) fn(event);
    },
    setPointerCapture: vi.fn(),
    closest: (selector: string) => (selector === '.ttr-toggle-btn' ? null : el)
  };
  return el;
}

describe('practice FAB controller & scroll pass-through', () => {
  const prevWindow = (globalThis as { window?: unknown }).window;
  const winListeners = new Map<string, Array<(e: unknown) => void>>();

  function dispatchWindow(type: string, event: Record<string, unknown>) {
    for (const listener of winListeners.get(type) ?? []) listener(event);
  }

  beforeEach(() => {
    winListeners.clear();
    (globalThis as { window?: unknown }).window = {
      innerWidth: 375,
      innerHeight: 812,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      addEventListener: (t: string, fn: (e: unknown) => void) => {
        const list = winListeners.get(t) ?? [];
        list.push(fn);
        winListeners.set(t, list);
      },
      removeEventListener: (t: string, fn: (e: unknown) => void) => {
        const list = winListeners.get(t) ?? [];
        winListeners.set(t, list.filter((i) => i !== fn));
      }
    };
  });

  afterEach(() => {
    (globalThis as { window?: unknown }).window = prevWindow;
  });

  it('ignores pointerdown outside .ttr-toggle-btn so scripture scrolling is never captured', () => {
    const fab = makeMockElement();
    const onSave = vi.fn();
    const ctrl = createPracticeFabController(fab as unknown as HTMLElement, onSave, null);

    const outsideButton = {
      setPointerCapture: vi.fn(),
      closest: () => null
    };

    fab.dispatch('pointerdown', {
      target: outsideButton,
      clientX: 310,
      clientY: 420,
      pointerId: 1
    });
    dispatchWindow('pointermove', { clientX: 310, clientY: 300, pointerId: 1 });
    dispatchWindow('pointerup', { pointerId: 1 });

    expect(outsideButton.setPointerCapture).not.toHaveBeenCalled();
    expect(fab.setPointerCapture).not.toHaveBeenCalled();
    expect(fab.classList.contains('dragging')).toBe(false);
    expect(onSave).not.toHaveBeenCalled();

    ctrl.destroy();
  });

  it('saves a fast drag that leaves the handle before capture, ignoring other pointers', () => {
    const fab = makeMockElement();
    const onSave = vi.fn();
    const ctrl = createPracticeFabController(fab as unknown as HTMLElement, onSave, null);

    const toggleHandle = {
      setPointerCapture: vi.fn(),
      closest: (selector: string) => (selector === '.ttr-toggle-btn' ? toggleHandle : null)
    };

    fab.dispatch('pointerdown', {
      target: toggleHandle,
      clientX: 320,
      clientY: 420,
      pointerId: 2,
      button: 0
    });
    // Just tapping does not capture pointer or drag
    expect(toggleHandle.setPointerCapture).not.toHaveBeenCalled();
    expect(fab.classList.contains('dragging')).toBe(false);

    // Moving > 8px activates drag and captures pointer
    dispatchWindow('pointermove', { clientX: 250, clientY: 380, pointerId: 3 });
    expect(fab.classList.contains('dragging')).toBe(false);
    dispatchWindow('pointermove', { clientX: 250, clientY: 380, pointerId: 2 });
    expect(fab.classList.contains('dragging')).toBe(true);
    expect(toggleHandle.setPointerCapture).toHaveBeenCalledWith(2);

    dispatchWindow('pointerup', { pointerId: 3 });
    expect(onSave).not.toHaveBeenCalled();
    dispatchWindow('pointerup', { pointerId: 2 });
    expect(fab.classList.contains('dragging')).toBe(false);
    expect(onSave).toHaveBeenCalledTimes(1);

    ctrl.destroy();
  });

  it('keeps .ttr-fabs container pointer-events: none and touch-action: pan-y in PracticeFloatingControls', () => {
    const src = readFileSync('src/lib/components/practice/reader/PracticeFloatingControls.svelte', 'utf8');
    expect(src).toMatch(/\.ttr-fabs\{[^}]*pointer-events:\s*none[^}]*touch-action:\s*pan-y/);
    expect(src).toMatch(/\.ttr-toggle-btn\{[^}]*pointer-events:\s*auto[^}]*touch-action:\s*none/);
    expect(src).toMatch(/\.ttr-panel:not\(\.open\)\{[^}]*overflow:\s*hidden/);
  });

  it('clears right and bottom offsets in inline style so saved fabPosition is never stretched or reset', () => {
    const src = readFileSync('src/lib/components/practice/reader/PracticeFloatingControls.svelte', 'utf8');
    expect(src).toContain('right:auto;bottom:auto;transform:none;');
  });
});
