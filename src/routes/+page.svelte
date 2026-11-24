<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { afterNavigate, goto, pushState, replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { Leaf } from '@lucide/svelte';
  import HomeGreetingHeader from '$lib/components/home/HomeGreetingHeader.svelte';
  import PhapBaoBanner from '$lib/components/phap-bao/PhapBaoBanner.svelte';
  import WeeklyLunarStrip from '$lib/components/home/WeeklyLunarStrip.svelte';
  import BuddhistDailyArtCard from '$lib/components/home/BuddhistDailyArtCard.svelte';
  import DailyDhammapadaCard from '$lib/components/home/DailyDhammapadaCard.svelte';
  import CorePracticePortals from '$lib/components/home/CorePracticePortals.svelte';
  import HomeDailyReminders from '$lib/components/home/HomeDailyReminders.svelte';
  import FixedPracticeGuideBanners from '$lib/components/guide/FixedPracticeGuideBanners.svelte';
  import ContentUpdateControl from '$lib/components/home/ContentUpdateControl.svelte';
  import RefugeReleaseBanner from '$lib/components/home/RefugeReleaseBanner.svelte';
  import { getVietnamNow } from '$lib/components/lunar/lunar-week';
  import { sameCalendarDay, watchCalendarDay } from '$lib/browser/calendar-day-rollover';
  import { CALENDAR_WIDGET_DATE_EVENT, parseCalendarWidgetDate } from '$lib/browser/calendar-widget-link';
  import type { LibraryArticle } from '$lib/components/library/article';
  import { fetchWithSessionRefresh, requireBrowserCsrf } from '$lib/browser/session-csrf';
  import { fetchHomepageWithOfflinePdfs, loadNativeBookCatalog } from '$lib/browser/offline-pdf-library';
  import { isNativeApp } from '$lib/browser/native-platform';
  import { invalidateArticleState, serverStateKeys } from '$lib/browser/server-state';
  import { getSessionContext, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { veganUi } from '$lib/i18n/vegan-ui';
  import { createSessionContentGuard } from '$lib/browser/session-content-guard';
  import type { PageSessionDTO } from '$lib/server/auth/types';
  import type { ReadingProgressRecord } from '$lib/browser/reading-activity-client';
  import {
    DEFAULT_SITE_NAME,
    DEFAULT_SITE_TITLE,
    DEFAULT_SITE_DESCRIPTION,
    ensureAbsoluteUrl,
    getImageMimeType,
    cleanMetaDescription,
  } from '$lib/domain/social-preview';
  import { matchesVietnameseSearch } from '$lib/utils/vietnamese-search';
  import { triggerHaptic } from '$lib/utils/haptics';
  import '$lib/styles/global.css';
  import '$lib/styles/library.css';

  const sessionStore = getSessionContext();
  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t);

  let activeDate = $state(untrack(() => parseCalendarWidgetDate(page.url.searchParams.get('calendarDate')) ?? getVietnamNow()));
  $effect(() => {
    const widgetDate = parseCalendarWidgetDate(page.url.searchParams.get('calendarDate'));
    if (widgetDate) activeDate = widgetDate;
  });
  let selectedArticle = $state<LibraryArticle | null>(null);
  let editingArticle = $state<LibraryArticle | null | 'new'>(null);
  let importJsonOpen = $state(false);
  let adminNotice = $state('');
  const initialParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialTargetId = initialParams?.get('article') || initialParams?.get('book') || initialParams?.get('id') || initialParams?.get('bai-viet') || initialParams?.get('bai_viet') || initialParams?.get('sach') || initialParams?.get('doc') || initialParams?.get('slug');
  let catalogEnabled = $state(Boolean(initialTargetId));

  const queryClient = useQueryClient();
  const effectiveRole = $derived(sessionStore.value.user?.role ?? 'guest');
  const effectivePrincipal = $derived(sessionStore.value.authenticated ? sessionStore.value.user?.id ?? null : null);
  const contentGuard = createSessionContentGuard(untrack(() => sessionStore.value));
  let previousHomepageRole = untrack(() => effectiveRole);
  let recoveredInitialReader = false;
  let singleArticleRequest = 0;

  const articlesQuery = createQuery(() => ({
    queryKey: serverStateKeys.articles.homepageForPrincipal(effectiveRole, effectivePrincipal),
    queryFn: ({ signal }) => isNativeApp()
      ? loadNativeBookCatalog(effectiveRole, effectivePrincipal, signal)
      : fetchHomepageWithOfflinePdfs(fetch, effectiveRole, effectivePrincipal, signal),
    networkMode: 'always',
    refetchOnReconnect: 'always',
    enabled: isNativeApp() || catalogEnabled,
  }));
  const articles = $derived(articlesQuery.data?.articles ?? []);

  async function fetchSingleArticle(id: string): Promise<LibraryArticle | null> {
    try {
      const response = await fetchWithSessionRefresh(`/api/data/baiviet?id=eq.${encodeURIComponent(id)}&select=*`);
      if (!response.ok) return null;
      const rows = await response.json() as Array<Record<string, unknown>>;
      if (!rows.length) return null;
      const row = rows[0];
      return {
        id: String(row.id ?? id),
        title: String(row.tieu_de ?? ''),
        summary: String(row.tom_tat ?? ''),
        content: String(row.noi_dung ?? ''),
        category: String(row.danh_muc ?? '').trim().toUpperCase() as any,
        tags: String(row.tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
        author: String(row.tac_gia ?? 'Quang Từ'),
        imageUrl: String(row.anh_url ?? ''),
        featured: Number(row.noi_bat ?? 0) > 0,
        publishedAt: String(row.ngay_dang ?? ''),
        hasTableOfContents: Boolean(row.has_muc_luc),
        volumeCount: Number(row.so_tap ?? 0),
        status: String(row.trang_thai ?? ''),
        pdfUrl: String(row.pdf_url ?? ''),
        externalUrl: String(row.link_ngoai ?? ''),
        viewCount: 0
      };
    } catch {
      return null;
    }
  }

  function loadSingleArticle(id: string, pushHistory = true): void {
    const request = ++singleArticleRequest;
    const token = contentGuard.capture();
    void fetchSingleArticle(id).then((article) => {
      if (request !== singleArticleRequest || !contentGuard.isCurrent(token)) return;
      if (article) openArticle(article, undefined, pushHistory);
    });
  }

  let initialReaderProgress = $state<ReadingProgressRecord | null>(null);
  let pushedArticleHistory = false;

  function updateArticleHistory(url: string, articleId: string | null, push = false): void {
    const previousHistory = window.history.state;
    const state = { ...page.state, articleId };
    if (push) pushState(url, state);
    else replaceState(url, state);
    // Keep legacy reader metadata alongside Kit's own history fields.
    window.history.replaceState({ ...previousHistory, ...window.history.state, articleId }, '', url);
  }

  function openArticle(article: LibraryArticle, progress?: ReadingProgressRecord, pushHistory = true): void {
    singleArticleRequest += 1;
    catalogEnabled = true;
    triggerHaptic('light');
    adminNotice = '';
    initialReaderProgress = progress ?? null;
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (progress || url.searchParams.get('article') !== article.id) url.searchParams.delete('annotation');
      url.searchParams.set('article', article.id);
      if (pushHistory) {
        pushedArticleHistory = true;
        updateArticleHistory(url.toString(), article.id, true);
      } else {
        updateArticleHistory(url.toString(), article.id);
      }
    }
    selectedArticle = article;
  }

  function closeArticle(isFromPopState = false): void {
    singleArticleRequest += 1;
    triggerHaptic('selection');
    selectedArticle = null;
    initialReaderProgress = null;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('quangtu:reading-progress-updated'));
      const url = new URL(window.location.href);
      url.searchParams.delete('article');
      url.searchParams.delete('annotation');
      url.searchParams.delete('book');
      url.searchParams.delete('id');
      url.searchParams.delete('bai-viet');
      url.searchParams.delete('bai_viet');
      url.searchParams.delete('sach');
      url.searchParams.delete('doc');
      url.searchParams.delete('slug');
      url.searchParams.delete('chap');
      const nextUrl = url.pathname + (url.search ? url.search : '');
      if (!isFromPopState && pushedArticleHistory) {
        pushedArticleHistory = false;
        window.history.back();
      } else {
        pushedArticleHistory = false;
        updateArticleHistory(nextUrl, null);
      }
    }
  }

  let checkedInitialUrl = $state(false);
  $effect(() => {
    if (checkedInitialUrl || (!articles.length && articlesQuery.isPending)) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const targetId = params.get('article') || params.get('book') || params.get('id') || params.get('bai-viet') || params.get('bai_viet') || params.get('sach') || params.get('doc') || params.get('slug');
    if (targetId) {
      checkedInitialUrl = true;
      const normalizedTarget = targetId.toLowerCase().trim();
      const found = articles.find((a) =>
        a.id === targetId ||
        a.id.toLowerCase() === normalizedTarget ||
        a.id.replace(/^book_/u, '').toLowerCase() === normalizedTarget ||
        a.title.toLowerCase().includes(normalizedTarget) ||
        matchesVietnameseSearch(a.title, normalizedTarget)
      );
      if (found) {
        openArticle(found, undefined, false);
      } else {
        loadSingleArticle(targetId, false);
      }
    }
  });

  afterNavigate(({ from, to, type }) => {
    // Popstate đã thuộc owner Back/Forward bên dưới và ReaderBoundary.
    const fromUrl = from?.url;
    const toUrl = to?.url;
    // Initial mobile CSR navigation can have a target object with a null URL.
    if (!fromUrl || !toUrl || type === 'popstate' || fromUrl.pathname !== toUrl.pathname || fromUrl.search === toUrl.search) return;
    const search = toUrl.search;
    untrack(() => {
      const params = new URLSearchParams(search);
      const targetId = ['article', 'book', 'id', 'bai-viet', 'bai_viet', 'sach', 'doc', 'slug']
        .map(key => params.get(key)).find(Boolean);
      // Goto cùng route không mount lại trang; ý định mới phải vô hiệu kết quả cũ.
      checkedInitialUrl = true;
      singleArticleRequest += 1;
      if (!targetId) {
        if (selectedArticle) closeArticle(true);
        return;
      }
      catalogEnabled = true;
      if (selectedArticle?.id === targetId) {
        return;
      }
      const normalizedTarget = targetId.toLowerCase().trim();
      const found = articles.find(article => article.id.toLowerCase() === normalizedTarget
        || article.id.replace(/^book_/u, '').toLowerCase() === normalizedTarget
        || article.title.toLowerCase().includes(normalizedTarget)
        || matchesVietnameseSearch(article.title, normalizedTarget));
      if (found) openArticle(found, undefined, false);
      else loadSingleArticle(targetId, false);
    });
  });

  onMount(() => {
    const stopCalendarRollover = watchCalendarDay((today, yesterday) => {
      if (sameCalendarDay(activeDate, yesterday)) activeDate = today;
    });
    const selectWidgetDate = (event: Event) => {
      const value = (event as CustomEvent<{ date?: unknown }>).detail?.date;
      const date = typeof value === 'string' ? parseCalendarWidgetDate(value) : null;
      if (date) activeDate = date;
    };
    if (initialTargetId) catalogEnabled = true;
    const openEditor = (event: Event) => {
      const detail = (event as CustomEvent<{ mode?: string }>).detail;
      if (detail?.mode === 'create' && effectiveRole === 'admin') editingArticle = 'new';
    };
    const openImportJson = () => {
      if (effectiveRole === 'admin') importJsonOpen = true;
    };
    const applyHomepageSession = (event: Event) => {
      const next = (event as CustomEvent<PageSessionDTO>).detail;
      const nextRole = next.user?.role ?? 'guest';
      const staleRole = previousHomepageRole;
      previousHomepageRole = nextRole;
      if (!contentGuard.transition(next)) return;
      singleArticleRequest += 1;
      void queryClient.cancelQueries({ queryKey: serverStateKeys.articles.homepage(staleRole) });
      queryClient.removeQueries({ queryKey: serverStateKeys.articles.homepage(staleRole) });
      editingArticle = null;
      importJsonOpen = false;
      adminNotice = '';
      // The first session refresh may arrive after opening a deep link as a guest.
      // Discard the old content, then resolve the same link under the new principal.
      const currentUrl = new URL(window.location.href);
      const currentTarget = ['article', 'book', 'id', 'bai-viet', 'bai_viet', 'sach', 'doc', 'slug']
        .map(key => currentUrl.searchParams.get(key)).find(Boolean);
      const initialReaderUrl = !recoveredInitialReader && staleRole === 'guest' && next.authenticated
        && initialTargetId && currentTarget === initialTargetId && !pushedArticleHistory ? currentUrl : null;
      closeArticle();
      if (initialReaderUrl) {
        recoveredInitialReader = true;
        updateArticleHistory(initialReaderUrl.toString(), null);
        checkedInitialUrl = false;
      }
    };

    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const targetId = params.get('article') || params.get('book') || params.get('id') || params.get('bai-viet') || params.get('bai_viet') || params.get('sach') || params.get('doc') || params.get('slug');
      if (!targetId) {
        pushedArticleHistory = false;
        closeArticle(true);
      } else if (selectedArticle?.id !== targetId) {
        const found = articles.find((a) => a.id === targetId);
        if (found) {
          openArticle(found, undefined, false);
        } else {
          loadSingleArticle(targetId, false);
        }
      }
    };

    const onOpenBook = (event: Event) => {
      const detail = (event as CustomEvent<{ bookId: string }>).detail;
      if (!detail?.bookId) return;
      catalogEnabled = true;
      const targetId = detail.bookId;
      const normalizedTarget = targetId.toLowerCase().trim();
      const found = articles.find((a) =>
        a.id === targetId ||
        a.id.toLowerCase() === normalizedTarget ||
        a.id.replace(/^book_/u, '').toLowerCase() === normalizedTarget ||
        a.title.toLowerCase().includes(normalizedTarget) ||
        matchesVietnameseSearch(a.title, normalizedTarget)
      );
      if (found) {
        openArticle(found);
      } else {
        loadSingleArticle(targetId);
      }
    };

    const handleTabReset = (event: Event) => {
      const detail = (event as CustomEvent<{ path?: string }>).detail;
      if (detail?.path === '/' && selectedArticle) {
        closeArticle();
      }
    };

    window.addEventListener('quangtu:tab-reset', handleTabReset);
    window.addEventListener('quangtu:open-book', onOpenBook);
    window.addEventListener(CALENDAR_WIDGET_DATE_EVENT, selectWidgetDate);
    window.addEventListener('quangtu:article-editor', openEditor);
    window.addEventListener('quangtu:import-json', openImportJson);
    window.addEventListener(SESSION_CHANGE_EVENT, applyHomepageSession);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('quangtu:tab-reset', handleTabReset);
      window.removeEventListener('quangtu:open-book', onOpenBook);
      window.removeEventListener(CALENDAR_WIDGET_DATE_EVENT, selectWidgetDate);
      window.removeEventListener('quangtu:article-editor', openEditor);
      window.removeEventListener('quangtu:import-json', openImportJson);
      window.removeEventListener(SESSION_CHANGE_EVENT, applyHomepageSession);
      window.removeEventListener('popstate', onPopState);
      stopCalendarRollover();
    };
  });

  const metaTitle = $derived(
    selectedArticle ? `${selectedArticle.title} — ${DEFAULT_SITE_NAME}` : DEFAULT_SITE_TITLE
  );
  const metaDescription = $derived(
    cleanMetaDescription(selectedArticle?.summary, DEFAULT_SITE_DESCRIPTION)
  );
  const absoluteImageUrl = $derived(
    ensureAbsoluteUrl(selectedArticle?.imageUrl, typeof window !== 'undefined' ? window.location.origin : 'https://quangtu.vn')
  );
  const imageMimeType = $derived(getImageMimeType(absoluteImageUrl));
  const canonicalUrl = $derived(
    selectedArticle
      ? `${(typeof window !== 'undefined' ? window.location.origin : 'https://quangtu.vn')}/?article=${encodeURIComponent(selectedArticle.id)}`
      : 'https://quangtu.vn/'
  );
  const activeArticle = $derived(selectedArticle);
