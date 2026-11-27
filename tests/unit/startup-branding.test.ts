import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const html = readFileSync('src/app.html', 'utf8');
const bootstrap = html.match(/<script data-startup-artwork>([\s\S]*?)<\/script>/)![1];
const appBootstrap = html.match(/<script data-app-bootstrap>([\s\S]*?)<\/script>/)![1];
const indexKey = 'tutam_startup_background_index';
const titlePath = '/images/calendar/cu-si-title.webp';
const englishTitlePath = '/images/calendar/cu-si-title-en.webp';
const decode = () => Promise.resolve();

function loadStartup(local: Map<string, string>, session = new Map<string, string>(), dataset = { nativeApp: 'true' } as Record<string, string>) {
  const images: Record<string, { src?: string; textContent?: string; decode: typeof decode }> = {};
  const storage = (data: Map<string, string>) => ({
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  });
  runInNewContext(bootstrap, {
    localStorage: storage(local),
    sessionStorage: storage(session),
    requestAnimationFrame: (callback: () => void) => callback(),
    performance: { now: () => 20 },
    document: {
      documentElement: { dataset },
      getElementById: () => ({ dataset: {}, remove() {}, setAttribute() {} }),
      querySelector: (selector: string) => images[selector] ??= { decode },
    },
    window: { setTimeout() {} },
  });
  return images;
}

describe('startup branding screen contract', () => {
  it('loads optional remote reading fonts only in a browser after native bootstrap', () => {
    const match = html.match(/<script data-web-reading-fonts>([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    expect(html.indexOf('data-web-reading-fonts')).toBeGreaterThan(html.indexOf('data-app-bootstrap'));
    expect(html).not.toMatch(/<link\b[^>]*href=["']https:\/\/fonts\./);
    for (const platform of ['android', 'ios', 'ios-prebridge', 'web']) {
      const links: Record<string, unknown>[] = [];
      runInNewContext(match![1], {
        location: { protocol: platform.startsWith('ios') ? 'capacitor:' : 'https:', hostname: platform === 'web' ? 'quangtu.vn' : 'localhost' },
        window: { Capacitor: platform === 'ios-prebridge' ? {} : { isNativePlatform: () => platform !== 'web' } },
        document: {
          documentElement: { getAttribute: () => platform === 'android' ? 'true' : null },
          createElement: () => ({}),
          head: { appendChild: (link: Record<string, unknown>) => links.push(link) },
        },
      });
      if (platform === 'web') {
        expect(links).toHaveLength(3);
        const stylesheet = links.find(link => link.rel === 'stylesheet')!;
        expect(stylesheet.href).toContain('family=Literata');
        expect(stylesheet.href).toContain('family=Merriweather');
        expect(stylesheet.media).toBe('print');
        (stylesheet.onload as () => void)();
        expect(stylesheet.media).toBe('all');
      } else expect(links).toHaveLength(0);
    }
  });

  it('restricts page scaling in both native shells while preserving the browser viewport', () => {
    const initialViewport = html.match(/<meta name="viewport" content="([^"]+)"/)![1];
    for (const platform of ['android', 'ios', 'web']) {
      let viewport = initialViewport;
      runInNewContext(appBootstrap, {
        location: { protocol: 'https:', hostname: 'localhost' },
        localStorage: { getItem: () => null },
        window: { Capacitor: { isNativePlatform: () => platform !== 'web', getPlatform: () => platform } },
        document: {
          documentElement: { setAttribute() {}, style: { setProperty() {} } },
          querySelector: () => ({ getAttribute: () => viewport, setAttribute: (_name: string, content: string) => { viewport = content; } }),
        },
      });
      expect(viewport).toBe(platform === 'web' ? initialViewport : `${initialViewport}, minimum-scale=1, maximum-scale=1, user-scalable=no`);
    }
  });

  it('rotates through ten local paintings once per new WebView and keeps the title separate', () => {
    const local = new Map<string, string>();
    for (let i = 0; i <= 10; ++i) {
      const session = new Map<string, string>();
      const images = loadStartup(local, session);
      const expectedPath = '/images/calendar/cu-si/' + String(i % 10 + 1).padStart(2, '0') + '.webp';
      expect(images['[data-startup-bg]'].src).toBe(expectedPath);
      expect(images['[data-startup-blur]'].src).toBe(expectedPath);
      expect(images['[data-startup-title]'].src).toBe(titlePath);
      expect(existsSync('static' + expectedPath)).toBe(true);
      expect(loadStartup(local, session)).toEqual(images);
      expect(local.get(indexKey)).toBe(String(i % 10));
    }
    expect(existsSync('static' + titlePath)).toBe(true);
    expect(html).toContain('Đang tải ứng dụng...');
    expect(html).toContain('startup-spinner');
  });

  it('uses the saved app language for both the artwork title and loading copy', () => {
    const storage = new Map([['tutam_locale', 'en']]);
    const session = new Map<string, string>();
    const english = loadStartup(storage, session);
    expect(english['[data-startup-title]'].src).toBe(englishTitlePath);
    expect(english['[data-startup-loading]'].textContent).toBe('Loading app...');
    expect(existsSync('static' + englishTitlePath)).toBe(true);

    storage.set('tutam_locale', 'vi');
    const vietnamese = loadStartup(storage, session);
    expect(vietnamese['[data-startup-title]'].src).toBe(titlePath);
    expect(vietnamese['[data-startup-loading]'].textContent).toBe('Đang tải ứng dụng...');
    expect(vietnamese['[data-startup-bg]'].src).toBe(english['[data-startup-bg]'].src);
  });

  it('recovers from invalid storage and skips artwork loading on the web or when Android paints it natively', () => {
    for (const invalid of ['', '-1', 'ten', '20']) {
      const local = new Map([[indexKey, invalid]]);
      expect(loadStartup(local, new Map([[indexKey, invalid]]))['[data-startup-bg]'].src).toBe('/images/calendar/cu-si/01.webp');
    }
    for (const dataset of [{}, { nativeApp: 'true', nativeStartup: 'true' }] as Record<string, string>[]) {
      const local = new Map<string, string>();
      expect(loadStartup(local, new Map(), dataset)).toEqual({});
      expect(local.size).toBe(0);
    }
  });

  it('uses the same numbered paintings and title in the native Android renderer', () => {
    const java = readFileSync('android/app/src/main/java/vn/quangtu/tutam/StartupArtworkView.java', 'utf8');
    expect(java).toContain('ARTWORK_COUNT = 10');
    expect(java).toContain('images/calendar/cu-si/%02d.webp');
    expect(java).toContain(titlePath.slice(1));
    expect(java).toContain(englishTitlePath.slice(1));
    expect(java).toContain('Đang tải ứng dụng...');
    expect(java).toContain('SpinnerRingView');
    expect(java).toMatch(/Build\.VERSION\.SDK_INT\s*<\s*26\s*\|\|\s*ValueAnimator\.areAnimatorsEnabled\(\)/);
  });
});
