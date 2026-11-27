import type { PracticeFabPosition } from './practice-storage';

export interface PracticeFabController {
  apply(position: PracticeFabPosition): PracticeFabPosition;
  destroy(): void;
}

export function clampPracticeFabPosition(
  position: PracticeFabPosition,
  viewport: { width: number; height: number; top?: number },
  size: { width: number; height: number },
  inset = 8
): PracticeFabPosition {
  return {
    x: Math.max(inset, Math.min(viewport.width - size.width - inset, position.x)),
    y: Math.max((viewport.top ?? 0) + inset, Math.min(viewport.height - size.height - inset, position.y))
  };
}

export function snapPracticeFabPosition(
  position: PracticeFabPosition,
  viewportWidth: number,
  width: number,
  inset = 8
): PracticeFabPosition {
  return {
    x: position.x + width / 2 < viewportWidth / 2 ? inset : viewportWidth - width - inset,
    y: position.y
  };
}

export function createPracticeFabController(
  element: HTMLElement,
  onSave: (position: PracticeFabPosition) => void,
  initialPosition: PracticeFabPosition | null
): PracticeFabController {
  let dragTimer = 0;
  let snapTimer = 0;
  let dragging = false;
  let suppressClick = false;
  let activePointerId: number | null = null;
  let activeCaptureTarget: HTMLElement | null = null;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let fitX = 0;
  let fitY = 0;
  const ownerDocument = element.ownerDocument;
  const root = ownerDocument?.documentElement;
  const bottomNav = ownerDocument?.querySelector<HTMLElement>('.qts-bottom-nav');
  // Custom property có thể chứa max()/env(); đo padding để lấy px đã được CSS giải quyết.
  const safeAreaProbe = ownerDocument?.createElement('span');
  if (safeAreaProbe && root) {
    safeAreaProbe.setAttribute('aria-hidden', 'true');
    safeAreaProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;width:0;height:0;padding:var(--app-safe-top,0px) 0 0;';
    root.append(safeAreaProbe);
  }

  function availableViewport() {
    const nav = bottomNav?.getBoundingClientRect();
    const rootStyle = root && typeof getComputedStyle === 'function' ? getComputedStyle(root) : null;
    const audioClearance = Math.max(0, parseFloat(rootStyle?.getPropertyValue('--audio-player-top') ?? '') || 0);
    const top = safeAreaProbe && typeof getComputedStyle === 'function'
      ? Math.max(0, parseFloat(getComputedStyle(safeAreaProbe).paddingTop) || 0) : 0;
    return {
      width: window.innerWidth,
      height: Math.min(nav && nav.height > 0 ? nav.top : window.innerHeight, window.innerHeight - audioClearance),
      top
    };
  }

  function setFitOffset(x: number, y: number): void {
    fitX = x;
    fitY = y;
    element.style.translate = x || y ? `${x}px ${y}px` : '';
  }

  function fitToViewport(): void {
    const rect = element.getBoundingClientRect();
    const base = { x: rect.left - fitX, y: rect.top - fitY };
    const next = clampPracticeFabPosition(base, availableViewport(), rect);
    setFitOffset(next.x - base.x, next.y - base.y);
  }

  function apply(position: PracticeFabPosition): PracticeFabPosition {
    setFitOffset(0, 0);
    element.style.right = 'auto';
    element.style.bottom = 'auto';
    element.style.transform = 'none';
    const rect = element.getBoundingClientRect();
    const next = clampPracticeFabPosition(position, availableViewport(), {
      width: rect.width || 60,
      height: rect.height || 200
    });
    element.style.left = `${next.x}px`;
    element.style.top = `${next.y}px`;
    return next;
  }

  function beginDragging(): void {
    if (dragging) return;
    window.clearTimeout(snapTimer);
    element.style.transition = '';
    dragging = true;
    element.classList.add('dragging');
    if (activeCaptureTarget && activePointerId !== null) {
      try {
        activeCaptureTarget.setPointerCapture?.(activePointerId);
      } catch {
        // Ignore if pointer already ended.
      }
    }
  }

  function onPointerDown(event: PointerEvent): void {
    const target = event.target as { closest?: (selector: string) => unknown } | null;
    const toggleHandle = (target?.closest?.('.ttr-toggle-btn') as HTMLElement | null) ?? null;
    if (!toggleHandle || activePointerId !== null || event.button !== 0) return;
    const rect = element.getBoundingClientRect();
    suppressClick = false;
    activePointerId = event.pointerId;
    activeCaptureTarget = toggleHandle;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    dragTimer = window.setTimeout(() => {
      if (activePointerId === null) return;
      beginDragging();
    }, 150);
  }

  function onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!dragging && Math.abs(dx) + Math.abs(dy) > 8) {
      window.clearTimeout(dragTimer);
      beginDragging();
    }
    if (!dragging) return;
    suppressClick = true;
    apply({ x: startLeft + dx, y: startTop + dy });
  }

  function finishDrag(event: PointerEvent): void {
    if (event.pointerId !== activePointerId) return;
    activePointerId = null;
    activeCaptureTarget = null;
    window.clearTimeout(dragTimer);
    if (!dragging) return;
    dragging = false;
    element.classList.remove('dragging');
    const rect = element.getBoundingClientRect();
    const snapped = snapPracticeFabPosition({ x: rect.left, y: rect.top }, window.innerWidth, rect.width);
    element.style.transition = 'left .25s cubic-bezier(.4,0,.2,1),top .25s';
    const saved = apply(snapped);
    onSave(saved);
    snapTimer = window.setTimeout(() => {
      element.style.transition = '';
    }, 280);
  }

  function onClick(event: MouseEvent): void {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick = false;
  }

  function onResize(): void {
    if (element.classList.contains('panel-open')) {
      fitToViewport();
      return;
    }
    const rect = element.getBoundingClientRect();
    onSave(apply({ x: rect.left - fitX, y: rect.top - fitY }));
  }

  element.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', finishDrag, true);
  window.addEventListener('pointercancel', finishDrag, true);
  element.addEventListener('click', onClick, true);
  // Keep the controls above the bottom navigation as the panel or navigation resizes.
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fitToViewport);
  observer?.observe(element);
  if (bottomNav) observer?.observe(bottomNav);
  // Dùng khoảng trống do player owner cập nhật, kể cả khi player xuất hiện sau FAB.
  const clearanceObserver = root && typeof MutationObserver !== 'undefined'
    ? new MutationObserver(fitToViewport) : null;
  if (root) clearanceObserver?.observe(root, { attributes: true, attributeFilter: ['style', 'data-native-app', 'data-native-insets'] });
  window.addEventListener('resize', onResize);
  const initialFrame = initialPosition
    ? requestAnimationFrame(() => {
      if (element.classList.contains('panel-open')) fitToViewport();
      else {
        const clamped = apply(initialPosition);
        if (clamped.x !== initialPosition.x || clamped.y !== initialPosition.y) onSave(clamped);
      }
    }) : undefined;

  return {
    apply,
    destroy() {
      observer?.disconnect();
      clearanceObserver?.disconnect();
      safeAreaProbe?.remove();
      if (initialFrame !== undefined) cancelAnimationFrame(initialFrame);
      window.clearTimeout(dragTimer);
      window.clearTimeout(snapTimer);
      element.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', finishDrag, true);
      window.removeEventListener('pointercancel', finishDrag, true);
      element.removeEventListener('click', onClick, true);
      window.removeEventListener('resize', onResize);
    }
  };
}
