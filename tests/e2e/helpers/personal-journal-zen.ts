import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import bundledEnglishManifest from '../../../src/lib/data/english-pack-manifest.json' with { type: 'json' };
import { deferStartupNotification, isDataApiPath, settleClient } from '../runtime-helpers';

export async function fixtureEnglishPack(page: Page) {
  const origin = new URL(process.env.SVELTEKIT_BASE_URL || 'http://localhost:8787').origin;
  const origins = new Set([origin, 'https://media.quangtu.vn',
    'https://quangtu-web.quangtu-ansitoanthu.workers.dev', 'https://quangtu.vn']);
  const manifest = readFileSync('static/offline-data/english-pack-manifest.json');
  expect(JSON.parse(manifest.toString('utf8'))).toEqual(bundledEnglishManifest);
  const entries = new Map(bundledEnglishManifest.entries.map(entry => [entry.file, entry]));
  // English startup prefetches chapter bodies. Keep their real bytes and CORS local
  // so host isolation cannot turn an unrelated journal assertion into a pageerror.
  await page.route(url => origins.has(url.origin)
    && /^\/(?:api\/public-media\/)?offline-data\/(?:english-pack-manifest\.json|chapters-en\/[\w-]+\.json)$/u.test(url.pathname), route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/^\/api\/public-media/u, '');
    const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,HEAD,OPTIONS',
      'access-control-allow-headers': request.headers()['access-control-request-headers'] || 'content-type' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    let body = manifest;
    if (pathname.startsWith('/offline-data/chapters-en/')) {
      const file = pathname.slice('/offline-data/chapters-en/'.length);
      const entry = entries.get(file);
      expect(entry, 'English startup must request a chapter in the shipped manifest').toBeDefined();
      body = readFileSync('static/offline-data/chapters-en/' + file);
      expect(body.byteLength, file).toBe(entry!.bytes);
      expect(createHash('sha256').update(body).digest('hex'), file).toBe(entry!.sha256);
    }
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body });
  });
}

function journalCase(width: number, dark: boolean, locale: 'vi' | 'en', fallback = false) {
  test(`journal full-screen writing preserves drafts and modality (${width}, ${dark ? 'dark' : 'light'}, ${locale}, ${fallback ? 'fallback' : 'native dialog'})`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await deferStartupNotification(page);
    await page.addInitScript(({ dark, locale, fallback }) => {
      if (fallback) {
        Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: undefined });
        Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: undefined });
      }
      localStorage.setItem('tutam_locale', locale);
      localStorage.setItem('tutam_dark_mode', dark ? '1' : '0');
      localStorage.setItem('tt_reflection_guide_seen_v1', '1');
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key.endsWith(':tt_personal_reflections_v1')) throw new DOMException('Test quota failure', 'QuotaExceededError');
        original.call(this, key, value);
      };
    }, { dark, locale, fallback });
    const requests: string[] = [];
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (isDataApiPath(path)) requests.push(path);
      return route.fulfill({ json: path === '/api/session'
        ? { authenticated: false, user: null, csrfToken: null, expiresAt: null }
        : path === '/api/presence' ? { enabled: false, activeCount: 0 } : [] });
    });
    if (locale === 'en') await fixtureEnglishPack(page);
    await page.goto('/tu-tap', { waitUntil: 'domcontentloaded' });
    await settleClient(page);
    await page.locator('.tt-mode-card--reflection').click();
    const guideToggle = page.locator('.guide-toggle-button');
    await expect(guideToggle).toHaveAttribute('aria-expanded', 'true');
    await guideToggle.click();
    const journal = page.locator('.personal-journal');
    const opener = journal.locator('.zen-open-btn').first();
    await expect(opener).toBeVisible();
    const before = requests.length;
    await opener.click();
    const dialog = page.locator('dialog.zen-overlay');
    const editor = dialog.locator('textarea');
    await expect(dialog).toBeVisible();
    await expect(editor).toBeFocused();
    await expect(dialog.locator('.snippet-pill').first()).toHaveText(locale === 'en' ? '+ Actions' : '+ Thân');
    const content = 'Private draft remains on this device. '.repeat(20);
    await editor.fill(content);
    await dialog.locator('.zen-save-btn').click();
    const feedback = page.locator('dialog.app-dialog');
    await expect(feedback).toBeVisible();
    await expect(feedback).toContainText(locale === 'en' ? 'Unable to save' : 'Chưa lưu được');
    await feedback.getByRole('button').click();
    await expect(dialog.getByRole('status')).toContainText(locale === 'en' ? 'Unable to save' : 'Chưa lưu được');
    await expect(editor).toHaveValue(content);
    await expect(dialog.locator('.zen-stats')).toContainText(locale === 'en' ? 'characters' : 'ký tự');
    const geometry = await dialog.evaluate(node => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      overflowing: [...node.querySelectorAll<HTMLElement>('*')].filter(item => !item.closest('.zen-quick-snippets') && item.scrollWidth > item.clientWidth + 1).map(item => ({
        tag: item.tagName, className: item.className, scrollWidth: item.scrollWidth, clientWidth: item.clientWidth,
      })),
    }));
    expect(geometry.scrollWidth > geometry.clientWidth, JSON.stringify(geometry)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    const controls = await dialog.locator('.snippet-pill, .zen-close-btn, .zen-save-btn, .zen-done-btn').evaluateAll(nodes =>
      nodes.map(node => ({ label: node.textContent, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
    expect(controls.filter(control => control.width < 44 || control.height < 44)).toEqual([]);
    await page.screenshot({ path: info.outputPath('journal-zen.png'), animations: 'disabled' });
    await editor.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
    await expect(journal.locator('textarea').first()).toHaveValue(content);
    expect(requests).toHaveLength(before);
    await opener.click();
    await expect(page.locator('dialog.zen-overlay textarea')).toHaveValue(content);
    await page.locator('dialog.zen-overlay .zen-done-btn').click();
    await expect(dialog).toHaveCount(0);
    expect(requests).toHaveLength(before);
    expect(errors).toEqual([]);
  });
}

export function registerJournalZenCases() {
  for (const width of [375, 1440]) for (const dark of [false, true]) for (const locale of ['vi', 'en'] as const) {
    journalCase(width, dark, locale);
  }
  journalCase(375, false, 'vi', true);
}
