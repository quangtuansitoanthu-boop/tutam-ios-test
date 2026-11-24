import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isNativeApp, nativePlatform } from './native-platform';

const systemBars = registerPlugin<{
  setStyle(options: { dark: boolean; backgroundColor: string }): Promise<void>;
  setFullscreen(options: { enabled: boolean }): Promise<void>;
  getAppearance(): Promise<{ dark: boolean }>;
  addListener(event: 'appearanceChanged', callback: (appearance: { dark: boolean }) => void): Promise<PluginListenerHandle>;
}>('AppSystemBars');

/** Android configuration is authoritative when WebView media queries lag behind the OS. */
export function watchNativeSystemAppearance(callback: (dark: boolean) => void): () => void {
  if (!isNativeApp() || nativePlatform() !== 'android') return () => {};
  let disposed = false;
  let receivedEvent = false;
  let listener: PluginListenerHandle | undefined;
  const remove = (handle: PluginListenerHandle) => { void handle.remove().catch(() => {}); };
  void (async () => {
    try {
      const handle = await systemBars.addListener('appearanceChanged', appearance => {
        if (disposed || typeof appearance?.dark !== 'boolean') return;
        receivedEvent = true;
        callback(appearance.dark);
      });
      if (disposed) { remove(handle); return; }
      listener = handle;
      const appearance = await systemBars.getAppearance();
      if (!disposed && !receivedEvent && typeof appearance?.dark === 'boolean') callback(appearance.dark);
    } catch {
      // Older installed native shells keep the existing matchMedia fallback.
    }
  })();
  return () => {
    disposed = true;
    if (listener) { remove(listener); listener = undefined; }
  };
}

let fullscreenWork: Promise<void> = Promise.resolve();
type Appearance = { dark: boolean; backgroundColor: string };
let themeAppearance: Appearance | undefined;
const appearanceOverrides: Appearance[] = [];
let appearanceWork: Promise<void> = Promise.resolve();

export function setNativeSystemBarsFullscreen(enabled: boolean): Promise<void> {
  if (!isNativeApp()) return Promise.resolve();
  const platform = nativePlatform();
  // Giữ thứ tự vào/thoát khi đóng màn thiền trước lúc bridge hoàn tất lệnh ẩn.
  fullscreenWork = fullscreenWork.then(async () => {
    if (platform === 'android') {
      await systemBars.setFullscreen({ enabled });
    } else if (platform === 'ios') {
      const { StatusBar } = await import('@capacitor/status-bar');
      if (enabled) await StatusBar.hide();
      else await StatusBar.show();
    }
  }).catch(() => {
    console.warn('[system-bars] Unable to update native fullscreen status.');
  });
  return fullscreenWork;
}

async function applyAppearance({ dark, backgroundColor }: Appearance): Promise<void> {
  if (!isNativeApp()) return;
  // Both native bridges require full hex colors; CSS tokens may use #RGB.
  backgroundColor = backgroundColor.replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i,
    (_, red: string, green: string, blue: string) => '#' + red + red + green + green + blue + blue);
  try {
    if (nativePlatform() === 'android') {
      await systemBars.setStyle({ dark, backgroundColor });
    } else if (nativePlatform() === 'ios') {
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
      await StatusBar.setBackgroundColor({ color: backgroundColor });
      // StatusBar only paints the top inset; the bridge owns the home-indicator surface.
      await systemBars.setStyle({ dark, backgroundColor });
    }
  } catch {
    // Đổi theme vẫn tiếp tục khi bridge chưa sẵn sàng.
    console.warn('[system-bars] Unable to update native system bar appearance.');
  }
}

function queueAppearance(): Promise<void> {
  const appearance = appearanceOverrides[appearanceOverrides.length - 1] ?? themeAppearance;
  if (!appearance) return Promise.resolve();
  // Giữ thứ tự khi mở/đóng modal trước lúc bridge hoàn tất đổi theme.
  const snapshot = { ...appearance };
  appearanceWork = appearanceWork.then(() => applyAppearance(snapshot));
  return appearanceWork;
}

export function syncNativeSystemBars(dark: boolean, backgroundColor: string): Promise<void> {
  if (!isNativeApp()) return Promise.resolve();
  themeAppearance = { dark, backgroundColor };
  return queueAppearance();
}

export function overrideNativeSystemBars(dark: boolean, backgroundColor: string): () => void {
  if (!isNativeApp()) return () => {};
  const appearance = { dark, backgroundColor };
  appearanceOverrides.push(appearance);
  void queueAppearance();
  return () => {
    const index = appearanceOverrides.indexOf(appearance);
    if (index < 0) return;
    appearanceOverrides.splice(index, 1);
    void queueAppearance();
  };
}

/** Match a full-screen surface, including paper selection, without polling or fetching. */
export function nativeSystemBarsSurface(node: HTMLElement): { destroy(): void } {
  if (!isNativeApp()) return { destroy() {} };
  const appearance: Appearance = { dark: false, backgroundColor: '' };
  let registered = false;
  let destroyed = false;
  const refresh = () => {
    if (destroyed) return;
    let surface: HTMLElement | null = node;
    let channels: number[] | undefined;
    while (surface) {
      const color = getComputedStyle(surface).backgroundColor;
      const match = color.match(/^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/);
      if (match && (match[4] === undefined || Number(match[4]) === 1)) {
        channels = match.slice(1, 4).map(Number);
        break;
      }
      surface = surface.parentElement;
    }
    if (!channels) return;
    const backgroundColor = '#' + channels.map(value => value.toString(16).padStart(2, '0')).join('');
    if (appearance.backgroundColor === backgroundColor) return;
    const luminance = channels.map(value => {
      const c = value / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    if (!registered) {
      appearanceOverrides.push(appearance);
      registered = true;
    }
    appearance.backgroundColor = backgroundColor;
    // Choose the more legible system glyph color using relative luminance.
    appearance.dark = luminance[0] * 0.2126 + luminance[1] * 0.7152 + luminance[2] * 0.0722 < 0.179;
    void queueAppearance();
  };
  const observer = new MutationObserver(refresh);
  for (let surface: HTMLElement | null = node; surface; surface = surface.parentElement) {
    observer.observe(surface, { attributes: true, attributeFilter: ['class', 'style', 'data-bg', 'data-read-bg', 'data-theme', 'data-app-palette'] });
  }
  refresh();
  return {
    destroy() {
      destroyed = true;
      observer.disconnect();
      const index = appearanceOverrides.indexOf(appearance);
      if (index >= 0) appearanceOverrides.splice(index, 1);
      void queueAppearance();
    }
  };
}
