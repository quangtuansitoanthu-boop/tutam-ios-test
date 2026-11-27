import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CARD_MODES = [
  'continue',
  'vegan',
  'rec',
  'tracker',
  'reflection',
  'community',
  'thien',
  'chuoi',
  'le-phat',
  'kinh',
  'tri-chu',
  'nghi-thuc',
  'copying',
  'name-copying',
  'precepts',
  'eight-precepts',
  'thanh-tinh',
  'quan-am',
  'moc-luan',
] as const;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function luminance([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map(v => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrastRatio(hexA: string, hexB: string): number {
  const lA = luminance(hexToRgb(hexA));
  const lB = luminance(hexToRgb(hexB));
  return (Math.max(lA, lB) + 0.05) / (Math.min(lA, lB) + 0.05);
}

function parsePaletteRules(css: string, theme: 'light' | 'dark'): Map<string, { tint: string; mid: string; end: string; ink: string }> {
  const prefix = theme === 'dark' ? ":root\\[data-theme='dark'\\]" : ':root';
  const result = new Map<string, { tint: string; mid: string; end: string; ink: string }>();
  for (const mode of CARD_MODES) {
    const regex = new RegExp(`${prefix}\\s+\\.tt-mode-card--${mode}\\s*\\{([^}]*)\\}`);
    const match = css.match(regex);
    if (!match) continue;
    const body = match[1];
    const tint = body.match(/--mode-tint\s*:\s*(#[0-9a-fA-F]{3,6})/)?.[1]?.toLowerCase();
    const mid = body.match(/--mode-mid\s*:\s*(#[0-9a-fA-F]{3,6})/)?.[1]?.toLowerCase();
    const end = body.match(/--mode-end\s*:\s*(#[0-9a-fA-F]{3,6})/)?.[1]?.toLowerCase();
    const ink = body.match(/--mode-ink\s*:\s*(#[0-9a-fA-F]{3,6})/)?.[1]?.toLowerCase();
    if (tint && mid && end && ink) {
      result.set(mode, { tint, mid, end, ink });
    }
  }
  return result;
}

describe('Tu Tap 19-card palette single source of truth', () => {
  it('removes duplicate .tt-mode-card--* color overrides from ui-refresh.css', () => {
    const uiRefresh = readFileSync('src/lib/styles/ui-refresh.css', 'utf8');
    expect(uiRefresh).not.toMatch(/\.tt-mode-card--[a-z-]+\s*\{[^}]*--mode-tint/);
  });

  it('defines 19 distinct, high-contrast 3D palettes in practice-theme.css for both light and dark themes', () => {
    const practiceTheme = readFileSync('src/lib/styles/practice-theme.css', 'utf8');
    expect(practiceTheme).toContain(':root .tt-mode-card::before');
    expect(practiceTheme).toContain('inset 0 -3.5px 0');

    for (const theme of ['light', 'dark'] as const) {
      const parsed = parsePaletteRules(practiceTheme, theme);
      expect([...parsed.keys()].sort(), `${theme} mode missing cards`).toEqual([...CARD_MODES].sort());

      const gradients = new Map<string, string[]>();
      for (const [mode, { tint, mid, end, ink }] of parsed.entries()) {
        expect(tint, `${theme}:${mode} should have a 3D gradient, not flat`).not.toBe(end);
        expect(contrastRatio(ink, tint), `${theme}:${mode} tint contrast`).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(ink, mid), `${theme}:${mode} mid contrast`).toBeGreaterThanOrEqual(7);
        expect(contrastRatio(ink, end), `${theme}:${mode} end contrast`).toBeGreaterThanOrEqual(5.5);

        const key = `${tint}->${mid}->${end}`;
        const list = gradients.get(key) ?? [];
        list.push(mode);
        gradients.set(key, list);
      }

      const duplicates = [...gradients.values()].filter(list => list.length > 1);
      expect(duplicates, `${theme} mode has duplicate card gradients`).toEqual([]);
    }
  });

  it('applies matching 3D crystal palette to the 4 guide entry cards in PracticeCatalog.svelte', () => {
    const catalog = readFileSync('src/lib/components/practice/catalog/PracticeCatalog.svelte', 'utf8');
    expect(catalog).toContain('::before');
    expect(catalog).toContain('inset 0 -3.5px 0');

    const entryMatches = [...catalog.matchAll(/--entry-tint:(#[0-9a-f]+);\s*--entry-mid:(#[0-9a-f]+);\s*--entry-end:(#[0-9a-f]+);\s*--entry-ink:(#[0-9a-f]+)/gi)];
    expect(entryMatches.length).toBe(8); // 4 light + 4 dark
    for (const [, tint, mid, end, ink] of entryMatches) {
      expect(contrastRatio(ink, tint)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(ink, mid)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(ink, end)).toBeGreaterThanOrEqual(5.5);
    }
  });

  it('keeps SiteHeader root check resilient to trailing slash on /tu-tap/ and supports 3-column subpage header', () => {
    const header = readFileSync('src/lib/components/layout/SiteHeader.svelte', 'utf8');
    expect(header).toMatch(/currentPath === '\/tu-tap' \|\| currentPath === '\/tu-tap\/'/);
    expect(header).toContain('nav-main-row--subpage');
    expect(header).toContain('nav-back-circle-btn');
    expect(header).toContain('nav-logo-wrap--centered');
  });

  it('decouples conduct check-in in DailyPreceptObservance and adds A-/A+ controls to guides', () => {
    const daily = readFileSync('src/lib/components/practice/thanh-tinh/DailyPreceptObservance.svelte', 'utf8');
    expect(daily).toContain('const requiredItems = uniqueItems;');
    expect(daily).not.toContain('conductPromptOpen');
    expect(daily).not.toContain('openConduct');

    const preceptScreen = readFileSync('src/lib/components/practice/thanh-tinh/PreceptPracticeScreen.svelte', 'utf8');
    const reflectionGuide = readFileSync('src/lib/components/practice/personal/ReflectionGuide.svelte', 'utf8');
    expect(preceptScreen).toContain('A−');
    expect(preceptScreen).toContain('A+');
    expect(reflectionGuide).toContain('A−');
    expect(reflectionGuide).toContain('A+');
  });

  it('places target repetitions (default Free) before font size in PracticeSession and uses compact arrows in PracticePreview', () => {
    const session = readFileSync('src/lib/components/practice/reader/PracticeSession.svelte', 'utf8');
    expect(session).toContain('let mantraGoal = $state<number>(0);');
    const sheet = session.slice(session.indexOf('ttp-sheet-settings'));
    const goalIdx = sheet.indexOf('Số biến mục tiêu');
    const fontIdx = sheet.indexOf("'Cỡ chữ'");
    expect(goalIdx).toBeGreaterThan(-1);
    expect(fontIdx).toBeGreaterThan(goalIdx);

    const preview = readFileSync('src/lib/components/practice/reader/PracticePreview.svelte', 'utf8');
    expect(preview).toContain('class="chapter-nav-arrow"');
    expect(preview).not.toContain('← {localeStore.current');
  });

  it('normalizes Progress typography tokens and cleans up Personal feedback & greeting', () => {
    const progress = readFileSync('src/lib/components/practice/community/PracticeProgressDashboard.svelte', 'utf8');
    expect(progress).toContain('--pc-type-5:var(--font-size-section-title)');
    expect(progress).not.toContain('--pc-type-5:40px');

    const personal = readFileSync('src/routes/ca-nhan/+page.svelte', 'utf8');
    expect(personal).toContain('qts:subpage-header');
    expect(personal).toContain('cn-welcome-line');
    expect(personal).not.toContain('cn-channel-messenger');
    expect(personal).not.toContain('cn-channel-facebook');
  });

  it('enforces 44px touch target and route reset on SiteHeader back button, and removes extra top gap on PracticePreview', () => {
    const header = readFileSync('src/lib/components/layout/SiteHeader.svelte', 'utf8');
    expect(header).toContain('min-width: 44px;');
    expect(header).toContain('min-height: 44px;');
    expect(header).toContain('data-custom-back=');

    const preview = readFileSync('src/lib/components/practice/reader/PracticePreview.svelte', 'utf8');
    expect(preview).toContain('.tt-preview{padding-top:var(--practice-topbar-height,12px)}');
    expect(preview).not.toContain('.tt-preview{padding-top:var(--practice-topbar-height,calc(64px');
  });

  it('keeps PracticeSession toolbar visible while scrolling, hides qts-nav during full-screen practice, syncs ca-nhan avatar 1:1 with Home, and fixes an-chay/quotes subpage headers', () => {
    const session = readFileSync('src/lib/components/practice/reader/PracticeSession.svelte', 'utf8');
    expect(session).not.toContain('handleArticleTap');
    expect(session).not.toContain('ttp-zen');
    expect(session).not.toContain('ttp-goal-chips');

    const masterShell = readFileSync('src/lib/styles/master-shell.css', 'utf8');
    expect(masterShell).toContain(':root:has(.tt-practice, .tt-chapter-reader) .qts-nav');

    const personal = readFileSync('src/routes/ca-nhan/+page.svelte', 'utf8');
    expect(personal).toContain('userGreetingName.slice(0, 1).toLocaleUpperCase()');
    expect(personal).toContain('a.cn-practice-rank.cn-practice-rank--home');

    const vegan = readFileSync('src/routes/tu-tap/an-chay/+page.svelte', 'utf8');
    expect(vegan).toContain('--vegan-header-height: var(--site-header-height');
    expect(vegan).not.toContain('padding-top:calc(var(--vegan-header-height)');

    const quotes = readFileSync('src/routes/trich-dan-cua-toi/+page.svelte', 'utf8');
    expect(quotes).not.toContain('quotes-back-btn');
  });

  it('applies high-specificity 3D crystal surfaces to real DOM selectors (.art-card, .weekly-lunar-strip, .daily-dhammapada-card, .pt-fp-sheet, .meditation-chooser, .vegan)', () => {
    const uiRefresh = readFileSync('src/lib/styles/ui-refresh.css', 'utf8');
    expect(uiRefresh).toContain('.art-card');
    expect(uiRefresh).toContain('.weekly-lunar-strip');
    expect(uiRefresh).toContain('.daily-dhammapada-card');
    expect(uiRefresh).toContain('.pt-as-action-btn');
    expect(uiRefresh).toContain('.pt-fp-ctrl-btn');
    expect(uiRefresh).toContain('.pt-fp-pill-btn');
    expect(uiRefresh).toContain('.meditation-sound-picker__tile');
    expect(uiRefresh).toContain('html:root body');

    const audioPlayer = readFileSync('src/lib/components/audio/AudioMiniPlayer.svelte', 'utf8');
    expect(audioPlayer).toContain('color: var(--on-gold)');
  });

  it('centers PracticePreview header badge, uppercase balanced title, and metadata consistently', () => {
    const preview = readFileSync('src/lib/components/practice/reader/PracticePreview.svelte', 'utf8');
    expect(preview).toMatch(/\.tt-preview__header\{[^}]*justify-items:center/);
    expect(preview).toMatch(/\.tt-preview__header\{[^}]*text-align:center/);
    expect(preview).toMatch(/\.tt-preview__header h1\{[^}]*text-align:center[^}]*text-transform:uppercase[^}]*text-wrap:balance/);
    expect(preview).toMatch(/\.tt-preview__meta\{[^}]*justify-content:center/);
  });

  it('refines HomeDailyReminders with lunar pill, iOS count badge, header add action, and divider rows', () => {
    const reminders = readFileSync('src/lib/components/home/HomeDailyReminders.svelte', 'utf8');
    expect(reminders).toContain('thaptrai-lunar-pill');
    expect(reminders).toMatch(/\.thaptrai-card\s*\{[^}]*border-left:\s*3\.5px solid var\(--gold\)/s);
    expect(reminders).not.toContain('#dc2626');
    expect(reminders).toMatch(/\.personal-count-pill\s*\{[^}]*background:\s*#ff3b30;[^}]*color:\s*#fff;/s);
    expect(reminders).toMatch(/:global\(\[data-theme='dark'\]\) \.personal-count-pill[^{}]*\{[^}]*background:\s*#ff453a;/s);
    expect(reminders).toMatch(/\.personal-add-more-btn\s*\{[^}]*min-height:\s*44px/s);
    expect(reminders).not.toMatch(/\.personal-add-more-btn\s*\{[^}]*border:\s*1px dashed/s);
    expect(reminders).toMatch(/\.personal-list-item\s*\{[^}]*border-bottom:\s*1px solid/s);
    expect(reminders).toContain('getPersonalEventTypeIcon(item.type)');
    expect(reminders).not.toContain('personal-item-type-tag');
    expect(reminders).not.toContain('personal-delete-btn');
    expect(reminders).toMatch(/\.personal-add-more-btn\s*\{[^}]*background:\s*var\(--gold\)/s);
    expect(reminders).toContain('Ngày Lễ của');
    expect(reminders).not.toContain('Ngày Lễ & Kỷ Niệm');
    expect(reminders).toMatch(/\.personal-item-note\s*\{[^}]*color:\s*var\(--text2\)/s);
  });

  it('uses larger reading font size token for author bio body copy in ca-nhan', () => {
    const personal = readFileSync('src/routes/ca-nhan/+page.svelte', 'utf8');
    expect(personal).toMatch(/\.cn-author-p\s*\{[^}]*font-size:\s*var\(--font-size-ritual-reading\)/s);
  });

  it('uses high-contrast tokens for the active track row in AudioMiniPlayer playlist', () => {
    const audioPlayer = readFileSync('src/lib/components/audio/AudioMiniPlayer.svelte', 'utf8');
    expect(audioPlayer).toMatch(/\.pt-fp-track-item\.active\s*\{[^}]*background:\s*var\(--gold-light\)/s);
    expect(audioPlayer).toMatch(/\.pt-fp-track-item\.active \.pt-fp-track-title\s*\{[^}]*color:\s*var\(--text\)/s);
    expect(audioPlayer).toMatch(/\.pt-fp-track-status\s*\{[^}]*color:\s*var\(--brown\)/s);
  });

  it('keeps the 3 QuoteCardModal action buttons compact on a single row on mobile', () => {
    const quoteModal = readFileSync('src/lib/components/reader/QuoteCardModal.svelte', 'utf8');
    expect(quoteModal).toMatch(/\.quote-card-actions\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
    expect(quoteModal).not.toMatch(/\.quote-card-actions\s*\{[^}]*flex-direction:\s*column/s);
    expect(quoteModal).toMatch(/\.quote-btn\s*\{[^}]*font-size:\s*var\(--font-size-meta\)/s);
  });

  it('renders the app theme picker in ca-nhan as compact horizontal 2-column palette buttons matching readerBg', () => {
    const personal = readFileSync('src/routes/ca-nhan/+page.svelte', 'utf8');
    expect(personal).toMatch(/\.cn-app-theme-choice\s*\{[^}]*flex-direction:\s*row/s);
    expect(personal).toMatch(/\.cn-app-theme-choice\s*\{[^}]*min-height:\s*var\(--touch-target-size\)/s);
    expect(personal).not.toMatch(/\.cn-app-theme-choice\s*\{[^}]*calc\(var\(--touch-target-size\)\s*\*\s*2\)/s);
    expect(personal).toContain('.cn-app-theme-choice[data-palette="dark"]');
  });

  it('uses full-width title/desc under header row in FixedPracticeGuideBanners, compact 1-row ContentUpdateControl, and trims extra home bottom padding', () => {
    const banners = readFileSync('src/lib/components/guide/FixedPracticeGuideBanners.svelte', 'utf8');
    expect(banners).toContain('tt-guide-banner__top');
    expect(banners).toMatch(/\.tt-guide-banner\s*\{[^}]*flex-direction:\s*column/s);

    const updateCard = readFileSync('src/lib/components/home/ContentUpdateControl.svelte', 'utf8');
    expect(updateCard).toContain('content-update-icon');
    expect(updateCard).toMatch(/\.content-update-card\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/s);

    const homePage = readFileSync('src/routes/+page.svelte', 'utf8');
    expect(homePage).toContain('padding: 20px 16px 12px;');
  });

  it('refines PersonalEventsModal without redundant notification toggle, with thin scrollbar, concise 1-line conversion, and pinned footer actions', () => {
    const modal = readFileSync('src/lib/components/practice/reminder/PersonalEventsModal.svelte', 'utf8');
    expect(modal).not.toContain('pem-notify-toggle-card');
    expect(modal).not.toContain('pem-switch');
    expect(modal).toContain('scrollbar-width: thin');
    expect(modal).not.toContain('Dương lịch tương ứng năm');
    expect(modal).not.toContain('inset 0 0 0 1px var(--on-gold)');
    expect(modal).toMatch(/<div class="pem-footer">[\s\S]*pem-done-btn[\s\S]*pem-submit-btn[\s\S]*<\/div>/);
  });

  it('gives MeditationChooser tabs readable body font size, segmented background, and high-contrast solid gold active pill', () => {
    const chooser = readFileSync('src/lib/components/practice/dialog/MeditationChooser.svelte', 'utf8');
    expect(chooser).toMatch(/\.meditation-chooser__tabs\{[^}]*background:var\(--bg2\)/s);
    expect(chooser).toMatch(/\.meditation-chooser__tabs button\{[^}]*font-size:var\(--font-size-body\)/s);
    expect(chooser).toMatch(/\.meditation-chooser__tabs button\[aria-selected='true'\]\{[^}]*background:linear-gradient\([^)]*var\(--gold2\)[^)]*var\(--gold\)[^}]*color:var\(--on-gold\)/s);
  });

  it('applies unified 3D crystal styling across ReaderBoundary, PracticePreview, and PracticeSession chrome without touching reading prose', () => {
    const reader = readFileSync('src/lib/components/library/ReaderBoundary.svelte', 'utf8');
    expect(reader).toContain('3D Pha lê');
    expect(reader).toContain('.reader-modal.bg-dark .reader-view-count');
    expect(reader).toMatch(/\.reader-modal \.toc\{[^}]*border-radius:var\(--radius-card\)/s);
    expect(reader).toMatch(/\.reader-modal \.reader-resume-banner\{[^}]*border-radius:var\(--radius-card\)/s);

    const preview = readFileSync('src/lib/components/practice/reader/PracticePreview.svelte', 'utf8');
    expect(preview).toContain('3D Pha lê');
    expect(preview).toMatch(/\.tt-preview__toc\{[^}]*border-radius:var\(--radius-card\)/s);
    expect(preview).toMatch(/\.tt-preview__start-card[^{]*\{[^}]*border-radius:var\(--radius-card\)/s);

    const session = readFileSync('src/lib/components/practice/reader/PracticeSession.svelte', 'utf8');
    expect(session).toContain('3D Pha lê');
    expect(session).toContain('.ttp-header-badge');
  });
});
