import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('route and feature bugfix regressions', () => {
  it('MobileBottomNav only intercepts tab-reset on exact path match so sub-routes navigate back', () => {
    const src = readFileSync('src/lib/components/layout/MobileBottomNav.svelte', 'utf8');
    expect(src).toContain("if (typeof window !== 'undefined' && currentPath === href)");
    expect(src).not.toContain('currentPath.startsWith(href)');
  });

  it('tien-do-tu-tap derives auth purely from reactive sessionStore without stale data.user fallback', () => {
    const src = readFileSync('src/routes/tien-do-tu-tap/+page.svelte', 'utf8');
    expect(src).not.toContain('sessionStore.value.user || data.user');
    expect(src).toContain('sessionStore.value.authenticated ? sessionStore.value.user : null');
  });

  it('ca-nhan wraps native Google/Apple login in try/finally and avoids unconditional fallback timers', () => {
    const src = readFileSync('src/routes/ca-nhan/+page.svelte', 'utf8');
    expect(src).toMatch(/try\s*\{[\s\S]*?loginWithGoogleNative\(\)[\s\S]*?\}\s*catch[\s\S]*?finally\s*\{\s*authBusy\s*=\s*false;/u);
    expect(src).toMatch(/try\s*\{[\s\S]*?loginWithAppleNative\(\)[\s\S]*?\}\s*catch[\s\S]*?finally\s*\{\s*authBusy\s*=\s*false;/u);
    expect(src).not.toMatch(/window\.location\.href\s*=\s*intentUrl;\s*setTimeout\(\(\)\s*=>\s*\{\s*window\.location\.href\s*=\s*mailtoUrl;/u);
    expect(src).not.toMatch(/fb-messenger:\/\/user-thread\/tranan\.buhd";\s*setTimeout\(\(\)\s*=>\s*\{\s*void openExternalBrowser\(url\);\s*\},\s*800\);/u);
  });

  it('kinh-sach uses localizedArticles for lookups and closes open reader on tab-reset', () => {
    const src = readFileSync('src/routes/kinh-sach/+page.svelte', 'utf8');
    expect(src).toContain('const article = localizedArticles.find((item) => item.id === id)');
    expect(src).not.toContain('const found = articles.find(');
    expect(src).toContain("window.addEventListener('quangtu:tab-reset', handleTabReset)");
    expect(src).toContain("window.removeEventListener('quangtu:tab-reset', handleTabReset)");
  });

  it('phap-thoai pops pushed album history on close and uses high-contrast --brown tokens', () => {
    const src = readFileSync('src/routes/phap-thoai/+page.svelte', 'utf8');
    expect(src).toMatch(/if\s*\(!isFromPopState\s*&&\s*pushedAlbumHistory\)\s*\{\s*pushedAlbumHistory\s*=\s*false;\s*window\.history\.back\(\);/u);
    expect(src).toContain('.pt-page-eyebrow{display:block;margin-bottom:3px;color:var(--brown)');
    expect(src).toContain('.pt-page-title em{color:var(--brown);font-style:normal}');
    expect(src).toContain('background:var(--gold-light);border-color:var(--gold);color:var(--brown)');
    expect(src).toContain('color:var(--brown);font:inherit;font-weight:700;cursor:pointer');
  });

  it('home page gates web catalog fetch with catalogEnabled and closes reader on tab-reset', () => {
    const src = readFileSync('src/routes/+page.svelte', 'utf8');
    expect(src).toContain('enabled: isNativeApp() || catalogEnabled');
    expect(src).toContain("window.addEventListener('quangtu:tab-reset', handleTabReset)");
    expect(src).toContain("window.removeEventListener('quangtu:tab-reset', handleTabReset)");
  });

  it('chep-kinh fixes step 3 label, uppercases sutra titles, and adds ellipsis padding on chapter select', () => {
    const src = readFileSync('src/routes/tu-tap/chep-kinh/+page.svelte', 'utf8');
    expect(src).toContain("localizeUi('BƯỚC 3 · CHÉP KINH')");
    expect(src).not.toContain("localizeUi('BƯỚC 2 · CHÉP KINH')");
    expect(src).toMatch(/\.books strong\{[^}]*text-transform:\s*uppercase/u);
    expect(src).toMatch(/\.chapter-choice select\{[^}]*text-overflow:\s*ellipsis[^}]*padding-right:\s*36px/u);
  });
});