</script>

<svelte:head>
  <title>{metaTitle}</title>
  <meta name="title" content={metaTitle} />
  <meta name="description" content={metaDescription} />
  <link rel="canonical" href={canonicalUrl} />
  <meta property="og:type" content={activeArticle ? 'article' : 'website'} />
  <meta property="og:site_name" content={DEFAULT_SITE_NAME} />
  <meta property="og:title" content={metaTitle} />
  <meta property="og:description" content={metaDescription} />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:image" content={absoluteImageUrl} />
  <meta property="og:image:secure_url" content={absoluteImageUrl} />
  <meta property="og:image:type" content={imageMimeType} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content={metaTitle} />
  <meta property="og:locale" content="vi_VN" />
  <meta name="robots" content="index, follow" />
</svelte:head>

<div class="home-container">
  <HomeGreetingHeader />
  <PhapBaoBanner compact />
  <a class="pbb-compact pbb-compact--vegan" href="/tu-tap/an-chay" data-sveltekit-preload-data="off">
    <span class="pbb-compact-icon" aria-hidden="true"><Leaf size={22} /></span>
    <span class="pbb-compact-title">{veganUi[localeStore.current === 'en' ? 'en' : 'vi'].title}</span>
    <span class="pbb-compact-arrow" aria-hidden="true">→</span>
  </a>
  <RefugeReleaseBanner />
  <section id="home-calendar" class="home-calendar" aria-label={localeStore.current === 'en' ? 'Buddhist calendar' : 'Lịch Phật giáo'}>
    <BuddhistDailyArtCard currentDate={activeDate} />
    <WeeklyLunarStrip bind:selectedDate={activeDate} />
  </section>
  <HomeDailyReminders selectedDate={activeDate} />
  <DailyDhammapadaCard />

  <CorePracticePortals />

  <!-- 7. Hướng Dẫn Tu Học & Bố Thí Pháp Cố Định -->
  <FixedPracticeGuideBanners />
  <ContentUpdateControl />
