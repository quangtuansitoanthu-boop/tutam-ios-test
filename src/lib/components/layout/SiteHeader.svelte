<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { createInterfaceTranslator } from '$lib/i18n/interface';
  import NotificationBell from '../notifications/NotificationBell.svelte';
  import AppArtwork from '$lib/components/icons/AppArtwork.svelte';
  type Theme = 'light' | 'dark';

  const localeStore = getLocaleContext();
  const localizeUi = createInterfaceTranslator();
  const t = $derived(localeStore.t);

  interface PracticeHeaderDetail {
    active: boolean;
    owner?: string;
    backLabel?: string;
    onBack?: () => void;
    title?: string;
    preserveTitleCase?: boolean;
  }

  interface Props {
    currentPath?: string;
    theme?: Theme;
    onThemeToggle?: () => void;
    session?: {
      authenticated: boolean;
      user: null | { displayName: string; role: 'user' | 'admin'; email?: string; avatarUrl?: string };
    };
  }

  interface SubpageHeaderDetail {
    active: boolean;
    onBack?: () => void;
    backLabel?: string;
  }

  let {
    currentPath = '/',
    theme = 'light',
    onThemeToggle = () => {},
    session = { authenticated: false, user: null }
  }: Props = $props();

  const isPractice = $derived(currentPath === '/tu-tap' || currentPath.startsWith('/tu-tap/'));
  const isTalks = $derived(currentPath === '/phap-thoai' || currentPath.startsWith('/phap-thoai/'));
  const isGuide = $derived(currentPath === '/huong-dan' || currentPath.startsWith('/huong-dan/'));
  const isPrivacy = $derived(currentPath === '/chinh-sach-bao-mat' || currentPath.startsWith('/chinh-sach-bao-mat/'));
  const isBooks = $derived(currentPath === '/kinh-sach' || currentPath.startsWith('/kinh-sach/'));
  const isPersonal = $derived(['/ca-nhan', '/tien-do-tu-tap', '/trich-dan-cua-toi'].some(
    (path) => currentPath === path || currentPath.startsWith(path + '/'),
  ));
  const isPersonalSubroute = $derived(['/tien-do-tu-tap', '/trich-dan-cua-toi'].some(
    (path) => currentPath === path || currentPath.startsWith(path + '/'),
  ));
  let practiceHeader = $state<PracticeHeaderDetail>({ active: false });
  let subpageHeader = $state<SubpageHeaderDetail>({ active: false });
  const isPracticeRoot = $derived(currentPath === '/tu-tap' || currentPath === '/tu-tap/');
  const showPracticeBack = $derived(practiceHeader.active || !isPracticeRoot);
  const showPracticeTopbar = $derived(false);
  const showHeaderBack = $derived(
    subpageHeader.active
    || (isPractice && showPracticeBack)
    || isGuide
    || isPrivacy
    || isPersonalSubroute
  );
  const hasCustomBack = $derived(
    Boolean((subpageHeader.active && subpageHeader.onBack) || (practiceHeader.active && practiceHeader.onBack))
  );
  let lastSubpagePath = '';
  $effect(() => {
    const path = currentPath;
    if (!isPractice && practiceHeader.active) {
      practiceHeader = { active: false };
    }
    if (lastSubpagePath && lastSubpagePath !== path && subpageHeader.active) {
      subpageHeader = { active: false };
    }
    lastSubpagePath = path;
  });

  function handleHeaderBack(): void {
    if (subpageHeader.active && subpageHeader.onBack) {
      subpageHeader.onBack();
      return;
    }
    if (practiceHeader.active && practiceHeader.onBack) {
      practiceHeader.onBack();
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else if (isPractice) {
      void goto('/tu-tap');
    } else if (isPersonalSubroute || isGuide || isPrivacy) {
      void goto('/ca-nhan');
    } else {
      void goto('/');
    }
  }

  function reservePracticeHeader(node: HTMLElement) {
    const shell = node.closest<HTMLElement>('.qts-shell');
    const update = () => shell?.style.setProperty('--practice-topbar-height', `${Math.ceil(node.getBoundingClientRect().height)}px`);
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(node);
    return { destroy() { observer?.disconnect(); shell?.style.removeProperty('--practice-topbar-height'); } };
  }

  function reserveSiteHeader(node: HTMLElement) {
    const shell = node.closest<HTMLElement>('.qts-shell');
    const update = () => shell?.style.setProperty('--site-header-height', `${Math.ceil(node.getBoundingClientRect().height)}px`);
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(node);
    return { destroy() { observer?.disconnect(); shell?.style.removeProperty('--site-header-height'); } };
  }

  onMount(() => {
    const updatePracticeHeader = (event: Event) => {
      const next = (event as CustomEvent<PracticeHeaderDetail>).detail;
      // Ignore stale deactivation from a previous owner after another view took header ownership.
      if (!next.active && next.owner && practiceHeader.active && practiceHeader.owner && practiceHeader.owner !== next.owner) {
        return;
      }
      practiceHeader = next;
    };
    const updateSubpageHeader = (event: Event) => {
      subpageHeader = (event as CustomEvent<SubpageHeaderDetail>).detail;
    };
    document.addEventListener('qts:practice-header', updatePracticeHeader);
    document.addEventListener('qts:subpage-header', updateSubpageHeader);
    return () => {
      document.removeEventListener('qts:practice-header', updatePracticeHeader);
      document.removeEventListener('qts:subpage-header', updateSubpageHeader);
    };
  });
</script>

{#if showPracticeTopbar}
  <header use:reservePracticeHeader class="tt-topbar qts-route-topbar" class:tt-topbar--root={!showPracticeBack}>
    {#if showPracticeBack}
      <button class="tt-back-btn" type="button" onclick={handleHeaderBack} aria-label={practiceHeader.active ? (practiceHeader.backLabel ?? t.header.back) : t.header.back}>
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
        <span class="tt-back-label">{practiceHeader.active ? (practiceHeader.backLabel ?? t.header.back) : t.header.back}</span>
      </button>
    {/if}
    <div class="tt-topbar-title" class:tt-topbar-title--root={!showPracticeBack}>{practiceHeader.active ? (practiceHeader.title ?? t.header.readArticle) : t.header.practiceMode}</div>
    <div class="tt-topbar-actions">
      <button class="tt-theme-btn" type="button" onclick={onThemeToggle} title={t.header.themeToggle} aria-label={t.header.themeToggle}>{theme === 'dark' ? '☀️' : '🌙'}</button>
      <NotificationBell {session} />
      <img src="/assets/branding/temple-icon-192.png" alt="logo" class="tt-topbar-logo" />
    </div>
  </header>
{:else}
  <nav use:reserveSiteHeader class="nav qts-nav" class:qts-nav--return={isTalks || isGuide || isPersonal} class:qts-nav--subpage={showHeaderBack} aria-label={t.header.appTitle}>
    <div class="nav-main-row" class:nav-main-row--subpage={showHeaderBack}>
      {#if showHeaderBack}
        <div class="nav-back-slot">
          <button
            class="nav-back-circle-btn"
            type="button"
            data-custom-back={hasCustomBack ? '1' : undefined}
            onclick={handleHeaderBack}
            aria-label={subpageHeader.active ? (subpageHeader.backLabel ?? t.header.back) : practiceHeader.active ? (practiceHeader.backLabel ?? t.header.back) : t.header.back}
            title={t.header.back}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
          </button>
        </div>
      {/if}
      <div class="nav-logo-wrap" class:nav-logo-wrap--centered={showHeaderBack}>
        <a class="nav-logo" href="/" aria-label={`${t.header.appTitle} — ${t.nav.home}`}>
          <img src="/assets/branding/temple-icon-192.png" alt="" width="34" height="34" />
          <span class="nav-logo-content">
            {#if isTalks}
              <span class="nl-name">{t.header.talksTitle}</span>
              <span class="nl-tagline">{t.header.talksTagline}</span>
            {:else}
              <span class="nl-name">
                <span class="nl-name__line nl-name__line--1">{t.header.appTitleLine1 ?? 'Tu Tập'}</span>{' '}
                <span class="nl-name__line nl-name__line--2">{t.header.appTitleLine2 ?? 'Phật Pháp'}</span>
              </span>
              <span class="nl-tagline">{t.header.appTagline}</span>
            {/if}
          </span>
        </a>
      </div>
      <div class="nav-r">
        <a href="/kinh-sach" class="btn btn-outline nav-desktop-only"><AppArtwork name="books" size={20} /> {t.nav.books}</a>
        <a href="/phap-thoai" class="btn btn-outline nav-desktop-only nav-talks"><AppArtwork name="talks" size={20} /> {t.header.dharmaTalksNav}</a>
        <a href="/huong-dan" class="btn btn-outline nav-desktop-only">{t.header.guideNav}</a>
        <a href="/tu-tap" class="btn btn-outline nav-desktop-only nav-practice"><AppArtwork name="practice" size={20} /> {t.header.practiceNav}</a>
        <button
          class="nav-theme-btn"
          type="button"
          aria-label={localizeUi(theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối')}
          title={t.header.themeToggle}
          onclick={onThemeToggle}
        >
          {#if theme === 'dark'}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          {:else}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          {/if}
        </button>
        <NotificationBell {session} />
      </div>
    </div>
  </nav>
{/if}

<style>
  .tt-topbar-actions { display:flex;align-items:center;gap:calc(var(--space-page)*.4);flex-shrink:0; }
  .tt-theme-btn { min-width:44px;min-height:44px; }
  .tt-topbar-title { min-width:0; }
  .tt-topbar-title--root { text-align:left;font-size:var(--font-size-section-title);font-weight:800;color:var(--brown);letter-spacing:-.2px;padding-inline-start:2px; }
  :global([data-theme='dark']) .tt-topbar-title--root { color:var(--gold2); }

  /* Header trang con 3 cột đối xứng: Trái (Quay lại) · Giữa (Logo + Tu Tập Phật Pháp) · Phải (Sáng/Tối + Chuông) */
  .nav-main-row--subpage {
    display: grid !important;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 8px;
    width: 100%;
  }
  .nav-back-slot {
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }
  .nav-back-circle-btn {
    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: linear-gradient(155deg, var(--card), var(--bg2));
    color: var(--text2);
    display: grid;
    place-items: center;
    cursor: pointer;
    box-shadow: inset 0 1.5px 0 color-mix(in srgb, var(--card) 88%, transparent), inset 0 -2px 0 rgba(60, 40, 10, 0.1), var(--shadow-sm);
    transition: transform 0.12s ease, border-color 0.15s ease, color 0.15s ease;
  }
  .nav-back-circle-btn:hover { border-color: var(--gold); color: var(--brown); }
  .nav-back-circle-btn:active { transform: translateY(1.5px) scale(0.96); }
  :global([data-theme='dark']) .nav-back-circle-btn { color: var(--text); border-color: var(--border); box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, 0.14), inset 0 -2px 0 rgba(0, 0, 0, 0.42), var(--shadow-sm); }
  .nav-logo-wrap--centered {
    display: flex;
    justify-content: center;
    align-items: center;
  }
  .nav-main-row--subpage .nav-r {
    justify-self: end;
  }
</style>

