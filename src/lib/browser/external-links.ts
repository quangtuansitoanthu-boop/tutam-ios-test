import { registerPlugin } from '@capacitor/core';
import { STORE_URLS } from '$lib/contracts/native-app-update';
import { isNativeApp, nativePlatform } from './native-platform';

interface ExternalLinksPlugin {
  openBrowser(options: { url: string }): Promise<void>;
  openStore(options: { url: string }): Promise<void>;
}
const externalLinks = registerPlugin<ExternalLinksPlugin>('ExternalLinks');

export async function openExternalBrowser(value: string): Promise<void> {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('invalid_external_url');
  if (isNativeApp()) {
    try { await externalLinks.openBrowser({ url: url.href }); }
    catch { throw new Error('external_browser_unavailable'); }
    return;
  }
  // Web mở tab riêng; native dùng cùng owner trình duyệt hệ thống.
  window.open(url.href, '_blank', 'noopener,noreferrer');
}

export async function openNativeAppStore(url: string): Promise<void> {
  const platform = nativePlatform();
  if (!isNativeApp() || platform === 'web' || url !== STORE_URLS[platform]) throw new Error('invalid_store_url');
  await externalLinks.openStore({ url });
}

export async function copyExternalLink(value: string): Promise<void> {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('invalid_external_url');
  if (!navigator.clipboard?.writeText) throw new Error('clipboard_unavailable');
  await navigator.clipboard.writeText(url.href);
}
