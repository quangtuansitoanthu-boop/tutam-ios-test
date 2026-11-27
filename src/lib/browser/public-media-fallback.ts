import { NATIVE_BACKEND_ORIGINS } from './native-backend-origin';

const MEDIA_RETRY_INTERVAL_MS = 300_000;
let retryMediaHostAt = 0;

export function publicMediaFallback(source: string): string | undefined {
  if (!source.startsWith('https://media.quangtu.vn/')) return;
  const url = new URL(source);
  if (url.origin !== 'https://media.quangtu.vn' || url.username || url.password) return;
  const route = /^\/(?:covers|pdfs)\//u.test(url.pathname) ? '/api/media' : '/api/public-media';
  const revision = url.searchParams.get('v');
  const search = revision && /^[a-f0-9]{64}$/u.test(revision) ? `?v=${revision}` : '';
  return NATIVE_BACKEND_ORIGINS[0] + route + url.pathname + search;
}

export function publicMediaUrls(source: string): string[] {
  const fallback = publicMediaFallback(source);
  if (!fallback) return [source];
  if (!new URL(fallback).pathname.startsWith('/api/public-media/')) return [source, fallback];
  const onWorker = typeof location !== 'undefined' && location.origin === NATIVE_BACKEND_ORIGINS[0];
  return onWorker || Date.now() < retryMediaHostAt ? [fallback, source] : [source, fallback];
}

export function deferPublicMediaHost(source: string): void {
  const fallback = publicMediaFallback(source);
  if (fallback && new URL(fallback).pathname.startsWith('/api/public-media/')) {
    retryMediaHostAt = Date.now() + MEDIA_RETRY_INTERVAL_MS;
  }
}

export function fallbackReaderMedia(root: HTMLElement) {
  function recover(event: Event) {
    const media = event.target;
    if (media instanceof HTMLImageElement) {
      const fallback = publicMediaFallback(media.src);
      if (fallback) media.src = fallback;
    } else if (media instanceof HTMLSourceElement && media.parentElement instanceof HTMLVideoElement) {
      const fallback = publicMediaFallback(media.src);
      if (fallback) {
        media.src = fallback;
        media.parentElement.load();
      }
    }
  }
  root.addEventListener('error', recover, true);
  return { destroy: () => root.removeEventListener('error', recover, true) };
}

export async function fetchPublicMedia(source: string, init: RequestInit): Promise<Response> {
  const [first, fallback] = publicMediaUrls(source);
  try {
    const response = await fetch(first, init);
    const html = response.headers.get('content-type')?.toLowerCase().includes('text/html');
    if ((response.ok && !html) || !fallback || init.signal?.aborted) return response;
    if (html || response.status >= 500) deferPublicMediaHost(first);
    await response.body?.cancel().catch(() => undefined);
  } catch (error) {
    if (!fallback || init.signal?.aborted) throw error;
    deferPublicMediaHost(first);
  }
  return fetch(fallback, init);
}
