<script lang="ts">
  import { List, SlidersHorizontal } from '@lucide/svelte';
  import { nativeSystemBarsSurface } from '$lib/browser/native-system-bars';
  import { tick } from 'svelte';
  import PracticeFloatingControls from './PracticeFloatingControls.svelte';
  import { savedContentImages } from '$lib/browser/session-cover';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getThemeContext } from '$lib/stores/theme.svelte';
  import type { PracticeAutoScrollSpeed } from '$lib/browser/practice-auto-scroll';
  import type { MeditationTrack } from '$lib/browser/practice-audio';
  import type { PracticeFabPosition } from '$lib/browser/practice-storage';
  import { orderPracticeChapters, type PracticeArticleDetail, type PracticeChapterPreview } from '$lib/domain/practice/state';
  import { formatPracticeRitualHtml, preparePracticeHeadings } from '$lib/domain/practice/content';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { localizeChapterTitle } from '$lib/domain/library/localized-article';
  import { triggerHaptic } from '$lib/utils/haptics';
  import RosarySelect from '$lib/components/practice/rosary/RosarySelect.svelte';

  interface Props {
    article: PracticeArticleDetail;
    autoScrollActive: boolean;
    autoScrollSpeed: PracticeAutoScrollSpeed;
    currentChapterIndex: number;
    chapters?: PracticeChapterPreview[];
    onChapterSelect?: (index: number) => void | Promise<void>;
    navigationReady?: boolean;
    fabPosition: PracticeFabPosition | null;
    fontSize: number;
    meditationMusicActive: boolean;
    selectedMeditationTrack: MeditationTrack | null;
    modelChantActive: boolean;
    moActive: boolean;
    panelOpen: boolean;
    practiceBackground: string;
    practiceBold: boolean;
    practiceCount: number;
    practiceHtml: string;
    practiceTitle: string;
    routineContext?: string;
    showChapterNavigation: boolean;
    totalChapters: number;
    onAutoScrollToggle: () => void;
    onAutoScrollSpeedChange: (speed: PracticeAutoScrollSpeed) => void;
    onBackgroundChange: (value: string) => void;
    onCountChange: (delta: number) => void;
    onExit: () => void;
    onFabPositionSave: (position: PracticeFabPosition) => void;
    onFontSizeChange: (delta: number) => void;
    onNextChapter: () => void;
    onPanelToggle: () => void;
    onPreviousChapter: () => void;
    onSelectMeditationTrack: (track: MeditationTrack) => void;
    onStopMeditationMusic: () => void;
    onModelChantToggle: () => void;
    onToggleBold: () => void;
    onToggleMo: () => void;
  }

  let {
    article,
    autoScrollActive,
    autoScrollSpeed,
    currentChapterIndex,
    chapters = [],
    onChapterSelect,
    navigationReady = true,
    fabPosition,
    fontSize,
    meditationMusicActive,
    selectedMeditationTrack,
    modelChantActive,
    moActive,
    panelOpen,
    practiceBackground,
    practiceBold,
    practiceCount,
    practiceHtml,
    practiceTitle,
    routineContext,
    showChapterNavigation,
    totalChapters,
    onAutoScrollToggle,
    onAutoScrollSpeedChange,
    onBackgroundChange,
    onCountChange,
    onExit,
    onFabPositionSave,
    onFontSizeChange,
    onNextChapter,
    onPanelToggle,
    onPreviousChapter,
    onSelectMeditationTrack,
    onStopMeditationMusic,
    onModelChantToggle,
    onToggleBold,
    onToggleMo
  }: Props = $props();

  const themeStore = (() => {
    try { return getThemeContext(); }
    catch { return null; } // Standalone previews retain their provided paper.
  })();
  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t.practice);
  const toolbarT = $derived(localeStore.t.readerToolbar);
  const resolvedPracticeBackground = $derived(themeStore?.paper ?? (['white', 'cream', 'gray', 'dark', 'purple'].includes(practiceBackground) ? practiceBackground : 'cream'));
  let tocOpen = $state(false);
  let settingsOpen = $state(false);
  let mantraGoal = $state<number>(0);
  let goalReachedToast = $state(false);
  let goalToastTimer: ReturnType<typeof setTimeout> | undefined;
  let tocTrigger = $state<HTMLButtonElement | null>(null);
  let settingsTrigger = $state<HTMLButtonElement | null>(null);
  let practiceArticle = $state<HTMLElement | null>(null);
  let readerToolbar = $state<HTMLElement | null>(null);

  const MANTRA_GOALS = [0, 1, 3, 7, 21, 49, 108] as const;
  const preparedRitual = $derived(preparePracticeHeadings(formatPracticeRitualHtml(practiceHtml)));
  const autoHeadings = $derived(chapters.length === 0 ? preparedRitual.headings : []);
  const hasToc = $derived(chapters.length > 0 || autoHeadings.length > 0);
  const goalReached = $derived(mantraGoal > 0 && practiceCount >= mantraGoal);

  $effect(() => {
    return () => {
      if (goalToastTimer !== undefined) clearTimeout(goalToastTimer);
    };
  });

  function jumpToHeading(id: string): void {
    tocOpen = false;
    void tick().then(() => {
      const heading = practiceArticle?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
      if (!heading) return;
      const offset = (readerToolbar?.getBoundingClientRect().bottom ?? 118) + 12;
      const top = Math.max(0, window.scrollY + heading.getBoundingClientRect().top - offset);
      window.scrollTo({ top, behavior: 'smooth' });
    });
  }

  const mantraOpening = $derived(
    article.id === 'tt_1781275267452' ? /^(?:đệ nhất(?: hội)?|first assembly(?: \(đệ nhất hội\))?|assembly (?:one|1))$/iu
      : article.id === 'tt_1781274943336' ? /^(?:thiên thủ thiên nhãn vô ngại đại bi tâm đà la ni|thousand hands and thousand eyes great compassion dhāraṇī)(?:\s|$)/iu
      : null,
  );

  function jumpWithinChapter(edge: 'top' | 'bottom'): void {
    if (autoScrollActive) onAutoScrollToggle();
    if (edge === 'top') window.scrollTo({ top: 0, behavior: 'instant' });
    else practiceArticle?.scrollIntoView({ block: 'end', behavior: 'instant' });
  }
  const orderedChapters = $derived(orderPracticeChapters(chapters, article.category));
  const chapterPosition = $derived(orderedChapters.findIndex(row => row.index === currentChapterIndex));

  function findMantraOpening(): HTMLElement | undefined {
    const pattern = mantraOpening;
    if (!pattern || !practiceArticle) return;
    return [...practiceArticle.querySelectorAll<HTMLElement>('.ttp-content :is(.tt-content__line, p, h2, h3, h4)')]
      .find(line => pattern.test((line.textContent ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim()));
  }

  async function countAndRestart(delta: number): Promise<void> {
    const nextCount = Math.max(0, practiceCount + delta);
    onCountChange(delta);
    if (delta === 1 && mantraGoal > 0 && nextCount === mantraGoal) {
      triggerHaptic('success');
      goalReachedToast = true;
      if (goalToastTimer !== undefined) clearTimeout(goalToastTimer);
      goalToastTimer = setTimeout(() => { goalReachedToast = false; }, 3500);
    }
    if (delta !== 1 || article.category !== 'TRÌ CHÚ' || !navigationReady) return;
    if (autoScrollActive) onAutoScrollToggle();

    const articleId = article.id;
    let opening = findMantraOpening();
    if (!opening) {
      const first = orderedChapters.find(chapter => mantraOpening?.test(chapter.title.trim()))
        ?? (mantraOpening ? orderedChapters.find(chapter => (chapter.sourceOrder ?? chapter.index) === 1) : undefined)
        ?? orderedChapters[0];
      if (first && first.index !== currentChapterIndex) {
        await onChapterSelect?.(first.index);
        await tick();
        if (article.id !== articleId || !practiceArticle?.isConnected || currentChapterIndex !== first.index) return;
        opening = findMantraOpening();
      }
    }

    const top = opening
      ? window.scrollY + opening.getBoundingClientRect().top - (readerToolbar?.getBoundingClientRect().bottom ?? 0)
      : 0;
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
  }

  async function selectChapter(index: number): Promise<void> {
    if (!navigationReady) return;
    tocOpen = false;
    await tick();
    if (index !== currentChapterIndex) await onChapterSelect?.(index);
    await tick();
    if (tocTrigger?.isConnected) tocTrigger.focus({ preventScroll: true });
  }

  const backgrounds = $derived([
    { label: toolbarT.bgAuto, value: 'auto', color: 'var(--bg)' },
    { label: toolbarT.bgWhite, value: 'white', color: 'var(--reading-paper-white)' },
    { label: toolbarT.bgCream, value: 'cream', color: 'var(--reading-paper-cream)' },
    { label: toolbarT.bgGray, value: 'gray', color: 'var(--reading-paper-gray)' },
    { label: toolbarT.bgDark, value: 'dark', color: 'var(--reading-paper-dark)' },
    { label: toolbarT.bgPurple, value: 'purple', color: 'var(--reading-paper-purple)' }
  ] as const);
</script>

<section use:nativeSystemBarsSurface class="tt-practice practice-theme" data-practice={article.category} data-bg={resolvedPracticeBackground} aria-label={t.title}>
  <header class="ttp-header">
    <button class="ttp-back" type="button" aria-label={t.confirmExitPracticeBtn} title={t.confirmExitPracticeBtn} onclick={onExit}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" /></svg></button>
    {#if routineContext}
      <div class="ttp-routine-title">
        <span class="ttp-routine-context">{routineContext}</span>
        <strong class="ttp-header-title">{article.title}</strong>
      </div>
    {:else}
      <strong class="ttp-header-title">{article.title}</strong>
    {/if}
    <span class="ttp-header-badge" class:ttp-header-badge--done={goalReached} aria-live="polite">
      {#if mantraGoal > 0}
        {goalReached ? '✓ ' : ''}{practiceCount}/{mantraGoal} {localeStore.current === 'en' ? 'reps' : 'biến'}
      {:else}
        {practiceCount > 0 ? t.chantedCountBadge.replace('{count}', String(practiceCount)) : t.practiceSessionBadge}
      {/if}
    </span>
  </header>

  <div bind:this={readerToolbar} class="tt-practice__toolbar ttp-reader-bar" role="toolbar" aria-label={t.practiceToolbarAria}>
    {#if hasToc}
      <button bind:this={tocTrigger} class="ttp-rbar-btn ttp-toc-trigger" type="button" aria-haspopup="dialog" aria-expanded={tocOpen} disabled={chapters.length > 0 && !navigationReady} onclick={() => tocOpen = true}><List size={16} strokeWidth={2.1} aria-hidden="true" /><span>{t.tocHeader}</span></button>
    {/if}
    <button class:active={autoScrollActive} class="ttp-rbar-btn ttp-auto-scroll" type="button" aria-pressed={autoScrollActive} title={t.scrollLabel} onclick={onAutoScrollToggle}>
      {autoScrollActive ? t.scrollStop : t.scrollPlay}
    </button>
    <button class:active={modelChantActive} class="ttp-rbar-btn" type="button" aria-pressed={modelChantActive} onclick={onModelChantToggle}>
      {modelChantActive ? t.modelChantStop : t.modelChantPlay}
    </button>
    <button bind:this={settingsTrigger} class="ttp-rbar-btn ttp-settings-trigger" type="button" aria-haspopup="dialog" aria-expanded={settingsOpen} onclick={() => settingsOpen = true}>
      <SlidersHorizontal size={16} strokeWidth={2.1} aria-hidden="true" /><span>{localeStore.current === 'en' ? 'Display' : 'Tùy chỉnh'}</span>
    </button>
    <div class="ttp-desktop-controls">
      <span class="ttp-rbar-sep" aria-hidden="true"></span>
      <span class="ttp-rbar-label">{localeStore.current === 'en' ? 'Font size' : 'Cỡ chữ'}</span>
      <button class="ttp-rbar-btn" type="button" aria-label="A−" onclick={() => onFontSizeChange(-1)}>A−</button>
      <span class="ttp-rbar-fs">{fontSize}px</span>
      <button class="ttp-rbar-btn" type="button" aria-label="A+" onclick={() => onFontSizeChange(1)}>A+</button>
      <span class="ttp-rbar-sep" aria-hidden="true"></span>
      <button class:active={practiceBold} class="ttp-bold-btn" type="button" aria-label="Bold" aria-pressed={practiceBold} title="Bold" onclick={onToggleBold}><b>B</b></button>
      <span class="ttp-rbar-sep" aria-hidden="true"></span>
      <span class="ttp-rbar-label">{t.bgLabel}</span>
      {#each backgrounds as background}
        <button
          class:active={(themeStore?.mode === 'auto' ? 'auto' : resolvedPracticeBackground) === background.value}
          class="ttp-bg-swatch"
          type="button"
          aria-label={background.label}
          aria-pressed={(themeStore?.mode === 'auto' ? 'auto' : resolvedPracticeBackground) === background.value}
          title={background.label}
          style:--swatch-color={background.color}
          onclick={() => {
            if (background.value === 'auto') { if (themeStore) { themeStore.apply('auto'); onBackgroundChange(themeStore.paper); } return; }
            if (background.value === 'dark') themeStore?.apply('dark');
            else if (background.value === 'white' || background.value === 'cream' || background.value === 'gray' || background.value === 'purple') themeStore?.apply('light', background.value);
            onBackgroundChange(background.value);
          }}
        >{#if background.value === 'auto'}<span class="ttp-auto-paper" aria-hidden="true">A</span>{/if}</button>
      {/each}
      <span class="ttp-rbar-sep" aria-hidden="true"></span>
      <select
        aria-label={t.scrollLabel}
        value={String(autoScrollSpeed)}
        onchange={(event) => onAutoScrollSpeedChange(Number((event.currentTarget as HTMLSelectElement).value) as PracticeAutoScrollSpeed)}
      >
        <option value="0.25">{t.speedVerySlow}</option>
        <option value="0.5">{t.speedSlow}</option>
        <option value="1">{t.speedNormal}</option>
        <option value="2">{t.speedFast}</option>
      </select>
      <span class="ttp-rbar-sep" aria-hidden="true"></span>
      <select
        aria-label={localeStore.current === 'en' ? 'Target repetitions' : 'Số biến mục tiêu'}
        value={String(mantraGoal)}
        onchange={(event) => { mantraGoal = Number((event.currentTarget as HTMLSelectElement).value); }}
      >
        {#each MANTRA_GOALS as goal (goal)}
          <option value={String(goal)}>{goal === 0 ? (localeStore.current === 'en' ? 'Free reps' : 'Tự do') : `${goal} ${localeStore.current === 'en' ? 'reps' : 'biến'}`}</option>
        {/each}
      </select>
    </div>
  </div>

  {#if goalReachedToast}
    <div class="ttp-goal-toast" role="status" aria-live="polite">
      🪷 {localeStore.current === 'en' ? `Completed ${mantraGoal} repetitions!` : `Hoàn mãn ${mantraGoal} biến hành trì!`}
    </div>
  {/if}

  <main class="ttp-body">
    <div class="ttp-candle-glow" aria-hidden="true"></div>
    <article class="ttp-scroll-area" bind:this={practiceArticle}>
      <h1 class="ttp-art-title">{practiceTitle}</h1>
      <div class="ttp-divider" aria-hidden="true"><span>☸</span></div>
      <div class:ttp-read-bold={practiceBold} class="ttp-content" style={`font-size:${fontSize}px`} use:savedContentImages>
        {@html preparedRitual.html}
      </div>

      {#if showChapterNavigation}
        <nav class="ttp-chapter-nav" aria-label="Chapter navigation">
          <button type="button" onclick={onPreviousChapter} disabled={!navigationReady || (chapters.length ? chapterPosition <= 0 : currentChapterIndex <= 0)}>{t.prevChapter}</button>
          <span>{(chapters.length ? chapterPosition : currentChapterIndex) + 1} / {totalChapters}</span>
          <button type="button" onclick={onNextChapter} disabled={!navigationReady || (chapters.length ? chapterPosition >= chapters.length - 1 : currentChapterIndex >= totalChapters - 1)}>{t.nextChapter}</button>
        </nav>
      {/if}
    </article>
  </main>

  <PracticeFloatingControls
    {fabPosition}
    {meditationMusicActive}
    {selectedMeditationTrack}
    {moActive}
    {panelOpen}
    jumpReady={navigationReady}
    {practiceCount}
    onCountChange={countAndRestart}
    {onFabPositionSave}
    {onPanelToggle}
    {onExit}
    onJump={jumpWithinChapter}
    {onSelectMeditationTrack}
    {onStopMeditationMusic}
    {onToggleMo}
  />
</section>

{#if tocOpen}
  <dialog class="ttp-toc-dialog" use:modalDialog aria-labelledby="practice-toc-heading" tabindex="-1" oncancel={(event) => { event.preventDefault(); tocOpen = false; }}>
    <header class="ttp-toc-heading"><h2 id="practice-toc-heading">{t.tocHeader}</h2><button type="button" data-modal-focus aria-label={localeStore.current === 'en' ? 'Close' : 'Đóng'} onclick={() => tocOpen = false}>✕</button></header>
    <nav aria-label={t.tocHeader}>
      {#if orderedChapters.length > 0}
        {#each orderedChapters as chapter, position (chapter.index)}
          <button type="button" class:current={chapter.index === currentChapterIndex} aria-current={chapter.index === currentChapterIndex ? 'true' : undefined} disabled={!navigationReady} onclick={() => selectChapter(chapter.index)}>
            <span>{position + 1}. {localizeChapterTitle(chapter.title, localeStore.current)}</span>
            {#if chapter.index === currentChapterIndex}<small>✓ {localeStore.current === 'en' ? 'Current chapter' : 'Đang tụng'}</small>{/if}
          </button>
        {/each}
      {:else}
        {#each autoHeadings as heading, position (heading.id)}
          <button type="button" class:sub={heading.level === 3} onclick={() => jumpToHeading(heading.id)}>
            <span>{position + 1}. {heading.title}</span>
          </button>
        {/each}
      {/if}
    </nav>
  </dialog>
{/if}

{#if settingsOpen}
  <RosarySelect
    anchor={settingsTrigger ?? undefined}
    bind:open={settingsOpen}
    label={localeStore.current === 'en' ? 'Display & Practice Settings' : 'Tùy chỉnh hiển thị & hành trì'}
    accessibleLabel={localeStore.current === 'en' ? 'Display settings' : 'Tùy chỉnh hiển thị'}
    value=""
    options={[]}
    onChange={() => {}}
  >
    <div class="ttp-sheet-settings">
      <div class="ttp-sheet-row">
        <span class="ttp-sheet-label">{localeStore.current === 'en' ? 'Target repetitions' : 'Số biến mục tiêu'}</span>
        <div class="ttp-sheet-controls">
          <select
            class="ttp-sheet-select"
            aria-label={localeStore.current === 'en' ? 'Target repetitions' : 'Số biến mục tiêu'}
            value={String(mantraGoal)}
            onchange={(event) => { mantraGoal = Number((event.currentTarget as HTMLSelectElement).value); }}
          >
            {#each MANTRA_GOALS as goal (goal)}
              <option value={String(goal)}>{goal === 0 ? (localeStore.current === 'en' ? 'Free' : 'Tự do') : `${goal} ${localeStore.current === 'en' ? 'reps' : 'biến'}`}</option>
            {/each}
          </select>
        </div>
      </div>

      <div class="ttp-sheet-row">
        <span class="ttp-sheet-label">{localeStore.current === 'en' ? 'Font size' : 'Cỡ chữ'}</span>
        <div class="ttp-sheet-controls">
          <button class="ttp-rbar-btn" type="button" aria-label="A−" onclick={() => onFontSizeChange(-1)}>A−</button>
          <span class="ttp-rbar-fs">{fontSize}px</span>
          <button class="ttp-rbar-btn" type="button" aria-label="A+" onclick={() => onFontSizeChange(1)}>A+</button>
          <button class:active={practiceBold} class="ttp-bold-btn" type="button" aria-label="Bold" aria-pressed={practiceBold} onclick={onToggleBold}><b>B</b></button>
        </div>
      </div>

      <div class="ttp-sheet-row">
        <span class="ttp-sheet-label">{t.bgLabel}</span>
        <div class="ttp-sheet-controls">
          {#each backgrounds as background (background.value)}
            <button
              class:active={(themeStore?.mode === 'auto' ? 'auto' : resolvedPracticeBackground) === background.value}
              class="ttp-bg-swatch"
              type="button"
              aria-label={background.label}
              aria-pressed={(themeStore?.mode === 'auto' ? 'auto' : resolvedPracticeBackground) === background.value}
              style:--swatch-color={background.color}
              onclick={() => {
                if (background.value === 'auto') { if (themeStore) { themeStore.apply('auto'); onBackgroundChange(themeStore.paper); } return; }
                if (background.value === 'dark') themeStore?.apply('dark');
                else if (background.value === 'white' || background.value === 'cream' || background.value === 'gray' || background.value === 'purple') themeStore?.apply('light', background.value);
                onBackgroundChange(background.value);
              }}
            >{#if background.value === 'auto'}<span class="ttp-auto-paper" aria-hidden="true">A</span>{/if}</button>
          {/each}
        </div>
      </div>

      <div class="ttp-sheet-row">
        <span class="ttp-sheet-label">{t.scrollLabel}</span>
        <div class="ttp-sheet-controls">
          <select
            class="ttp-sheet-select"
            aria-label={t.scrollLabel}
            value={String(autoScrollSpeed)}
            onchange={(event) => onAutoScrollSpeedChange(Number((event.currentTarget as HTMLSelectElement).value) as PracticeAutoScrollSpeed)}
          >
            <option value="0.25">{t.speedVerySlow}</option>
            <option value="0.5">{t.speedSlow}</option>
            <option value="1">{t.speedNormal}</option>
            <option value="2">{t.speedFast}</option>
          </select>
        </div>
      </div>
    </div>
  </RosarySelect>
{/if}

<style>
  .ttp-toc-trigger{background:var(--gold-light);color:var(--brown);border-radius:var(--radius-control)}
  .ttp-toc-dialog{box-sizing:border-box;position:fixed;inset:auto 0 0;margin:0 auto;width:min(100%,560px);max-width:100%;max-height:80vh;max-height:80dvh;padding:var(--space-page);padding-bottom:calc(var(--space-page) + env(safe-area-inset-bottom));border:1px solid var(--border);border-radius:var(--radius-card) var(--radius-card) 0 0;background:var(--card);color:var(--text);font-family:var(--font-app);box-shadow:var(--shadow);overflow:auto}
  .ttp-toc-dialog::backdrop{background:var(--practice-dialog-backdrop)}
  .ttp-toc-heading{display:flex;align-items:center;justify-content:space-between;gap:var(--space-page);position:sticky;top:calc(-1 * var(--space-page));background:var(--card)}
  .ttp-toc-heading h2{font-size:var(--font-size-section-title)}
  .ttp-toc-dialog button{min-width:44px;min-height:44px;padding:calc(var(--space-page)/2);border:1px solid var(--border);border-radius:var(--radius-control);background:var(--bg);color:var(--text);font:inherit;cursor:pointer}
  .ttp-toc-dialog nav{display:grid;gap:calc(var(--space-page)/2)}
  .ttp-toc-dialog nav button{text-align:left;overflow-wrap:anywhere}
  .ttp-toc-dialog nav button > span{font-weight:700}
  .ttp-toc-dialog nav button.current{background:var(--gold-light);border-color:var(--gold)}
  .ttp-toc-dialog small{display:block;color:var(--text2);margin-top:calc(var(--space-page)/4)}
  .ttp-toc-dialog button:disabled{opacity:.6;cursor:wait}
  .tt-practice{position:relative;z-index:640;width:100%;min-height:100vh;background:var(--reading-paper-cream);color:var(--reading-paper-cream-ink);font-family:var(--font-app)}
  .ttp-header{position:fixed;z-index:650;top:0;right:0;left:0;display:flex;height:58px;align-items:center;gap:12px;padding:0 16px;border-bottom:1.5px solid var(--border2);background:var(--bg);box-shadow:var(--shadow);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
  .ttp-back{flex-shrink:0;padding:4px 8px;border:0;border-radius:6px;background:none;color:var(--gold);cursor:pointer;font:400 22px/1 var(--font-app);transition:background .15s}.ttp-back:hover{background:var(--gold-light)}
  .ttp-header-title{overflow:hidden;flex:1;color:var(--text2);font-size:var(--font-size-label);font-weight:700;line-height:1.25;text-align:center;text-transform:uppercase;display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical}.ttp-header-badge{flex-shrink:0;padding:4px 10px;border:1px solid var(--gold-muted);border-radius:999px;background:var(--gold-light);color:var(--gold);font-size:var(--font-size-meta);font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}.ttp-header-badge--done{border-color:var(--gold);background:var(--gold);color:var(--on-gold)}
  .ttp-routine-title{display:grid;min-width:0;flex:1;text-align:center;color:var(--text2)}
  .ttp-routine-context{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--font-size-meta)}
  .ttp-reader-bar{position:fixed;z-index:645;top:58px;right:0;left:0;display:flex;overflow-x:auto;align-items:center;gap:8px;padding:7px 16px;border-bottom:1px solid var(--border2);background:var(--bg2);scrollbar-width:none;transition:transform .22s ease,opacity .22s ease}.ttp-reader-bar::-webkit-scrollbar{display:none}
  .ttp-desktop-controls{display:inline-flex;align-items:center;gap:8px;flex-shrink:0}
  .ttp-settings-trigger{display:none}
  .ttp-header{transition:transform .22s ease,opacity .22s ease}
  .ttp-goal-toast{position:fixed;z-index:680;top:calc(126px + var(--app-safe-top,env(safe-area-inset-top,0px)));left:50%;transform:translateX(-50%);padding:8px 16px;border:1px solid var(--gold);border-radius:999px;background:var(--card);color:var(--brown);font-size:var(--font-size-label);font-weight:700;box-shadow:var(--shadow-lg);white-space:nowrap}
  .ttp-rbar-label{flex-shrink:0;color:var(--muted);font-size:var(--font-size-meta);white-space:nowrap}.ttp-rbar-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;flex-shrink:0;padding:0 12px;border:1.5px solid var(--border);border-radius:var(--radius-control);background:var(--bg2);color:var(--text2);cursor:pointer;font:600 var(--font-size-label)/1 var(--font-app);white-space:nowrap;transition:border-color .15s,color .15s,background .15s}.ttp-rbar-btn:hover,.ttp-rbar-btn.active{border-color:var(--gold);background:var(--gold-light);color:var(--brown)}
  .ttp-rbar-sep{width:1px;height:18px;flex-shrink:0;background:var(--border2)}.ttp-rbar-fs{min-width:42px;color:var(--text2);font-size:var(--font-size-label);font-weight:700;text-align:center;font-variant-numeric:tabular-nums}
  .ttp-bold-btn{display:inline-flex;width:44px;height:44px;flex-shrink:0;align-items:center;justify-content:center;padding:0;border:1.5px solid var(--border);border-radius:var(--radius-control);background:var(--bg2);color:var(--text2);cursor:pointer;font:800 var(--font-size-card-title)/1 var(--font-app);transition:background .15s,border-color .15s,color .15s}.ttp-bold-btn:hover{border-color:var(--gold);color:var(--gold)}.ttp-bold-btn.active{border-color:var(--gold);background:var(--gold);color:var(--on-gold)}
  .ttp-bg-swatch{display:grid;place-items:center;width:44px;height:44px;flex-shrink:0;padding:0;border:0;border-radius:50%;background:transparent;cursor:pointer}.ttp-bg-swatch::before{content:'';box-sizing:border-box;width:24px;height:24px;border:2px solid transparent;border-radius:50%;background:var(--swatch-color);box-shadow:inset 0 0 0 1px rgba(80,65,48,.14);transition:border-color .15s,transform .18s}.ttp-bg-swatch:hover::before{transform:scale(1.08)}.ttp-bg-swatch.active::before{border-color:var(--gold)}
  .ttp-reader-bar select,.ttp-sheet-select{height:44px;flex-shrink:0;padding:0 10px;border:1.5px solid var(--border);border-radius:var(--radius-control);outline:none;background:var(--card);color:var(--text);cursor:pointer;font:600 var(--font-size-label)/1 var(--font-app)}.ttp-reader-bar select:focus-visible,.ttp-sheet-select:focus-visible{border-color:var(--gold);box-shadow:0 0 0 2px color-mix(in srgb,var(--gold) 24%,transparent)}
  .ttp-body{position:relative;min-height:100vh;padding-top:118px;background:var(--reading-paper-cream);transition:background-color .25s ease,color .25s ease}.ttp-body::before{position:fixed;z-index:0;inset:0;background-image:repeating-linear-gradient(0deg,transparent,transparent 28px,rgba(139,99,64,.04) 28px,rgba(139,99,64,.04) 29px);pointer-events:none;content:''}.ttp-candle-glow{position:fixed;z-index:0;inset:0;background:radial-gradient(ellipse 60% 40% at 50% 20%,color-mix(in srgb,var(--gold) 8%,transparent) 0%,transparent 70%);pointer-events:none}
  .ttp-scroll-area{position:relative;z-index:1;max-width:680px;margin:0 auto;padding:32px 24px calc(180px + env(safe-area-inset-bottom,0px))}.ttp-art-title{margin:0 0 8px;color:var(--brown);font:700 clamp(17px,3.5vw,22px)/1.35 var(--font-app);letter-spacing:.5px;text-align:center;text-transform:uppercase}.ttp-divider{display:flex;max-width:300px;align-items:center;gap:12px;margin:0 auto 28px}.ttp-divider::before,.ttp-divider::after{height:1px;flex:1;background:linear-gradient(to right,transparent,color-mix(in srgb,var(--gold) 40%,transparent),transparent);content:''}.ttp-divider span{font-size:16px}
  .ttp-content{color:var(--reading-paper-cream-ink);font-family:var(--font-reader);line-height:2.1;letter-spacing:.3px;text-align:center;white-space:pre-line}.ttp-content.ttp-read-bold,.ttp-content.ttp-read-bold :global(*){font-weight:700!important}.ttp-content :global(.tt-content__line){display:block;margin-bottom:.15em;text-align:justify;text-align-last:left}.ttp-content :global(.tt-content__line--center){text-align:center;text-align-last:center}.ttp-content :global(.tt-content__line--right){text-align:right;text-align-last:right}.ttp-content :global(.tt-content__gap){height:.38em!important}.ttp-content :global(p){margin:0 0 .38em!important;white-space:normal}.ttp-content :global(p:empty){display:none!important}.ttp-content :global(h1),.ttp-content :global(h2),.ttp-content :global(h3){margin:1.35em 0 .45em!important;color:var(--brown);font-size:clamp(16px,3vw,20px);text-align:center}.ttp-content :global(h2){padding-top:.8em;border-top:1px solid color-mix(in srgb,var(--gold) 24%,transparent)}.ttp-content :global(h2:first-child){padding-top:0;border-top:0}.ttp-content :global(strong){color:inherit}.ttp-content :global(em){color:inherit}.ttp-content :global(.tt-content__paren){opacity:.78;font-style:italic}.ttp-content :global(img){max-width:100%;height:auto;margin:1em 0;border-radius:8px}.ttp-content :global(blockquote){max-width:500px;margin:1em auto;padding:10px 16px;border-left:3px solid var(--gold);border-radius:0 8px 8px 0;background:var(--gold-light);color:var(--brown);font-style:italic;text-align:left}
  .ttp-toc-dialog nav button.sub{padding-inline-start:calc(var(--space-page) * 1.4);font-weight:500}
  .ttp-sheet-settings{display:grid;gap:14px;padding:8px 6px 14px}
  .ttp-sheet-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding-bottom:10px;border-bottom:1px solid var(--border2)}
  .ttp-sheet-row:last-child{border-bottom:0;padding-bottom:0}
  .ttp-sheet-label{font-size:var(--font-size-label);font-weight:700;color:var(--text)}
  .ttp-sheet-controls{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
  .ttp-chapter-nav{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:40px;padding:20px 0 10px;border-top:1px solid color-mix(in srgb,var(--gold) 15%,transparent)}.ttp-chapter-nav button{display:flex;align-items:center;gap:6px;padding:9px 18px;border:1.5px solid color-mix(in srgb,var(--gold) 50%,transparent);border-radius:20px;background:color-mix(in srgb,var(--gold) 15%,transparent);color:var(--gold);cursor:pointer;font:600 13px/1 var(--font-app);transition:.15s}.ttp-chapter-nav button:disabled{border-color:color-mix(in srgb,var(--gold) 20%,transparent);background:color-mix(in srgb,var(--gold) 5%,transparent);color:color-mix(in srgb,var(--gold) 30%,transparent);cursor:default}.ttp-chapter-nav span{color:rgba(107,76,42,.6);font-size:12px;white-space:nowrap}
  .tt-practice[data-bg='white'],.tt-practice[data-bg='white'] .ttp-body{background:var(--reading-paper-white)}.tt-practice[data-bg='white'] .ttp-content{color:var(--reading-paper-white-ink)}.tt-practice[data-bg='cream'],.tt-practice[data-bg='cream'] .ttp-body{background:var(--reading-paper-cream)}.tt-practice[data-bg='cream'] .ttp-content{color:var(--reading-paper-cream-ink)}.tt-practice[data-bg='gray'],.tt-practice[data-bg='gray'] .ttp-body{background:var(--reading-paper-gray)}.tt-practice[data-bg='gray'] .ttp-content{color:var(--reading-paper-gray-ink)}.tt-practice[data-bg='gray'] .ttp-art-title{color:var(--reading-paper-gray-ink)}.tt-practice[data-bg='dark'],.tt-practice[data-bg='dark'] .ttp-body{background:var(--reading-paper-dark)}.tt-practice[data-bg='dark'] .ttp-content{color:var(--reading-paper-dark-ink)}.tt-practice[data-bg='dark'] .ttp-art-title{color:var(--reading-paper-dark-accent)}.tt-practice[data-bg='dark'] .ttp-chapter-nav span{color:color-mix(in srgb,var(--reading-paper-dark-ink) 50%,transparent)}
  .tt-practice[data-bg='dark'] .ttp-content :global(h1),.tt-practice[data-bg='dark'] .ttp-content :global(h2),.tt-practice[data-bg='dark'] .ttp-content :global(h3){color:var(--gold)}
  button:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 45%,transparent);outline-offset:2px}
  :global(body:has(.tt-practice) .qts-footer){display:none}
  .tt-practice,.ttp-back,.ttp-rbar-btn,.ttp-bold-btn,.ttp-reader-bar select,.ttp-art-title,.ttp-chapter-nav button{font-family:var(--font-app)}
  @media(max-width:700px){
    .ttp-desktop-controls{display:none}
    .ttp-settings-trigger{display:inline-flex;align-items:center;justify-content:center;gap:4px;margin-inline-start:auto}
    .ttp-reader-bar{justify-content:space-between;gap:6px;padding:7px 10px}
  }
  @media(max-width:600px){.ttp-header{padding:var(--app-safe-top,env(safe-area-inset-top,0px)) 8px 0}.ttp-header-title{font-size:13px}.ttp-header-badge{padding:3px 8px;font-size:11px}.ttp-scroll-area{padding:24px 18px calc(180px + env(safe-area-inset-bottom,0px))}.ttp-chapter-nav{gap:8px}.ttp-chapter-nav button{padding:8px 12px;font-size:var(--font-size-label)}}
  @media(prefers-reduced-motion:reduce){.ttp-header,.ttp-reader-bar,.ttp-rbar-btn,.ttp-bold-btn,.ttp-bg-swatch::before,.ttp-body,.ttp-chapter-nav button{transition:none}}
  .ttp-content :global(.tt-content__line--form){text-align:left;text-align-last:left;white-space:normal;overflow-wrap:anywhere;word-spacing:normal}
  .ttp-content :global(.tt-content__line--fill-in){text-align:left;text-align-last:left;white-space:normal}
  .ttp-content :global(.tt-content__blank){display:inline-block;max-width:min(6em,calc(100% - .4em));overflow:hidden;white-space:nowrap;vertical-align:bottom;margin-inline:.2em;letter-spacing:0}
  button{min-height:44px}
  select{min-height:44px}

  .ttp-header{height:auto;min-height:58px;padding:var(--app-safe-top,env(safe-area-inset-top,0px)) 16px 0}
  .ttp-reader-bar{top:calc(58px + var(--app-safe-top,env(safe-area-inset-top,0px)))}
  .ttp-body{padding-top:calc(118px + var(--app-safe-top,env(safe-area-inset-top,0px)))}
  .ttp-back{width:44px;height:44px;min-width:44px;min-height:44px}
  .ttp-rbar-btn,.ttp-bold-btn,.ttp-bg-swatch{min-width:44px;min-height:44px}

  /* Scope reading chrome to its paper, without changing the application theme. */
  .tt-practice[data-bg='white']{--practice-paper:var(--reading-paper-white);--practice-paper-ink:var(--reading-paper-white-ink);--practice-paper-border:var(--reading-paper-white-border)}
  .tt-practice[data-bg='cream']{--practice-paper:var(--reading-paper-cream);--practice-paper-ink:var(--reading-paper-cream-ink);--practice-paper-border:var(--reading-paper-cream-border)}
  .tt-practice[data-bg='gray']{--practice-paper:var(--reading-paper-gray);--practice-paper-ink:var(--reading-paper-gray-ink);--practice-paper-border:var(--reading-paper-gray-border)}
  .tt-practice[data-bg='dark']{--practice-paper:var(--reading-paper-dark);--practice-paper-ink:var(--reading-paper-dark-ink);--practice-paper-border:var(--reading-paper-dark-border);--gold:var(--reading-paper-dark-accent);--gold-light:var(--reading-paper-dark-accent-bg)}
  .tt-practice[data-bg]{--bg:var(--practice-paper);--bg2:var(--practice-paper);--card:var(--practice-paper);--text:var(--practice-paper-ink);--text2:var(--practice-paper-ink);--muted:var(--practice-paper-ink);--border:var(--practice-paper-border);--border2:var(--practice-paper-border)}
  .tt-practice:not([data-bg='dark']){--gold:var(--reading-paper-light-accent);--gold-light:var(--reading-paper-light-accent-bg)}
  .ttp-reader-bar select{background:var(--bg);color:var(--text)}
  .ttp-bold-btn.active{color:var(--reading-paper-white-ink)}
  .ttp-header-badge,.ttp-rbar-btn:hover,.ttp-rbar-btn.active{color:var(--text)}
  .ttp-header button:focus-visible,.ttp-reader-bar button:focus-visible{outline:2px solid var(--gold);outline-offset:2px}

  .tt-practice[data-bg='purple']{--practice-paper:var(--reading-paper-purple);--practice-paper-ink:var(--reading-paper-purple-ink);--practice-paper-border:var(--reading-paper-purple-border);background:var(--practice-paper)}
  .tt-practice[data-bg='purple'] .ttp-body{background:var(--practice-paper)}
  .tt-practice[data-bg='purple'] .ttp-content,.tt-practice[data-bg='purple'] .ttp-art-title{color:var(--practice-paper-ink)}

  .ttp-bg-swatch{position:relative}
  .ttp-bg-swatch::before{grid-area:1/1}
  .ttp-auto-paper{grid-area:1/1;z-index:1;color:var(--text);font-size:var(--font-size-label);font-weight:700}

  .tt-practice:is([data-bg='white'],[data-bg='gray'],[data-bg='purple']){
    --gold:var(--practice-paper-ink);
    --on-gold:var(--reading-paper-white);
    --gold-light:color-mix(in srgb,var(--practice-paper-ink) 5%,var(--practice-paper));
    --gold-muted:color-mix(in srgb,var(--practice-paper-ink) 10%,var(--practice-paper));
  }
  .tt-practice:is([data-bg='white'],[data-bg='gray'],[data-bg='purple']) .ttp-bold-btn.active{color:var(--reading-paper-white)}
  .tt-practice:is([data-bg='white'],[data-bg='gray'],[data-bg='purple']) .ttp-art-title,
  .tt-practice:is([data-bg='white'],[data-bg='gray'],[data-bg='purple']) .ttp-content :global(:is(h1,h2,h3)){color:var(--practice-paper-ink)}
  .tt-practice:is([data-bg='white'],[data-bg='gray'],[data-bg='purple']) .ttp-chapter-nav span{color:var(--muted)}
</style>
