import { getContext, setContext } from 'svelte';
import { syncNativeSystemBars } from '$lib/browser/native-system-bars';
import { triggerHaptic } from '$lib/utils/haptics';
import { LEGACY_LOCAL_STORAGE_KEYS } from '$lib/browser/storage-contract';

export type ThemeMode = 'auto' | 'light' | 'dark';
export type ThemeName = 'light' | 'dark';
export type LightPalette = 'white' | 'cream' | 'gray' | 'purple';
export type ThemePaper = LightPalette | 'dark';
const THEME_CONTEXT = Symbol('quangtu-theme');

export interface ThemeStore {
  readonly mode: ThemeMode;
  readonly value: ThemeName;
  readonly palette: LightPalette;
  readonly paper: ThemePaper;
  apply(next: ThemeMode | ThemeName, palette?: LightPalette): void;
  updateNativeSystemAppearance(dark: boolean): void;
  toggle(): void;
}

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

export function createThemeStore(initial: ThemeMode = 'auto'): ThemeStore {
  let mode = $state<ThemeMode>(initial);
  let palette = $state<LightPalette>('white');
  let systemDark = $state(false);
  let nativeAppearanceKnown = false;

  if (typeof window !== 'undefined') {
    systemDark = getSystemPrefersDark();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', (e) => {
      if (nativeAppearanceKnown) return;
      systemDark = e.matches;
      if (mode === 'auto') {
        syncDom(e.matches ? 'dark' : 'light');
      }
    });
  }

  function resolve(m: ThemeMode): ThemeName {
    if (m === 'auto') {
      return systemDark ? 'dark' : 'light';
    }
    return m;
  }

  let value = $derived<ThemeName>(resolve(mode));
  const paper = $derived<ThemePaper>(value === 'dark' ? 'dark' : mode === 'auto' ? 'cream' : palette);

  function syncPaperPreferences(resolved: ThemeName): void {
    const selectedPaper: ThemePaper = resolved === 'dark' ? 'dark' : mode === 'auto' ? 'cream' : palette;
    try {
      if (typeof localStorage === 'undefined') return;
      const keys = [LEGACY_LOCAL_STORAGE_KEYS.readerBackground, 'tutam_read_bg_dark', LEGACY_LOCAL_STORAGE_KEYS.tutapReadBackground, LEGACY_LOCAL_STORAGE_KEYS.practiceBackground];
      if (selectedPaper !== 'dark') keys.push(LEGACY_LOCAL_STORAGE_KEYS.tutapLightBackground);
      for (const key of keys) {
        if (localStorage.getItem(key) !== selectedPaper) localStorage.setItem(key, selectedPaper);
      }
    } catch { /* Nền đang hiển thị vẫn đổi được khi bộ nhớ thiết bị không ghi được. */ }
  }

  function syncDom(resolved: ThemeName) {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = resolved;
      document.documentElement.dataset.appPalette = resolved === 'dark' ? 'dark' : mode === 'auto' ? 'cream' : palette;
      syncPaperPreferences(resolved);
      const backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
        || (resolved === 'dark' ? '#15120d' : '#FAF1E4');
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) {
        metaTheme.setAttribute('content', backgroundColor);
      }
      document.documentElement.style.backgroundColor = backgroundColor;
      void syncNativeSystemBars(resolved === 'dark', backgroundColor);
    }
  }

  const apply = (next: ThemeMode | ThemeName, nextPalette?: LightPalette) => {
    if (nextPalette) palette = nextPalette;
    mode = next;
    const resolved = resolve(next);
    syncDom(resolved);
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem('tutam_dark_mode', next === 'dark' ? '1' : next === 'light' ? '0' : 'auto');
      if (typeof localStorage !== 'undefined') localStorage.setItem('tutam_app_light_palette', palette);
    } catch { /* The live theme remains usable when persistence is unavailable. */ }
  };

  return {
    get mode() { return mode; },
    get value() { return value; },
    get palette() { return palette; },
    get paper() { return paper; },
    apply,
    updateNativeSystemAppearance(dark: boolean) {
      if (typeof dark !== 'boolean') return;
      nativeAppearanceKnown = true;
      systemDark = dark;
      if (mode === 'auto') syncDom(dark ? 'dark' : 'light');
    },
    toggle() {
      const next: ThemeName = value === 'dark' ? 'light' : 'dark';
      apply(next);
      triggerHaptic('selection');
    }
  };
}

export function setThemeContext(initial: ThemeMode = 'auto'): ThemeStore {
  const store = createThemeStore(initial);
  setContext(THEME_CONTEXT, store);
  return store;
}

export function getThemeContext(): ThemeStore {
  const store = getContext<ThemeStore | undefined>(THEME_CONTEXT);
  if (!store) throw new Error('Theme context is unavailable outside the root layout.');
  return store;
}
