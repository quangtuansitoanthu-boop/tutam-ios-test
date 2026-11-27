import { registerPlugin } from '@capacitor/core';
import type { AppLocale } from '$lib/i18n/translations';
import { isNativeApp, nativePlatform } from './native-platform';

const startup = registerPlugin<{
  ready(): Promise<void>;
  setLocale(options: { locale: AppLocale }): Promise<void>;
}>('StartupScreen');

export async function finishNativeStartup(): Promise<void> {
  if (isNativeApp() && nativePlatform() === 'android') await startup.ready();
}

/** Keep top-layer startup prompts behind the HTML artwork until its fade ends. */
export function dismissStartupCover(onComplete: () => void): () => void {
  const cover = document.getElementById('app-startup') as (HTMLElement & { artworkPainted?: Promise<number> }) | null;
  let active = true;
  let completed = false;
  let timer: number | undefined;
  const complete = () => {
    if (!active || completed) return;
    completed = true;
    observer?.disconnect();
    window.clearTimeout(timer);
    onComplete();
  };
  // app.html also removes the cover after 30s if image decoding ever stalls.
  const observer = cover?.parentNode ? new MutationObserver(() => {
    if (cover && !cover.isConnected) complete();
  }) : undefined;
  if (cover?.parentNode) observer?.observe(cover.parentNode, { childList: true });

  let frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => {
      if (!active) return;
      void finishNativeStartup().catch(() => {});
      if (!cover?.isConnected) { complete(); return; }
      if (document.documentElement.dataset.nativeApp !== 'true' || document.documentElement.dataset.nativeStartup === 'true') {
        cover.remove();
        complete();
        return;
      }
      const fade = (shownAt: number) => {
        if (!active || completed || !cover.isConnected) return;
        const paintedAt = Number.isFinite(shownAt) ? shownAt : performance.now();
        timer = window.setTimeout(() => {
          cover.classList.add('startup-ready');
          timer = window.setTimeout(() => { cover.remove(); complete(); }, 240);
        }, Math.max(0, paintedAt + 3000 - performance.now()));
      };
      void Promise.resolve(cover.artworkPainted ?? Number(cover.dataset.shownAt ?? performance.now()))
        .then(fade, () => fade(performance.now()));
    });
  });
  return () => {
    active = false;
    observer?.disconnect();
    cancelAnimationFrame(frame);
    window.clearTimeout(timer);
  };
}

export async function syncNativeStartupLocale(locale: AppLocale): Promise<void> {
  if (!isNativeApp() || nativePlatform() !== 'android') return;
  try {
    await startup.setLocale({ locale });
  } catch { /* A WebView on an older Android shell may not expose this method. */ }
}
