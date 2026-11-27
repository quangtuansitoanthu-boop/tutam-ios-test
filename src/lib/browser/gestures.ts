export interface RosaryGestureOptions {
  direction: 'up' | 'down';
  onDelta: (delta: number) => void;
}

export interface RosaryGestureController {
  destroy(): void;
}

export function createRosaryGestureController(
  target: HTMLElement,
  options: RosaryGestureOptions
): RosaryGestureController {
  const SWIPE_THRESHOLD = 36;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let activePointer: number | null = null;

  function applyInput(delta: number): void {
    if (options.direction === 'down') {
      options.onDelta(delta);
      return;
    }

    options.onDelta(delta * -1);
  }

  function onPointerDown(event: PointerEvent): void {
    if (activePointer !== null || !event.isPrimary || event.button !== 0) return;
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    activePointer = event.pointerId;
  }

  function onPointerUp(event: PointerEvent): void {
    if (activePointer !== event.pointerId) return;
    activePointer = null;
    const diff = event.clientY - pointerStartY;
    const horizontal = Math.abs(event.clientX - pointerStartX);
    if (horizontal >= 5 && horizontal >= Math.abs(diff)) return;
    if (Math.abs(diff) < 5) {
      // A tap is the direction-agnostic shortcut advertised by the UI. Only
      // an intentional swipe should use the configured up/down direction.
      options.onDelta(1);
      return;
    }
    if (diff >= SWIPE_THRESHOLD) {
      applyInput(1);
      return;
    }
    if (diff <= -SWIPE_THRESHOLD) {
      applyInput(-1);
    }
  }

  function onPointerCancel(event: PointerEvent): void {
    if (activePointer === event.pointerId) activePointer = null;
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      applyInput(1);
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowUp') {
      applyInput(-1);
      event.preventDefault();
    }
  }

  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('pointerup', onPointerUp);
  target.addEventListener('pointercancel', onPointerCancel);
  window.addEventListener('keydown', onKeyDown);

  return {
    destroy() {
      target.removeEventListener('pointerdown', onPointerDown);
      target.removeEventListener('pointerup', onPointerUp);
      target.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKeyDown);
    }
  };
}
