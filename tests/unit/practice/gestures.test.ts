import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRosaryGestureController } from '../../../src/lib/browser/gestures';

class FakeTarget extends EventTarget {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    super.addEventListener(type, listener);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    super.removeEventListener(type, listener);
  }
}

function pointerEvent(type: string, clientY: number, overrides: Partial<PointerEvent> = {}): Event {
  return Object.assign(new Event(type), { clientY, clientX: 100, pointerId: 1, isPrimary: true, button: 0, ...overrides });
}

describe('rosary gesture direction contract', () => {
  let keyboardTarget: EventTarget;

  beforeEach(() => {
    keyboardTarget = new EventTarget();
    vi.stubGlobal('window', keyboardTarget);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['up', 'down'] as const)('always increments a tap when direction is %s', (direction) => {
    const target = new FakeTarget();
    const deltas: number[] = [];
    const controller = createRosaryGestureController(target as unknown as HTMLElement, {
      direction,
      onDelta: (delta) => deltas.push(delta)
    });

    target.dispatchEvent(pointerEvent('pointerdown', 180));
    target.dispatchEvent(pointerEvent('pointerup', 180));

    expect(deltas).toEqual([1]);
    controller.destroy();
  });

  it.each([
    { direction: 'up' as const, start: 180, end: 100, expected: 1 },
    { direction: 'up' as const, start: 100, end: 180, expected: -1 },
    { direction: 'down' as const, start: 100, end: 180, expected: 1 },
    { direction: 'down' as const, start: 180, end: 100, expected: -1 }
  ])('keeps legacy swipe semantics for $direction ($start → $end)', ({ direction, start, end, expected }) => {
    const target = new FakeTarget();
    const deltas: number[] = [];
    const controller = createRosaryGestureController(target as unknown as HTMLElement, {
      direction,
      onDelta: (delta) => deltas.push(delta)
    });

    target.dispatchEvent(pointerEvent('pointerdown', start));
    target.dispatchEvent(pointerEvent('pointerup', end));

    expect(deltas).toEqual([expected]);
    controller.destroy();
  });

  it.each([
    { name: 'cancelled', events: [pointerEvent('pointerdown', 100), pointerEvent('pointercancel', 100), pointerEvent('pointerup', 180)] },
    { name: 'secondary finger', events: [pointerEvent('pointerdown', 100, { isPrimary: false }), pointerEvent('pointerup', 180)] },
    { name: 'secondary button', events: [pointerEvent('pointerdown', 100, { button: 2 }), pointerEvent('pointerup', 180)] },
    { name: 'horizontal drag', events: [pointerEvent('pointerdown', 100), pointerEvent('pointerup', 100, { clientX: 220 })] },
    { name: 'diagonal horizontal drag', events: [pointerEvent('pointerdown', 100), pointerEvent('pointerup', 140, { clientX: 220 })] },
  ])('does not count a $name gesture', ({ events }) => {
    const target = new FakeTarget();
    const onDelta = vi.fn();
    const controller = createRosaryGestureController(target as unknown as HTMLElement, { direction: 'down', onDelta });
    for (const event of events) target.dispatchEvent(event);
    expect(onDelta).not.toHaveBeenCalled();
    controller.destroy();
  });

  it('keeps the primary pointer when another finger ends or cancels', () => {
    const target = new FakeTarget();
    const onDelta = vi.fn();
    const controller = createRosaryGestureController(target as unknown as HTMLElement, { direction: 'down', onDelta });
    target.dispatchEvent(pointerEvent('pointerdown', 100));
    target.dispatchEvent(pointerEvent('pointerdown', 250, { pointerId: 2, isPrimary: false }));
    target.dispatchEvent(pointerEvent('pointerup', 260, { pointerId: 2, isPrimary: false }));
    target.dispatchEvent(pointerEvent('pointercancel', 260, { pointerId: 2, isPrimary: false }));
    expect(onDelta).not.toHaveBeenCalled();
    target.dispatchEvent(pointerEvent('pointerup', 180));
    expect(onDelta).toHaveBeenCalledExactlyOnceWith(1);
    controller.destroy();
  });
});