</div>

{#if adminNotice}<div class="admin-notice" role="status">{adminNotice}</div>{/if}

{#if selectedArticle}
  {#await import('$lib/components/library/ReaderBoundary.svelte') then { default: ReaderBoundary }}
    <ReaderBoundary article={selectedArticle} {articles} initialProgress={initialReaderProgress} session={sessionStore.value} onOpen={openArticle} onClose={closeArticle} />
  {/await}
{/if}

{#if editingArticle && effectiveRole === 'admin'}
  {#await import('$lib/components/admin/articles/ArticleAdminModal.svelte') then { default: ArticleAdminModal }}
    <ArticleAdminModal
      article={editingArticle === 'new' ? null : editingArticle}
      role={effectiveRole}
      onClose={() => editingArticle = null}
      onSaved={() => { editingArticle = null; }}
      onDeleted={() => { editingArticle = null; }}
    />
  {/await}
{/if}

{#if importJsonOpen && effectiveRole === 'admin'}
  {#await import('$lib/components/admin/books/ImportJsonModal.svelte') then { default: ImportJsonModal }}
    <ImportJsonModal
      onClose={() => importJsonOpen = false}
      onImported={() => invalidateArticleState(queryClient)}
    />
  {/await}
{/if}

<style>
  .home-container {
    --home-section-gap: 24px;
    max-width: 960px;
    margin: 0 auto;
    padding: 20px 20px 48px;
    display: flex;
    flex-direction: column;
    gap: var(--home-section-gap);
  }
  .pbb-compact--vegan{margin-block-start:calc(12px - var(--home-section-gap))}
  .home-calendar{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);align-items:start;gap:20px}
  .home-calendar :global(.weekly-lunar-strip){align-self:stretch;justify-content:space-between}
  .admin-notice {
    position: fixed;
    right: 24px;
    bottom: 24px;
    z-index: 1200;
    max-width: min(420px, calc(100vw - 32px));
    padding: 11px 18px;
    border-radius: 22px;
    background: var(--brown-dark);
    box-shadow: var(--shadow-lg);
    color: #fff;
    font-size: 12px;
    font-weight: 600;
  }
  @media (max-width: 768px) {
    .home-calendar{grid-template-columns:minmax(0,1fr);gap:16px}
    .home-container {
      --home-section-gap: 20px;
      padding: 20px 16px 36px;
    }
    .admin-notice {
      right: 16px;
      bottom: 92px;
      left: 16px;
      text-align: center;
    }
  }
</style>
