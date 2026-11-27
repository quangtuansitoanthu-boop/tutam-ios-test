<script lang="ts">
  import { nativeSystemBarsSurface } from '$lib/browser/native-system-bars';
  import { createInterfaceTranslator } from '$lib/i18n/interface';
  const localizeUi = createInterfaceTranslator();
  import { hasPreservedOfflinePdf } from '$lib/browser/pdf-book-transition';
  import { acquireScrollLock } from '$lib/browser/scroll-lock';
  let releaseBodyScroll: (() => void) | null = null;
  import { fetchEnglishChapters, loadEnglishSingleArticleContent } from '$lib/browser/english-pack';
  import { createReaderProgressSync } from '$lib/browser/reader-progress-sync';
  import { fallbackReaderMedia } from '$lib/browser/public-media-fallback';
  import { onDestroy, onMount, tick, untrack } from 'svelte';
  import { categoryIcon, type LibraryArticle } from './article';
  import CommentsPanel from '$lib/components/comments/CommentsPanel.svelte';
  import ReaderToolbar from '$lib/components/reader/ReaderToolbar.svelte';
  import { startsWithReaderHeading } from '$lib/browser/reader-heading';
  import ReaderImageLightbox from '$lib/components/reader/ReaderImageLightbox.svelte';
  import ReaderMediaModal from '$lib/components/reader/ReaderMediaModal.svelte';
  import ReaderVideoDownload from '$lib/components/reader/ReaderVideoDownload.svelte';
  import {
    isMissionBook,
    missionImageSources,
    withMissionImages,
    missionImageCount,
    missionImageBytes,
    cachedMissionImageCount,
    downloadMissionImages,
    clearMissionImagesCache,
    readMissionImageUrls,
    revokeMissionImageUrls
  } from '$lib/browser/mission-book-images';
  import {
    isQuangTuFacebookBook,
    getQuangTuVideoCount,
    getQuangTuVideoTotalBytes,
    cachedQuangTuVideoCount,
    cachedQuangTuVideoBytes,
    downloadAllQuangTuVideos,
    clearAllQuangTuVideos,
    withQuangTuVideoSources
  } from '$lib/browser/quang-tu-facebook-videos';
  import manifestVideos from '$lib/data/quang-tu-facebook-videos.json';
  import type { ReaderMediaInfo } from '$lib/components/reader/ReaderToolbar.svelte';
  import PdfCanvasReader from '$lib/components/reader/PdfCanvasReader.svelte';
  import ReaderToast from '$lib/components/reader/ReaderToast.svelte';
  import ContentExperienceNotice from '$lib/components/shared/ContentExperienceNotice.svelte';
  import { hasContentExperienceNotice } from '$lib/i18n/content-experience-notice';
  import MostViewedArticles from '$lib/components/reader/MostViewedArticles.svelte';
  import ReadingAnnotations from '$lib/components/reader/ReadingAnnotations.svelte';
  import { createReaderTextToSpeech } from '$lib/components/reader/reader-text-to-speech';
  import { recordArticleView } from '$lib/browser/article-views-outbox';
  import { renderReaderContent } from '$lib/components/reader/content-renderer';
  import { fetchWithSessionRefresh, getBrowserSession } from '$lib/browser/session-csrf';
  import { resolveOfflineBundledResponse } from '$lib/browser/offline-bundled-resolver';
  import { savedContentImages } from '$lib/browser/session-cover';
  import { createPrivateReadingPrincipalGuard } from '$lib/browser/private-reading-principal-lifecycle';
  import { createReaderBookmarkAdapter, restoreReaderScroll, type ReaderBookmark } from '$lib/browser/reader-bookmarks';
  import { createReadingActivityClient, createThrottledReadingProgressWriter, isReadingActivityCapacityError, type ReadingActivitySession, type ReadingProgressRecord } from '$lib/browser/reading-activity-client';
  import { formatVietnamDateWithWeekday } from '$lib/utils/vietnam-date-format';
  import { isOnlineOnlyBook } from '$lib/domain/online-only-policy';
  import { isNativeApp } from '$lib/browser/native-platform';
  import { isHtmlResponse, resolveRemoteUrl, resolvePublicUrl } from '$lib/browser/native-api';
  import { SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { cachedQuoteNavigation } from '$lib/domain/reading/quote-navigation';
  import { quoteCardCopy } from '$lib/i18n/quote-card';
  import { getThemeContext } from '$lib/stores/theme.svelte';
  import {
    getCanonicalVietnameseArticle,
    getEnglishBookMeta,
    hasEnglishReadingContent,
    ENGLISH_TRANSLATION_NOTICE,
    prepareLocalizedReadingContent,
    localizeChapterTitle,
    offlineBooksEn,
    resolveVietnameseArticleTitle
  } from '$lib/domain/library/localized-article';

  interface Chapter { id:string; tieu_de:string; tom_tat:string; noi_dung:string; so_thu_tu:number; contentLoaded?:boolean; }
  interface ReaderSession { authenticated:boolean; csrfToken?:string|null; user?:null|{id:string}; }
  interface Props { article: LibraryArticle | null; articles?: LibraryArticle[]; initialProgress?: ReadingProgressRecord | null; onClose?: () => void; onOpen?: (article: LibraryArticle) => void; session?: ReaderSession; }
  let { article, articles = [], initialProgress = null, onClose = () => {}, onOpen = () => {}, session = { authenticated:false } }: Props = $props();
  const initialTextProgress = $derived(initialProgress?.contentKind === 'pdf' ? null : initialProgress);

  const themeStore = (() => {
    try { return getThemeContext(); }
    catch { return null; } // Standalone previews retain their provided paper.
  })();

  function isDarkThemeActive(): boolean {
    if (themeStore) return themeStore.value === 'dark';
    if (typeof document !== 'undefined') return document.documentElement.dataset.theme === 'dark';
    return false;
  }

  function getResolvedBackground(isDark: boolean): string {
    if (themeStore) return themeStore.paper;
    if (typeof localStorage === 'undefined') return isDark ? 'dark' : 'cream';
    if (isDark) {
      const savedDarkBg = localStorage.getItem('tutam_read_bg_dark');
      if (savedDarkBg && ['white', 'cream', 'gray', 'dark', 'purple'].includes(savedDarkBg)) return savedDarkBg;
      return 'dark';
    }
    const savedLightBg = localStorage.getItem('tutam_read_bg');
    if (savedLightBg && ['white', 'cream', 'gray', 'dark', 'purple'].includes(savedLightBg)) return savedLightBg;
    return 'cream';
  }

  let fontSize=$state(15), bold=$state(false), background=$state('cream'), bookmarked=$state(false), chapters=$state<Chapter[]>([]), chapterIndex=$state<number|null>(null), loadingChapters=$state(false), tocSearch=$state(''), loadingChapterContent=$state(false);
  let showTocModal=$state(false), lastReadChapterIndex=$state<number|null>(null);
  let lastReadScrollTop=0;
  let fontFamily=$state('bookerly'), lineHeight=$state(1.9), textAlign=$state<'justify' | 'left'>('justify'), ttsSpeed=$state(1), ttsVoice=$state('female'), zenMode=$state(false), zenScrollLastY=0;
  const fontOptions = [
    { key: 'bookerly', label: 'Bookerly' },
    { key: 'merriweather', label: 'Merriweather' },
    { key: 'literata', label: 'Literata' },
    { key: 'be-vietnam-pro', label: 'San Francisco' },
  ];
  const currentFontLabel = $derived(fontOptions.find(f => f.key === fontFamily)?.label || 'Bookerly');
  function changeFontFamily(val: string): void {
    fontFamily = val;
    persistSettings();
  }
  const activeFontCss=$derived(fontFamily==='merriweather'?"'Merriweather', Georgia, serif":fontFamily==='literata'?"'Literata', Georgia, serif":fontFamily==='be-vietnam-pro'?"var(--font-app)":"var(--font-reader)");
  let autoScrollActive=$state(false), autoScrollSpeed=$state(0.5), ttsActive=$state(false), ttsLoading=$state(false), viewCount=$state<number|null>(null), autoFrame:number|null=null, autoFrameTime=0;
  let scrollArea=$state<HTMLElement|null>(null), contentArea=$state<HTMLElement|null>(null), dialog=$state<HTMLElement|null>(null), previousFocus:HTMLElement|null=null;
  let loginModalOpen=$state(false);
  let lightboxSource=$state(''), lightboxAlt=$state(''), lightboxTrigger:HTMLElement|null=null;
  let toastMessage=$state(''), toastVisible=$state(false), toastTimer:ReturnType<typeof setTimeout>|null=null, toastFrame:number|null=null;
  let articleGeneration=0;
  let pendingBookmarkResume:ReaderBookmark|null=null;
  let pendingProgressResume:ReadingProgressRecord|null=null;
  let chaptersReady=false;
  let requestedAnnotationId = $state<string | null>(null);
  let quoteTargetId = $state<string | null>(null);
  let quoteNavigationState: 'idle' | 'pending' | 'applied' | 'fallback' = 'idle';
  function prepareQuoteNavigation(): void {
    requestedAnnotationId = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('annotation') || null;
    quoteTargetId = null;
    quoteNavigationState = 'idle';
  }
  let readingClient:ReturnType<typeof createReadingActivityClient>|null=null;
  let activitySession=$state<ReadingActivitySession>(untrack(()=>normalizeActivitySession(session)));
  let progressRevision=0;
  let returnedToContentsGeneration: number | null = null;
  let progressLoadSettled=false;
  let progressReadyForPrincipal=false;
  const principalGuard=createPrivateReadingPrincipalGuard(untrack(()=>normalizeActivitySession(session)));
  const currentChapter=$derived(chapterIndex===null?null:chapters[chapterIndex]);

  function hasChapterVideo(chap: Chapter | undefined | null): boolean {
    if (!chap) return false;
    return Boolean(
      (chap.tom_tat && (chap.tom_tat.includes('[Có Video]') || chap.tom_tat.includes('[Video]'))) ||
      (chap.noi_dung && (chap.noi_dung.includes('<video') || chap.noi_dung.includes('reader-video-wrapper'))) ||
      (chap.tieu_de && /video/i.test(chap.tieu_de))
    );
  }

  function cleanChapterSummary(summary: string | undefined | null): string {
    return summary ? summary.replace(/^\[(?:Có )?Video\]\s*/i, '') : '';
  }

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t);
  let experienceNoticeVisible = $state(false);
  let noticeCollapseScroll: { generation: number; top: number } | null = null;
  const experienceNoticeId = $derived(article?.id ?? null);
  $effect(() => {
    const id = experienceNoticeId;
    noticeCollapseScroll = null;
    let cancelled = false;
    const showNotice = Boolean(id && hasContentExperienceNotice(id));
    experienceNoticeVisible = showNotice;
    if (!showNotice) return;
    const timer = setTimeout(async () => {
      const generation = articleGeneration;
      const target = scrollArea;
      const previousTop = target?.scrollTop ?? 0;
      const pendingScroll = readerScrollTicking;
      experienceNoticeVisible = false;
      await tick();
      if (cancelled || generation !== articleGeneration || article?.id !== id || target !== scrollArea || !target) return;
      const top = target.scrollTop;
      // Enlarging the viewport can clamp its scroll position without a reading gesture.
      if (!pendingScroll && top < previousTop) noticeCollapseScroll = { generation, top };
    }, 10_000);
    return () => { cancelled = true; noticeCollapseScroll = null; clearTimeout(timer); };
  });

  function getLocalizedCategory(cat: string | undefined): string {
    if (!cat) return '';
    if (localeStore.current !== 'en') return cat;
    switch (cat.toUpperCase()) {
      case 'SÁCH KHUYẾN THIỆN': return 'MORAL BOOKS';
      case 'KINH PHẬT': return 'BUDDHIST SUTRAS';
      case 'CÁC NGHI THỨC': return 'RITUALS';
      case 'CHUYỆN NHÂN QUẢ': return 'KARMA STORIES';
      case 'SÁCH': return 'BOOKS';
      default: return cat;
    }
  }

  function getChapterTitle(chap: Chapter | undefined | null, index: number): string {
    if (!chap) return `${t.reader.chapter} ${index + 1}`;
    if (chap.tieu_de) return localizeChapterTitle(chap.tieu_de, localeStore.current);
    return `${t.reader.chapter} ${index + 1}`;
  }

  const filteredChapters = $derived.by(() => {
    const q = tocSearch.trim().toLowerCase();
    const entries = chapters.map((chapter, index) => ({ chapter, index }));
    const videoFirst = article?.id?.replace(/^book_/u, '') === 'tuyen-tap-phap-facebook-quang-tu';
    if (videoFirst) {
      // Only the table of contents is reordered. Reader navigation keeps the original chapter index.
      entries.sort((a, b) => Number(hasChapterVideo(b.chapter)) - Number(hasChapterVideo(a.chapter)));
      // Đặt bài mới ở mục 20 mà vẫn giữ chỉ số của các liên kết cũ.
      const chapterTwentyIndex = entries.findIndex(({ chapter }) => String(chapter.id) === '14532');
      if (chapterTwentyIndex > 19) {
        const [chapterTwenty] = entries.splice(chapterTwentyIndex, 1);
        entries.splice(19, 0, chapterTwenty);
      }
    }
    // Số hiển thị theo mục lục đã sắp xếp, index gốc dành cho liên kết và tiến độ.
    const numberedEntries = entries.map((entry, position) => ({ ...entry, displayNumber: position + 1 }));
    if (!q) return numberedEntries;
    const isVideoFilter = q === 'video' || q === 'có video';
    return numberedEntries
      .filter(({ chapter, index, displayNumber }) => {
        if (!chapter) return false;
        if (isVideoFilter && hasChapterVideo(chapter)) return true;
        const chapTitle = getChapterTitle(chapter, index);
        const titleMatch = (chapter.tieu_de || '').toLowerCase().includes(q) || chapTitle.toLowerCase().includes(q);
        const summaryMatch = chapter.tom_tat ? chapter.tom_tat.toLowerCase().includes(q) : false;
        const numberMatch = String(displayNumber) === q || (!videoFirst && String(chapter.so_thu_tu ?? '') === q);
        return titleMatch || summaryMatch || numberMatch;
      });
  });
  let retainedPdfId = $state<string | null>(null);
  let pdfSelectionReady = $state(false);
  const hasBookMetadata=$derived(Boolean(article&&retainedPdfId!==article.id&&(article.hasTableOfContents||article.volumeCount>0||chapters.length>0)));
  const showPdf=$derived(Boolean(article?.pdfUrl)&&!hasBookMetadata);

  const isEbook = $derived(Boolean(article && (article.hasTableOfContents || article.volumeCount > 0 || chapters.length > 0)));


  let singleArticleEnContent = $state<string | null>(null);
  let singleArticleEnglishRequest = 0;

  async function loadSingleArticleEnglish(targetArticle: LibraryArticle | null, generation: number): Promise<void> {
    const request = ++singleArticleEnglishRequest;
    singleArticleEnContent = null;
    if (!targetArticle || localeStore.current !== 'en') {
      singleArticleEnContent = null;
      return;
    }
    if (targetArticle.hasTableOfContents || targetArticle.volumeCount > 0) return;
    try {
      const content = await loadEnglishSingleArticleContent(targetArticle.id);
      if (content && request === singleArticleEnglishRequest && generation === articleGeneration && article?.id === targetArticle.id && localeStore.current === 'en') {
        singleArticleEnContent = content;
      }
    } catch {}
  }

  const rawActiveContent = $derived(
    chapterIndex !== null
      ? (currentChapter?.noi_dung || '')
      : ((localeStore.current === 'en' && singleArticleEnContent) ? singleArticleEnContent : (article?.content || ''))
  );
  let bookImageUrls = $state(new Map<string, string>());
  // URL video do ReaderVideoDownload sở hữu và thu hồi; map này chỉ tham chiếu.
  let quangTuVideoBlobUrls = $state(new Map<string, string>());
  const optionalBookImages = $derived(isMissionBook(article?.id));
  const isQuangTuBook = $derived(isQuangTuFacebookBook(article?.id));

  let showMediaModal = $state(false);
  let mediaModalError = $state('');
  let isMediaModalBusy = $state(false);
  let mediaModalProgress = $state(0);
  let cachedQuangTuCount = $state(0);
  let cachedQuangTuBytes = $state(0);
  let cachedMissionCount = $state(0);

  const allowedQuangTuVideos = new Map(manifestVideos.videos.map((v) => [v.filename, v]));

  const currentChapterVideoFile = $derived.by(() => {
    if (!isQuangTuBook) return null;
    const html = currentChapter?.noi_dung || '';
    const match = /<source\b[^>]*\bsrc="([^"]+)"/i.exec(html);
    if (!match) return null;
    const filename = match[1].split('/').pop() || '';
    return allowedQuangTuVideos.get(filename) || null;
  });

  function hasSeenMediaPrompt(bookId: string): boolean {
    try {
      return localStorage.getItem(`tutam_media_prompt_seen_${bookId}`) === '1';
    } catch {
      return false;
    }
  }

  function rememberMediaPrompt(bookId: string): void {
    try {
      localStorage.setItem(`tutam_media_prompt_seen_${bookId}`, '1');
    } catch {}
  }

  async function refreshMediaStats(): Promise<void> {
    if (isQuangTuBook) {
      cachedQuangTuCount = await cachedQuangTuVideoCount();
      cachedQuangTuBytes = await cachedQuangTuVideoBytes();
    }
    if (optionalBookImages) {
      cachedMissionCount = await cachedMissionImageCount();
    }
    // Tự động hiển thị hộp thoại hỏi tải media trong lần đọc đầu tiên nếu chưa tải đủ
    if (article?.id) {
      const bookId = article.id.replace(/^book_/u, '');
      if (!hasSeenMediaPrompt(bookId)) {
        if (isQuangTuBook && cachedQuangTuCount < getQuangTuVideoCount()) {
          showMediaModal = true;
        } else if (optionalBookImages && cachedMissionCount < missionImageCount) {
          showMediaModal = true;
        }
      }
    }
  }

  $effect(() => {
    if (article?.id) {
      void refreshMediaStats();
    }
  });

  function clearBookImageUrls(): void {
    revokeMissionImageUrls(bookImageUrls);
    bookImageUrls = new Map();
  }

  $effect(() => {
    let stale = false;
    if (article?.id && optionalBookImages && cachedMissionCount > 0) {
      const sources = missionImageSources(renderedContent);
      if (sources.length > 0) {
        void readMissionImageUrls(sources).then((urls) => {
          if (stale) {
            revokeMissionImageUrls(urls);
            return;
          }
          clearBookImageUrls();
          bookImageUrls = urls;
        }).catch(() => {});
      }
    }
    return () => {
      stale = true;
      clearBookImageUrls();
    };
  });

  $effect(() => {
    const articleId = article?.id;
    return () => {
      if (articleId) quangTuVideoBlobUrls = new Map();
    };
  });

  async function handleMediaModalDownloadAll(): Promise<void> {
    if (isMediaModalBusy) return;
    mediaModalError = '';
    isMediaModalBusy = true;
    mediaModalProgress = 0;
    const controller = new AbortController();
    try {
      if (isQuangTuBook) {
        await downloadAllQuangTuVideos(controller.signal, (completed, total) => {
          cachedQuangTuCount = completed;
          cachedQuangTuBytes = Math.round((completed / total) * getQuangTuVideoTotalBytes());
          mediaModalProgress = Math.round((completed / total) * 100);
        });
      } else if (optionalBookImages) {
        await downloadMissionImages(controller.signal, (count) => {
          cachedMissionCount = count;
          mediaModalProgress = Math.round((count / (missionImageCount || 1)) * 100);
        });
      }
      await refreshMediaStats();
      if (article?.id) rememberMediaPrompt(article.id.replace(/^book_/u, ''));
      notify(localizeUi('✓ Đã tải hoàn tất dữ liệu ngoại tuyến vào máy.'));
    } catch {
      mediaModalError = localizeUi('❌ Tải dữ liệu chưa hoàn tất. Vui lòng thử lại.');
    } finally {
      isMediaModalBusy = false;
      await refreshMediaStats();
    }
  }

  async function handleMediaModalClearAll(): Promise<void> {
    if (isMediaModalBusy) return;
    isMediaModalBusy = true;
    try {
      if (isQuangTuBook) {
        quangTuVideoBlobUrls.clear();
        quangTuVideoBlobUrls = new Map();
        await clearAllQuangTuVideos();
      } else if (optionalBookImages) {
        cachedMissionCount = 0;
        clearBookImageUrls();
        await clearMissionImagesCache();
      }
      await refreshMediaStats();
      showMediaModal = false;
      notify(localizeUi('✓ Đã xóa dữ liệu ngoại tuyến để giải phóng bộ nhớ.'));
    } catch {
      notify(localizeUi('❌ Không thể xóa dữ liệu. Vui lòng thử lại.'));
    } finally {
      isMediaModalBusy = false;
    }
  }

  const currentReaderMediaInfo = $derived.by<ReaderMediaInfo | null>(() => {
    if (isQuangTuBook) {
      return {
        type: 'video',
        title: localizedBookTitle || 'Tuyển tập các bài pháp từ Facebook Quang Từ',
        count: cachedQuangTuCount,
        total: getQuangTuVideoCount(),
        cachedBytes: cachedQuangTuBytes,
        totalBytes: getQuangTuVideoTotalBytes(),
        onOpenModal: () => {
          showMediaModal = true;
        }
      };
    }
    if (optionalBookImages) {
      return {
        type: 'image',
        title: localizedBookTitle || 'Sứ Mệnh Độ Vong',
        count: cachedMissionCount,
        total: missionImageCount,
        cachedBytes: Math.round((cachedMissionCount / (missionImageCount || 1)) * missionImageBytes),
        totalBytes: missionImageBytes,
        onOpenModal: () => {
          showMediaModal = true;
        }
      };
    }
    return null;
  });

  const renderedContent = $derived(renderReaderContent(prepareLocalizedReadingContent(rawActiveContent, localeStore.current)));
  const displayContent = $derived.by(() => {
    let html = renderedContent;
    if (optionalBookImages) {
      html = withMissionImages(html, bookImageUrls);
    }
    if (isQuangTuBook) {
      html = withQuangTuVideoSources(html, quangTuVideoBlobUrls);
    }
    return html;
  });
  const localizedBookTitle = $derived(
    localeStore.current === 'en' && article
      ? (getEnglishBookMeta(article.id)?.title || article.title)
      : (article ? resolveVietnameseArticleTitle(article.id, article.title, article.originalTitle) : '')
  );
  const localizedAuthor = $derived(
    localeStore.current === 'en' && article
      ? (getEnglishBookMeta(article.id)?.author || (article.author === 'Nguyên Phong' ? 'Nguyen Phong' : article.author))
      : (article?.originalAuthor || (article ? getCanonicalVietnameseArticle(article.id)?.author : null) || article?.author || '')
  );
  const activeTitle = $derived(chapterIndex !== null ? getChapterTitle(currentChapter, chapterIndex) : localizedBookTitle);
  const hasSourceChapterHeading = $derived(startsWithReaderHeading(displayContent, activeTitle));
  const readerEnglishAvailable = $derived(article !== null && hasEnglishReadingContent(article.id, singleArticleEnContent));
  const showReaderEnglishFallback = $derived(localeStore.current === 'en' && article !== null && !readerEnglishAvailable);
  const showReaderEnglishDraft = $derived(localeStore.current === 'en' && readerEnglishAvailable);
  const externalUrl=$derived(safeExternalUrl(article?.externalUrl));
  const readingContentKind=$derived(hasBookMetadata?'book':'article');
  const contentVersion=$derived(article?.updatedAt||article?.publishedAt||null);

  const progressSync = createReaderProgressSync();
  const progressWriter=createThrottledReadingProgressWriter((draft)=>{
    if(!readingClient)return;
    const principalToken=principalGuard.capture();
    try{readingClient.enqueueProgress(draft)}catch(cause){
      if(principalGuard.isCurrent(principalToken))notify(isReadingActivityCapacityError(cause)?localizeUi('❌ Hàng đợi đọc ngoại tuyến đã đầy. Hãy kết nối để đồng bộ.'):localizeUi('❌ Không thể lưu tiến độ đọc trên thiết bị.'));
      return;
    }
    progressSync.schedule(() => {
    if(!principalGuard.isCurrent(principalToken))return;
    void readingClient?.flush().then(()=>{
      if(!principalGuard.isCurrent(principalToken))return;
      const current=readingClient?.cachedProgress().find((row)=>row.contentKind===draft.contentKind&&row.contentId===draft.contentId);
      if(current)progressRevision=current.revision;
      if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('quangtu:reading-progress-updated'));
    }).catch(()=>{});
    });
  });

  function normalizeActivitySession(value:ReaderSession):ReadingActivitySession{
    return {authenticated:Boolean(value.authenticated&&value.user?.id),csrfToken:value.csrfToken||null,user:value.user?.id?{id:value.user.id}:null};
  }

  function activePrincipal():string{
    return activitySession.authenticated&&activitySession.user?.id?activitySession.user.id:'anonymous';
  }

  // findReaderBookmark remains available only behind this principal-scoped compatibility adapter.
  function bookmarkAdapter(){return createReaderBookmarkAdapter(localStorage,activePrincipal())}

  function safeExternalUrl(value:string|undefined):string{
    const candidate=String(value||'').trim();
    if(candidate.startsWith('/')&&!candidate.startsWith('//'))return candidate;
    try{const parsed=new URL(candidate);return parsed.protocol==='https:'&&!parsed.username&&!parsed.password?parsed.toString():''}catch{return''}
  }

  function readerImageAction(node:HTMLElement){
    const enhance=()=>node.querySelectorAll<HTMLImageElement>('img').forEach((image)=>{
      image.tabIndex=0;
      image.setAttribute('role','button');
      image.setAttribute('aria-label',image.alt?localizeUi('Mở ảnh: {0}', image.alt):localizeUi('Mở ảnh minh họa'));
    });
    const click=(event:MouseEvent)=>openContentImage(event.target);
    const keydown=(event:KeyboardEvent)=>contentKeydown(event);
    const observer=new MutationObserver(enhance);
    observer.observe(node,{childList:true,subtree:true});
    node.addEventListener('click',click);
    node.addEventListener('keydown',keydown);
    enhance();
    return{update:enhance,destroy:()=>{observer.disconnect();node.removeEventListener('click',click);node.removeEventListener('keydown',keydown)}};
  }

  function openContentImage(target:EventTarget|null):boolean{
    const image=target instanceof HTMLImageElement?target:target instanceof HTMLElement?target.closest<HTMLImageElement>('img'):null;
    if(!image||!image.src)return false;
    lightboxTrigger=image;
    lightboxSource=image.currentSrc||image.src;
    lightboxAlt=image.alt||localizeUi('Ảnh minh họa bài viết');
    return true;
  }

  function contentKeydown(event:KeyboardEvent):void{
    if((event.key==='Enter'||event.key===' ')&&openContentImage(event.target)){
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function closeLightbox():void{
    const trigger=lightboxTrigger;
    lightboxSource='';
    lightboxAlt='';
    lightboxTrigger=null;
    void tick().then(()=>trigger?.focus());
  }

  function focusableItems(container:HTMLElement):HTMLElement[]{
    return Array.from(container.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter((element)=>element.getClientRects().length>0&&!element.hidden&&element.getAttribute('aria-hidden')!=='true');
  }

  function trapReaderFocus(event:KeyboardEvent):void{
    if(event.key!=='Tab'||loginModalOpen||lightboxSource||!dialog)return;
    const items=focusableItems(dialog);
    if(!items.length){event.preventDefault();dialog.focus();return}
    const first=items[0],last=items[items.length-1],active=document.activeElement;
    if(event.shiftKey&&(active===first||active===dialog)){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&active===last){event.preventDefault();first.focus()}
  }

  function changeBackground(value: string): void {
    if (value === 'auto') { themeStore?.apply('auto'); return; }
    if (!['white', 'cream', 'gray', 'dark', 'purple'].includes(value)) return;
    background = value;
    if (value === 'dark') themeStore?.apply('dark');
    else if (value === 'white' || value === 'cream' || value === 'gray' || value === 'purple') themeStore?.apply('light', value);
    persistSettings(true);
  }

  function persistSettings(syncPaper = false){
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('tutam_read_fontsize',String(fontSize));
    localStorage.setItem('tutam_read_bold',bold?'1':'0');
    // Chỉ lựa chọn giấy tường minh mới đồng bộ cả hai khóa cũ.
    if (!themeStore) {
      const paperKey = isDarkThemeActive() ? 'tutam_read_bg_dark' : 'tutam_read_bg';
      localStorage.setItem(paperKey, background);
      if (syncPaper) localStorage.setItem(paperKey === 'tutam_read_bg' ? 'tutam_read_bg_dark' : 'tutam_read_bg', background);
    }
    localStorage.setItem('tutam_read_font',fontFamily);
    localStorage.setItem('tutam_read_line_height',String(lineHeight));
    localStorage.setItem('tutam_read_align',textAlign);
    localStorage.setItem('tutam_read_tts_speed',String(ttsSpeed));
    localStorage.setItem('tutam_read_tts_voice',ttsVoice);
  }
  let readerScrollTicking = false;
  function onReaderScroll(){
    if (readerScrollTicking) return;
    readerScrollTicking = true;
    requestAnimationFrame(() => {
      readerScrollTicking = false;
      const collapseScroll = noticeCollapseScroll;
      noticeCollapseScroll = null;
      if (collapseScroll?.generation === articleGeneration && scrollArea?.scrollTop === collapseScroll.top) {
        zenScrollLastY = collapseScroll.top;
        return;
      }
      scheduleTextProgress();
      if(scrollArea){
        const st = scrollArea.scrollTop;
        if (st > 50 && st > zenScrollLastY + 30) {
          if (!zenMode) zenMode = true;
        } else if (st < zenScrollLastY - 40 || st < 30) {
          if (zenMode) zenMode = false;
        }
        zenScrollLastY = st;
      }
    });
  }
  function handlePdfViewerScroll(st: number) {
    if (st > 50 && st > zenScrollLastY + 15) {
      zenMode = true;
    } else if (st < zenScrollLastY - 25 || st < 30) {
      zenMode = false;
    }
    zenScrollLastY = st;
  }
  function notify(message:string){toastMessage=message;toastVisible=false;if(toastTimer)clearTimeout(toastTimer);if(toastFrame!==null)cancelAnimationFrame(toastFrame);toastFrame=requestAnimationFrame(()=>{toastFrame=null;toastVisible=true});toastTimer=setTimeout(()=>{toastVisible=false;toastTimer=null},message.startsWith('❌')?5000:3000)}
  const ttsController=createReaderTextToSpeech({getContent:()=>contentArea,getScrollArea:()=>scrollArea,onNotify:notify,getVoice:()=>ttsVoice,getLocale:()=>localeStore.current,onState:(state)=>{ttsLoading=state==='loading';ttsActive=state==='playing'}});
  function font(delta:number){fontSize=Math.min(45,Math.max(13,fontSize+delta));persistSettings()}
  function toggleBookmark(){if(!article)return;bookmarked=bookmarkAdapter().toggle({articleId:article.id,articleTitle:article.title,chapterIndex,chapterTitle:currentChapter?.tieu_de||'',scrollTop:Math.round(scrollArea?.scrollTop||0)});notify(bookmarked?localizeUi('✓ Đã đánh dấu trang!'):localizeUi('Đã bỏ đánh dấu trang'))}
  async function goToBookmark(){
    if(!article)return;
    const bookmark=bookmarkAdapter().find(article.id);
    if(!bookmark){bookmarked=false;return}
    if(bookmark.chapIdx!==null&&bookmark.chapIdx<chapters.length){
      await openChapter(bookmark.chapIdx,bookmark.scrollTop);
      notify(localizeUi('📖 Tiếp tục đọc: {0}', bookmark.chapTitle || localizeUi('Phẩm {0}', bookmark.chapIdx + 1)));
      return;
    }
    await openChapter(null,bookmark.scrollTop);
    notify(localizeUi('📖 Đang ở vị trí đánh dấu'));
  }
  let preparingSpeech = $state(false);
  let speechRequest = 0;
  function stopTts(){speechRequest+=1;preparingSpeech=false;ttsController.stop()}
  async function speak(){
    if(ttsActive || ttsLoading || preparingSpeech){stopTts();return}
    const request = ++speechRequest;
    const generation = articleGeneration;
    const speechPrincipal = principalGuard.capture();
    const speechArticleId = article?.id;
    preparingSpeech = true;
    try {
    if(article && !chaptersReady)await loadChapters(article,generation);
    if(request!==speechRequest || generation!==articleGeneration || !principalGuard.isCurrent(speechPrincipal) || article?.id!==speechArticleId)return;
    if(chapterIndex===null&&chapters.length>0){
      const targetIndex=(lastReadChapterIndex!==null&&lastReadChapterIndex<chapters.length)?lastReadChapterIndex:0;
      notify(localizeUi('🎧 Đang mở bài để đọc...'));
      await openChapter(targetIndex,0,generation,true,true,true);
      await tick();
    }
    if(request!==speechRequest || generation!==articleGeneration || !principalGuard.isCurrent(speechPrincipal) || article?.id!==speechArticleId)return;
    if(chapterIndex!==null && !chapters[chapterIndex]?.contentLoaded){
      notify(localizeUi('Chưa tải được nội dung chương. Vui lòng thử lại.'));
      return;
    }
    ttsController.toggle();
    } finally { if(request===speechRequest)preparingSpeech=false; }
  }
  function stopAutoScroll(){if(autoFrame!==null)cancelAnimationFrame(autoFrame);autoFrame=null;autoFrameTime=0;autoScrollActive=false}
  function handleReaderVisibilityChange(): void {
    if (document.visibilityState === 'hidden') stopAutoScroll();
  }
  function autoScrollFrame(time:number){
    if(!autoScrollActive||!scrollArea)return stopAutoScroll();
    if(scrollArea.scrollTop+scrollArea.clientHeight>=scrollArea.scrollHeight-1)return stopAutoScroll();
    if(autoFrameTime)scrollArea.scrollTop+=autoScrollSpeed*(Math.min(100,Math.max(0,time-autoFrameTime))/16.667);
    autoFrameTime=time;
    autoFrame=requestAnimationFrame(autoScrollFrame);
  }
  function autoScroll(){if(autoScrollActive)return stopAutoScroll();autoScrollActive=true;autoFrame=requestAnimationFrame(autoScrollFrame)}
  function changeAutoScrollSpeed(speed:number){autoScrollSpeed=speed;localStorage.setItem('tutam_auto_scroll_speed',String(speed))}
  async function openChapter(index:number|null,restoreScrollTop=0,generation=articleGeneration,persistCurrent=true,syncHistory=true,keepSpeechRequest=false){
    if(persistCurrent && chapterIndex!==null){
      lastReadScrollTop=scrollArea?.scrollTop??0;
      scheduleTextProgress(true);
    }
    stopAutoScroll();
    if(!keepSpeechRequest)stopTts();
    const prevIdx = chapterIndex;
    if (index === null && prevIdx !== null) returnedToContentsGeneration = generation;
    chapterIndex=index;
    if(index!==null){
      lastReadChapterIndex=index;
      lastReadScrollTop=restoreScrollTop;
      showTocModal=false;
    }
    // Lazy-load chapter content on demand if not yet loaded
    if(index!==null && article && chapters[index] && !chapters[index].contentLoaded){
      await loadChapterContent(article.id, index, generation);
      if(generation!==articleGeneration || chapterIndex!==index)return;
    }
    if(syncHistory && typeof window !== 'undefined' && article){
      const url = new URL(window.location.href);
      if(index !== null){
        url.searchParams.set('chap', String(index + 1));
        window.history.replaceState({ ...window.history.state, articleId: article.id, chapterIndex: index }, '', url.toString());
      } else if(prevIdx !== null){
        url.searchParams.delete('chap');
        window.history.replaceState({ ...window.history.state, articleId: article.id, chapterIndex: null }, '', url.toString());
      }
    }
    await tick();
    if(generation!==articleGeneration)return;
    const target=scrollArea;
    if(!target)return;
    zenMode=false;
    zenScrollLastY=0;
    if(restoreScrollTop>0){
      restoreReaderScroll(target,restoreScrollTop,requestAnimationFrame,()=>{
        if(generation!==articleGeneration || chapterIndex!==index || scrollArea!==target)return false;
        zenScrollLastY=Math.min(restoreScrollTop,Math.max(0,target.scrollHeight-target.clientHeight));
        return true;
      });
    } else {
      target.scrollTo({ top: 0, behavior: 'instant' });
      target.scrollTop = 0;
    }
    if(persistCurrent && chapterIndex!==null && restoreScrollTop<=0)scheduleTextProgress();
  }
  function back(){
    if(showTocModal){
      showTocModal=false;
      return;
    }
    if(lightboxSource){closeLightbox();return}
    if(chapterIndex!==null){
      void openChapter(null);
      return;
    }
    close();
  }
  function fallbackCopy(value:string){const textArea=document.createElement('textarea');textArea.value=value;textArea.style.position='fixed';textArea.style.top='0';textArea.style.left='0';document.body.appendChild(textArea);textArea.focus();textArea.select();try{notify(document.execCommand('copy')?localizeUi('Đã copy link bài viết!'):localizeUi('Trình duyệt không hỗ trợ copy tự động'))}catch{notify(localizeUi('Lỗi khi copy link!'))}finally{textArea.remove()}}
  function getShareUrl(): string {
    if (!article) return typeof location !== 'undefined' ? location.href : '';
    return resolvePublicUrl(`/?article=${encodeURIComponent(article.id)}`);
  }
  async function share(){if(!article)return;const shareUrl=getShareUrl();const data={title:article.title,text:article.summary||article.title,url:shareUrl};if(navigator.share){await navigator.share(data).catch(()=>{});return}if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(shareUrl).then(()=>notify(localizeUi('Đã copy link bài viết!'))).catch(()=>fallbackCopy(shareUrl));return}fallbackCopy(shareUrl)}
  async function applyPendingTextResume(targetArticle:LibraryArticle,generation:number){
    if(!chaptersReady||!progressLoadSettled||generation!==articleGeneration||article?.id!==targetArticle.id)return;
    if (quoteNavigationState === 'pending' || quoteNavigationState === 'applied') return;
    if (requestedAnnotationId && quoteNavigationState === 'idle' && !showPdf) {
      quoteNavigationState = 'pending';
      const principalToken = principalGuard.capture();
      const target = cachedQuoteNavigation(readingClient?.cachedAnnotations() ?? [], requestedAnnotationId, targetArticle.id);
      const copy = quoteCardCopy[localeStore.current];
      if (target.status === 'text') {
        const index = target.sectionId === 'root' ? null : chapters.findIndex(chapter => chapter.id === target.sectionId);
        if (index === null || index >= 0) {
          await openChapter(index, 0, generation, false, true, preparingSpeech);
          if (generation !== articleGeneration || !principalGuard.isCurrent(principalToken)) return;
          quoteNavigationState = 'applied';
          quoteTargetId = requestedAnnotationId;
          progressReadyForPrincipal = true;
          return;
        }
      }
      quoteNavigationState = 'fallback';
      notify(target.status === 'missing' ? copy.targetMissing : target.status === 'orphaned' ? copy.targetOrphaned : copy.targetInvalid);
    }
    if(chapters.length > 0 && (chapterIndex !== null || returnedToContentsGeneration === generation)){
      if(generation===articleGeneration)progressReadyForPrincipal=true;
      return;
    }
    if(typeof window !== 'undefined'){
      const urlChap = new URLSearchParams(window.location.search).get('chap');
      if(urlChap){
        const chapNum = parseInt(urlChap, 10) - 1;
        if(chapNum >= 0 && chapNum < chapters.length){
          await openChapter(chapNum, 0, generation, false, false, preparingSpeech);
          if(generation===articleGeneration)progressReadyForPrincipal=true;
          return;
        }
      }
    }
    const progress=pendingProgressResume;
    if(progress && progress.position){
      pendingProgressResume=null;
      progressRevision=progress.revision;
      const chapterId=String(progress.position.chapterId||'').trim();
      let targetIndex:number|null=null;
      if(chapterId){
        const found = chapters.findIndex((chapter)=>
          String(chapter.id) === chapterId ||
          chapter.id == chapterId ||
          String(chapter.so_thu_tu) === chapterId
        );
        if(found >= 0) targetIndex = found;
      }
      if((targetIndex===null||targetIndex<0) && progress.position.chapterIdx !== undefined && progress.position.chapterIdx !== null){
        const idx=Number(progress.position.chapterIdx);
        if(Number.isInteger(idx) && idx >= 0 && idx < chapters.length){
          targetIndex=idx;
        }
      }
      const scrollTop=Number(progress.position.scrollTop||0);
      if(targetIndex !== null && targetIndex >= 0){
        lastReadChapterIndex = targetIndex;
        lastReadScrollTop=scrollTop;
        if(initialTextProgress?.contentId===targetArticle.id){
          await openChapter(targetIndex,scrollTop,generation,false,false,preparingSpeech);
          if(progress.percent>0)notify(localizeUi('📖 Tiếp tục đọc: {0}', chapters[targetIndex]?.tieu_de || localizeUi('Tập {0}', targetIndex + 1)));
        }
        if(generation===articleGeneration)progressReadyForPrincipal=true;
        return;
      } else if(chapters.length === 0){
        await openChapter(null,scrollTop,generation,false,false,preparingSpeech);
        if(progress.percent>0)notify(localizeUi('📖 Tiếp tục từ vị trí đã đọc'));
        if(generation===articleGeneration)progressReadyForPrincipal=true;
        return;
      }
    }
    const resume=pendingBookmarkResume;pendingBookmarkResume=null;
    if(!resume){
      if(scrollArea){scrollArea.scrollTop=0;scrollArea.scrollLeft=0}
      progressReadyForPrincipal=true;
      return;
    }
    if(resume.chapIdx!==null && resume.chapIdx >= 0 && resume.chapIdx < chapters.length){
      lastReadChapterIndex = resume.chapIdx;
      lastReadScrollTop=resume.scrollTop;
      if(generation===articleGeneration)progressReadyForPrincipal=true;
      return;
    }
    await tick();
    const target=scrollArea;
    if(target){
      if(resume.scrollTop > 0) restoreReaderScroll(target,resume.scrollTop,requestAnimationFrame,()=>generation===articleGeneration&&article?.id===targetArticle.id);
      else { target.scrollTop = 0; target.scrollLeft = 0; }
    }
    if(generation===articleGeneration)progressReadyForPrincipal=true;
  }
  const chapterListRequests = new Map<string,Promise<void>>();
  function usesPdf(target: LibraryArticle): boolean {
    return Boolean(target.pdfUrl && (retainedPdfId === target.id || !(target.hasTableOfContents || target.volumeCount > 0)));
  }
  async function initializeReadingFormat(target: LibraryArticle, generation: number): Promise<void> {
    const token = principalGuard.capture();
    pdfSelectionReady = false;
    retainedPdfId = null;
    loadingChapters = Boolean(target.hasTableOfContents || target.volumeCount > 0);
    let retained = false;
    if (target.pdfUrl && (target.hasTableOfContents || target.volumeCount > 0)) {
      try { retained = await hasPreservedOfflinePdf(target, token.principalId); }
      catch { /* A storage failure never deletes the previous document. */ }
    }
    if (generation !== articleGeneration || article?.id !== target.id || !principalGuard.isCurrent(token)) return;
    retainedPdfId = retained ? target.id : null;
    pdfSelectionReady = true;
    if (usesPdf(target)) { loadingChapters = false; return; }
    void loadChapters(target, generation);
    void loadReadingProgress(target, generation);
  }

  function loadChapters(targetArticle:LibraryArticle,generation:number):Promise<void>{
    const key = `${generation}:${targetArticle.id}:${localeStore.current}`;
    const pending = chapterListRequests.get(key);
    if(pending)return pending;
    const request = fetchChapters(targetArticle,generation).finally(()=>chapterListRequests.delete(key));
    chapterListRequests.set(key,request);
    return request;
  }
  async function fetchChapters(targetArticle:LibraryArticle,generation:number){
    if(!pdfSelectionReady || usesPdf(targetArticle))return;
    chaptersReady=false;
    loadingChapters=Boolean(targetArticle.hasTableOfContents||targetArticle.volumeCount>0);
    void loadSingleArticleEnglish(targetArticle, generation);
    if (!targetArticle.hasTableOfContents && targetArticle.volumeCount <= 0 && targetArticle.content?.trim()) {
      chapters = [];
      loadingChapters = false;
      chaptersReady = true;
      await applyPendingTextResume(targetArticle, generation);
      return;
    }
    try{
      const endpoint = `/api/articles/${encodeURIComponent(targetArticle.id)}/chapters?order=so_thu_tu.asc&limit=5000`;
      let payload: unknown = [];
      const isOnlineOnly = isOnlineOnlyBook(targetArticle.title, targetArticle.author, targetArticle.id);

      if (localeStore.current === 'en') {
        // 1. Thử resolveOfflineBundledResponse (offline bundle / local cache)
        try {
          const bundledResp = await resolveOfflineBundledResponse(endpoint);
          if (bundledResp && bundledResp.ok && !isHtmlResponse(bundledResp)) {
            const data = await bundledResp.json().catch(() => []);
            if (Array.isArray(data) && data.length > 0) {
              payload = data;
            }
          }
        } catch {}

        // 2. Thử fetch file JSON tiếng Anh: ưu tiên local asset trước, sau đó mới thử remote URL
        if (!Array.isArray(payload) || payload.length === 0) {
          const enCandidates = [
            `/offline-data/chapters-en/${encodeURIComponent(targetArticle.id)}.json`,
            `/offline-data/chapters-en/${encodeURIComponent(targetArticle.id.replace(/^book_/u, ''))}.json`,
            `/offline-data/chapters-en/book_${encodeURIComponent(targetArticle.id)}.json`
          ];
          for (const path of enCandidates) {
            try {
              const resp = await (path.startsWith('/offline-data/chapters-en/') ? fetchEnglishChapters(path) : fetch(path));
              if (resp.ok && !isHtmlResponse(resp)) {
                const data = await resp.json().catch(() => []);
                if (Array.isArray(data) && data.length > 0) {
                  payload = data;
                  break;
                }
              }
            } catch {}
            try {
              const remoteUrl = resolveRemoteUrl(path);
              if (remoteUrl !== path) {
                const resp = await fetch(remoteUrl);
                if (resp.ok && !isHtmlResponse(resp)) {
                  const data = await resp.json().catch(() => []);
                  if (Array.isArray(data) && data.length > 0) {
                    payload = data;
                    break;
                  }
                }
              }
            } catch {}
          }
        }
      }

      // Fallback sang tiếng Việt nếu không phải EN mode hoặc sách chưa có bản dịch EN
      if (!Array.isArray(payload) || payload.length === 0) {
        if (isOnlineOnly) {
          // Với sách bản quyền online, nạp qua file chapters hoặc API remote
          const viCandidates = [
            `/offline-data/chapters/${encodeURIComponent(targetArticle.id)}.json`,
            `/offline-data/chapters/${encodeURIComponent(targetArticle.id.replace(/^book_/u, ''))}.json`,
            `/offline-data/chapters/book_${encodeURIComponent(targetArticle.id)}.json`
          ];
          for (const path of viCandidates) {
            try {
              const viResp = await (path.startsWith('/offline-data/chapters-en/') ? fetchEnglishChapters(path) : fetch(path));
              if (viResp.ok && !isHtmlResponse(viResp)) {
                const data = await viResp.json().catch(() => []);
                if (Array.isArray(data) && data.length > 0) {
                  payload = data;
                  break;
                }
              }
            } catch {}
            try {
              const remoteUrl = resolveRemoteUrl(path);
              if (remoteUrl !== path) {
                const viResp = await fetch(remoteUrl);
                if (viResp.ok && !isHtmlResponse(viResp)) {
                  const data = await viResp.json().catch(() => []);
                  if (Array.isArray(data) && data.length > 0) {
                    payload = data;
                    break;
                  }
                }
              }
            } catch {}
          }

          if (!Array.isArray(payload) || payload.length === 0) {
            try {
              const apiResp = await fetchWithSessionRefresh(endpoint).catch(() => null);
              if (apiResp && apiResp.ok && !isHtmlResponse(apiResp)) {
                const data = await apiResp.json().catch(() => []);
                if (Array.isArray(data) && data.length > 0) {
                  payload = data;
                }
              }
            } catch {}
          }

          if (!Array.isArray(payload) || payload.length === 0) {
            notify(localeStore.current === 'en'
              ? '⚠️ This book requires an internet connection to read online.'
              : '⚠️ Cuốn sách này chỉ hỗ trợ đọc trực tuyến. Vui lòng kết nối Internet để đọc.');
          }
        } else {
          // Sách thông thường / offline bundle
          try {
            const bundledResp = await resolveOfflineBundledResponse(endpoint);
            if (bundledResp && bundledResp.ok && !isHtmlResponse(bundledResp)) {
              const data = await bundledResp.json().catch(() => []);
              if (Array.isArray(data) && data.length > 0) {
                payload = data;
              }
            }
          } catch {}

          if (!Array.isArray(payload) || payload.length === 0) {
            try {
              const netResp = await fetchWithSessionRefresh(endpoint).catch(() => null);
              if (netResp && netResp.ok && !isHtmlResponse(netResp)) {
                const data = await netResp.json().catch(() => []);
                if (Array.isArray(data) && data.length > 0) {
                  payload = data;
                }
              }
            } catch {}
          }

          if (!Array.isArray(payload) || payload.length === 0) {
            const viCandidates = [
              `/offline-data/chapters/${encodeURIComponent(targetArticle.id)}.json`,
              `/offline-data/chapters/${encodeURIComponent(targetArticle.id.replace(/^book_/u, ''))}.json`,
              `/offline-data/chapters/book_${encodeURIComponent(targetArticle.id)}.json`
            ];
            for (const path of viCandidates) {
              try {
                const resp = await (path.startsWith('/offline-data/chapters-en/') ? fetchEnglishChapters(path) : fetch(path));
                if (resp.ok && !isHtmlResponse(resp)) {
                  const data = await resp.json().catch(() => []);
                  if (Array.isArray(data) && data.length > 0) {
                    payload = data;
                    break;
                  }
                }
              } catch {}
              try {
                const remoteUrl = resolveRemoteUrl(path);
                if (remoteUrl !== path) {
                  const resp = await fetch(remoteUrl);
                  if (resp.ok && !isHtmlResponse(resp)) {
                    const data = await resp.json().catch(() => []);
                    if (Array.isArray(data) && data.length > 0) {
                      payload = data;
                      break;
                    }
                  }
                }
              } catch {}
            }
          }
        }
      }

      // 5. Fallback: nạp từ tap_tieu_de metadata nếu payload vẫn rỗng
      if ((!Array.isArray(payload) || payload.length === 0) && (targetArticle as any).tap_tieu_de) {
        try {
          const raw = (targetArticle as any).tap_tieu_de;
          const parsed = Array.isArray(raw) ? raw : JSON.parse(String(raw));
          if (Array.isArray(parsed) && parsed.length > 0) {
            payload = parsed.map((item: any, idx: number) => ({
              id: `${targetArticle.id}_chap_${idx + 1}`,
              bai_viet_id: targetArticle.id,
              so_thu_tu: idx,
              tieu_de: typeof item === 'string' ? item : item?.tieu_de || (localeStore.current === 'en' ? `Chapter ${idx + 1}` : `Chương ${idx + 1}`),
              tom_tat: typeof item === 'object' && item ? item.tom_tat || '' : '',
              noi_dung: typeof item === 'object' && item ? item.noi_dung || '' : ''
            }));
          }
        } catch {}
      }

      if(generation!==articleGeneration||article?.id!==targetArticle.id)return;
      const loaded = (Array.isArray(payload)?payload:[]).map((ch: Chapter) => ({ ...ch, contentLoaded: Boolean(ch.noi_dung && ch.noi_dung.trim()) }));
      chapters=loaded;
    }catch{
      if(generation===articleGeneration&&article?.id===targetArticle.id)chapters=[];
    }finally{
      if(generation===articleGeneration&&article?.id===targetArticle.id)loadingChapters=false;
    }
    if(generation!==articleGeneration||article?.id!==targetArticle.id)return;
    chaptersReady=true;
    await applyPendingTextResume(targetArticle,generation);
  }

  const chapterContentRequests = new Map<string, Promise<void>>();
  function loadChapterContent(targetBookId:string, index:number, generation:number):Promise<void>{
    const key = `${generation}:${targetBookId}:${index}`;
    const pending = chapterContentRequests.get(key);
    if(pending)return pending;
    const request = fetchChapterContent(targetBookId,index,generation).finally(()=>chapterContentRequests.delete(key));
    chapterContentRequests.set(key,request);
    return request;
  }

  async function fetchChapterContent(targetBookId:string, index:number, generation:number):Promise<void>{
    const chap = chapters[index];
    if(!chap||chap.contentLoaded)return;
    loadingChapterContent=true;
    try{
      const endpoint = `/api/articles/${encodeURIComponent(targetBookId)}/chapters?so_thu_tu=eq.${chap.so_thu_tu}&limit=5000`;
      const isOnlineOnly = isOnlineOnlyBook(article?.title, article?.author, targetBookId);
      let payload: unknown = [];

      if (localeStore.current === 'en') {
        // 1. Thử resolveOfflineBundledResponse trước
        try {
          const bundledResp = await resolveOfflineBundledResponse(endpoint);
          if (bundledResp && bundledResp.ok && !isHtmlResponse(bundledResp)) {
            const data = await bundledResp.json().catch(() => []);
            if (Array.isArray(data) && data.length > 0) {
              payload = data;
            }
          }
        } catch {}

        // 2. Thử fetch file JSON tiếng Anh: ưu tiên local asset trước, sau đó mới thử remote URL
        if (!Array.isArray(payload) || payload.length === 0) {
          const enCandidates = [
            `/offline-data/chapters-en/${encodeURIComponent(targetBookId)}.json`,
            `/offline-data/chapters-en/${encodeURIComponent(targetBookId.replace(/^book_/u, ''))}.json`,
            `/offline-data/chapters-en/book_${encodeURIComponent(targetBookId)}.json`
          ];
          for (const path of enCandidates) {
            try {
              const resp = await (path.startsWith('/offline-data/chapters-en/') ? fetchEnglishChapters(path) : fetch(path));
              if (resp.ok && !isHtmlResponse(resp)) {
                const data = await resp.json().catch(() => []);
                if (Array.isArray(data) && data.length > 0) {
                  payload = data;
                  break;
                }
              }
            } catch {}
            try {
              const remoteUrl = resolveRemoteUrl(path);
              if (remoteUrl !== path) {
                const resp = await fetch(remoteUrl);
                if (resp.ok && !isHtmlResponse(resp)) {
                  const data = await resp.json().catch(() => []);
                  if (Array.isArray(data) && data.length > 0) {
                    payload = data;
                    break;
                  }
                }
              }
            } catch {}
          }
        }
      }

      if (!Array.isArray(payload) || payload.length === 0) {
        if (isOnlineOnly) {
          const viCandidates = [
            `/offline-data/chapters/${encodeURIComponent(targetBookId)}.json`,
            `/offline-data/chapters/${encodeURIComponent(targetBookId.replace(/^book_/u, ''))}.json`,
            `/offline-data/chapters/book_${encodeURIComponent(targetBookId)}.json`
          ];
          for (const path of viCandidates) {
            try {
              const viResp = await (path.startsWith('/offline-data/chapters-en/') ? fetchEnglishChapters(path) : fetch(path));
              if (viResp.ok && !isHtmlResponse(viResp)) {
                const data = await viResp.json().catch(() => []);
                if (Array.isArray(data) && data.length > 0) {
                  payload = data;
                  break;
                }
              }
            } catch {}
            try {
              const remoteUrl = resolveRemoteUrl(path);
              if (remoteUrl !== path) {
                const viResp = await fetch(remoteUrl);
                if (viResp.ok && !isHtmlResponse(viResp)) {
                  const data = await viResp.json().catch(() => []);
                  if (Array.isArray(data) && data.length > 0) {
                    payload = data;
                    break;
                  }
                }
              }
            } catch {}
          }
          if (!Array.isArray(payload) || payload.length === 0) {
            try {
              const apiResp = await fetchWithSessionRefresh(endpoint).catch(() => null);
              if (apiResp && apiResp.ok && !isHtmlResponse(apiResp)) {
                payload = await apiResp.json().catch(() => []);
              }
            } catch {}
          }
        } else {
          // 1. Thử resolveOfflineBundledResponse
          try {
            const bundledResp = await resolveOfflineBundledResponse(endpoint);
            if (bundledResp && bundledResp.ok && !isHtmlResponse(bundledResp)) {
              const data = await bundledResp.json().catch(() => []);
              if (Array.isArray(data) && data.length > 0) {
                payload = data;
              }
            }
          } catch {}

          // 2. Network API
          if (!Array.isArray(payload) || payload.length === 0) {
            try {
              const netResp = await fetchWithSessionRefresh(endpoint).catch(() => null);
              if (netResp && netResp.ok && !isHtmlResponse(netResp)) {
                const data = await netResp.json().catch(() => []);
                if (Array.isArray(data) && data.length > 0) {
                  payload = data;
                }
              }
            } catch {}
          }

          // 3. Fallback sang file tiếng Việt offline
          if (!Array.isArray(payload) || payload.length === 0) {
            const viCandidates = [
              `/offline-data/chapters/${encodeURIComponent(targetBookId)}.json`,
              `/offline-data/chapters/${encodeURIComponent(targetBookId.replace(/^book_/u, ''))}.json`,
              `/offline-data/chapters/book_${encodeURIComponent(targetBookId)}.json`
            ];
            for (const path of viCandidates) {
              try {
                const resp = await (path.startsWith('/offline-data/chapters-en/') ? fetchEnglishChapters(path) : fetch(path));
                if (resp.ok && !isHtmlResponse(resp)) {
                  const data = await resp.json().catch(() => []);
                  if (Array.isArray(data) && data.length > 0) {
                    payload = data;
                    break;
                  }
                }
              } catch {}
              try {
                const remoteUrl = resolveRemoteUrl(path);
                if (remoteUrl !== path) {
                  const resp = await fetch(remoteUrl);
                  if (resp.ok && !isHtmlResponse(resp)) {
                    const data = await resp.json().catch(() => []);
                    if (Array.isArray(data) && data.length > 0) {
                      payload = data;
                      break;
                    }
                  }
                }
              } catch {}
            }
          }
        }
      }

      let rows: Chapter[] = Array.isArray(payload)?payload:[payload as Chapter];
      let row = rows.find(r => r && (String(r.id) === String(chap.id) || Number(r.so_thu_tu) === Number(chap.so_thu_tu)));
      if (!row && rows.length === 1 && rows[0]?.noi_dung) row = rows[0];
      if (!row && rows[index]?.noi_dung && Number(rows[index]?.so_thu_tu) === Number(chap.so_thu_tu)) row = rows[index];
      if (!row && rows[index]?.noi_dung) row = rows[index];
      if(generation!==articleGeneration||article?.id!==targetBookId)return;
      if(!row || !row.noi_dung)return;
      chapters = chapters.map((c,i) => i===index ? {
        ...c,
        noi_dung: String(row.noi_dung||c.noi_dung||''),
        tieu_de: row.tieu_de || c.tieu_de,
        contentLoaded: true
      } : c);
    }catch{
      // fallback
    }finally{
      if(generation===articleGeneration&&article?.id===targetBookId)loadingChapterContent=false;
    }
  }
  async function loadReadingProgress(targetArticle:LibraryArticle,generation:number){
    if(!pdfSelectionReady || !readingClient || usesPdf(targetArticle))return;
    const principalToken=principalGuard.capture();
    try{
      const kind=targetArticle.hasTableOfContents||targetArticle.volumeCount>0?'book':'article';
      const progress=await readingClient.getProgress(kind,targetArticle.id)||(kind==='book'?await readingClient.getProgress('article',targetArticle.id):await readingClient.getProgress('book',targetArticle.id));
      if(generation!==articleGeneration||article?.id!==targetArticle.id||!principalGuard.isCurrent(principalToken))return;
      if(progress){
        pendingProgressResume=progress;
        progressRevision=progress.revision;
      }
      progressLoadSettled=true;
      await applyPendingTextResume(targetArticle,generation);
    }catch{
      if(generation===articleGeneration&&principalGuard.isCurrent(principalToken)){
        progressLoadSettled=true;
        await applyPendingTextResume(targetArticle,generation);
        notify(localizeUi('⚠️ Không thể đồng bộ vị trí đọc'));
      }
    }
  }
  function scheduleTextProgress(flush=false):void{
    if(!progressReadyForPrincipal)return;
    if(!article||showPdf||!scrollArea||!readingClient)return;
    if(chapters.length > 0 && chapterIndex === null) return;
    const available=Math.max(1,scrollArea.scrollHeight-scrollArea.clientHeight);
    const local=Math.min(1,Math.max(0,scrollArea.scrollTop/available));
    const chapterPart=chapters.length&&chapterIndex!==null?(chapterIndex+local)/chapters.length:local;
    const positionData:Record<string,unknown>={scrollTop:Math.round(scrollArea.scrollTop)};
    if(currentChapter?.id)positionData.chapterId=currentChapter.id;
    else if(chapterIndex!==null)positionData.chapterId=String(chapterIndex);
    if(chapterIndex!==null){
      positionData.chapterIdx=chapterIndex;
      if(currentChapter?.tieu_de)positionData.chapterTitle=currentChapter.tieu_de;
      positionData.chapterPercent=Math.round(local*100);
    }
    progressWriter.schedule({baseRevision:progressRevision,clientUpdatedAt:new Date().toISOString(),contentId:article.id,contentKind:readingContentKind,contentVersion,epoch:1,percent:Math.round(chapterPart*1000)/10,position:positionData,total:chapters.length||scrollArea.scrollHeight});
    if(flush)progressWriter.flush();
  }
  function normalizeBackground(value:string,isDark:boolean){return ['white','cream','gray','dark','purple'].includes(value)?value:(isDark?'dark':'cream')}
  async function registerView(articleId: string): Promise<number | null> {
    return recordArticleView(articleId);
  }
  function close(){
    scheduleTextProgress(true);
    progressSync.flush();
    void readingClient?.flush().catch(()=>{});
    stopTts();
    stopAutoScroll();
    pendingBookmarkResume=null;
    pendingProgressResume=null;
    showTocModal=false;
    if(lightboxSource)closeLightbox();
    releaseBodyScroll?.(); releaseBodyScroll = null;
    if (typeof document !== 'undefined') {
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) {
        const isDark = isDarkThemeActive();
        metaTheme.setAttribute('content', isDark ? '#15120d' : '#c8963e');
      }
    }
    previousFocus?.focus();
    onClose();
    if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('quangtu:reading-progress-updated'));
  }
  function keydown(event:KeyboardEvent){
    // Escape của dialog khác không được đóng reader chưa mở và tải lại tiến độ.
    if(!article||loginModalOpen)return;
    if(event.key==='Escape'){
      if(showTocModal){showTocModal=false;return}
      if(lightboxSource)closeLightbox();
      else close();
      return;
    }
    trapReaderFocus(event);
  }

  function resetPrivateReadingState():void{
    noticeCollapseScroll = null;
    quoteTargetId = null;
    quoteNavigationState = 'idle';
    progressWriter.cancel();
    articleGeneration+=1;
    pendingBookmarkResume=null;
    pendingProgressResume=null;
    progressRevision=0;
    progressLoadSettled=false;
    progressReadyForPrincipal=false;
    bookmarked=false;
    chapterIndex=null;
    showTocModal=false;
    lastReadChapterIndex=null;
    lastReadScrollTop=0;
    stopAutoScroll();
    stopTts();
    if(scrollArea){scrollArea.scrollTop=0;scrollArea.scrollLeft=0}
  }

  $effect(()=>{const activeArticle=article;if(!activeArticle)return;const generation=++articleGeneration;untrack(()=>{prepareQuoteNavigation();previousFocus=document.activeElement as HTMLElement;fontSize=Math.min(45,Math.max(13,Number(localStorage.getItem('tutam_read_fontsize')||15)||15));bold=localStorage.getItem('tutam_read_bold')==='1';fontFamily=localStorage.getItem('tutam_read_font')||'bookerly';lineHeight=Number(localStorage.getItem('tutam_read_line_height')||1.9)||1.9;textAlign=(localStorage.getItem('tutam_read_align')==='left'?'left':'justify');ttsSpeed=Number(localStorage.getItem('tutam_read_tts_speed')||1)||1;ttsVoice=localStorage.getItem('tutam_read_tts_voice')||'female';ttsController.setRate(ttsSpeed);ttsController.setVoice(ttsVoice);zenMode=false;zenScrollLastY=0;const isDark=isDarkThemeActive();background=getResolvedBackground(isDark);autoScrollSpeed=Number(localStorage.getItem('tutam_auto_scroll_speed')||0.5);const bookmark=bookmarkAdapter().find(activeArticle.id);bookmarked=Boolean(bookmark);pendingBookmarkResume=(activeArticle.pdfUrl&&!(activeArticle.hasTableOfContents||activeArticle.volumeCount>0))?null:bookmark;const cachedRow=initialTextProgress??readingClient?.cachedProgress().find((row)=>row.contentId===activeArticle.id&&(row.contentKind==='book'||row.contentKind==='article'||row.contentKind==='practice'))??null;pendingProgressResume=cachedRow;progressRevision=cachedRow?cachedRow.revision:0;progressLoadSettled=Boolean(cachedRow);progressReadyForPrincipal=false;chapters=[];chaptersReady=false;chapterIndex=null;showTocModal=false;lastReadChapterIndex=null;tocSearch='';viewCount=activeArticle.viewCount??null;stopAutoScroll();stopTts();if(scrollArea){scrollArea.scrollTop=0;scrollArea.scrollLeft=0}releaseBodyScroll ??= acquireScrollLock();void initializeReadingFormat(activeArticle,generation);void registerView(activeArticle.id).then((count)=>{if(count!==null&&generation===articleGeneration&&article?.id===activeArticle.id)viewCount=count}).catch(()=>{});tick().then(()=>{if(generation===articleGeneration)dialog?.focus()})});return()=>{stopAutoScroll();progressWriter.flush();if(generation===articleGeneration)articleGeneration+=1;releaseBodyScroll?.(); releaseBodyScroll = null;}});

  $effect(() => {
    if (typeof document === 'undefined') return;
    const isDark = isDarkThemeActive();
    background = getResolvedBackground(isDark);
  });

  $effect(() => {
    if (typeof document === 'undefined') return;
    if (article) {
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) {
        if (background === 'dark') {
          metaTheme.setAttribute('content', '#15120d');
        } else if (background === 'cream') {
          metaTheme.setAttribute('content', '#f4ecd8');
        } else if (background === 'gray') {
          metaTheme.setAttribute('content', '#e8e8e8');
        } else if (background === 'purple' && dialog) {
          metaTheme.setAttribute('content', getComputedStyle(dialog).backgroundColor);
        } else if (background === 'white') {
          metaTheme.setAttribute('content', '#ffffff');
        }
      }
    }
  });

  let previousReaderLocale = untrack(() => localeStore.current);
  $effect(() => {
    const currentLocale = localeStore.current;
    if (currentLocale !== previousReaderLocale) {
      previousReaderLocale = currentLocale;
      if (article) {
        untrack(() => {
          void loadSingleArticleEnglish(article, articleGeneration);
          if (chaptersReady) {
            void loadChapters(article, articleGeneration);
          }
        });
      }
    }
  });

  onMount(()=>{
    activitySession=normalizeActivitySession(session);
    readingClient=createReadingActivityClient(fetch,localStorage);
    readingClient.setSession(activitySession);
    if(article&&!pendingProgressResume){
      const cached=initialTextProgress??readingClient.cachedProgress().find((row)=>row.contentId===article.id&&(row.contentKind==='book'||row.contentKind==='article'||row.contentKind==='practice'))??null;
      if(cached){
        pendingProgressResume=cached;
        progressRevision=cached.revision;
        progressLoadSettled=true;
        if(chaptersReady)void applyPendingTextResume(article,articleGeneration);
      }
    }
    if(article)void loadReadingProgress(article,articleGeneration);
    const updateLoginModalState=(event:Event)=>{loginModalOpen=Boolean((event as CustomEvent<{open?:boolean}>).detail?.open)};
    const updateSession=(event:Event)=>{
      const next=(event as CustomEvent<ReaderSession>).detail;
      const nextSession=normalizeActivitySession(next);
      const principalChanged=principalGuard.transition(nextSession);
      if(principalChanged)resetPrivateReadingState();
      activitySession=nextSession;
      readingClient?.setSession(activitySession);
      if(article){
        const bookmark=bookmarkAdapter().find(article.id);
        bookmarked=bookmark!==null;
        pendingBookmarkResume=showPdf?null:bookmark;
        const generation=articleGeneration;
        if (principalChanged) void initializeReadingFormat(article, generation);
        else { if(!chaptersReady)void loadChapters(article,generation); void loadReadingProgress(article,generation); }
      }
    };
    const updateDownloadedReadingFormat = (event: Event) => {
      if (!article || (event as CustomEvent<{ documentId?: string }>).detail?.documentId !== article.id) return;
      const target = article;
      resetPrivateReadingState();
      chapters = []; chaptersReady = false;
      void initializeReadingFormat(target, articleGeneration);
    };
    window.addEventListener('quangtu:offline-pdf-changed', updateDownloadedReadingFormat);
    const onReaderPopState = () => {
      if (lightboxSource) {
        closeLightbox();
        return;
      }
      if (showTocModal) {
        showTocModal = false;
        return;
      }
      if (chapterIndex !== null) {
        const params = new URLSearchParams(window.location.search);
        const chapVal = params.get('chap');
        if (!chapVal) {
          void openChapter(null, 0, articleGeneration, false, false);
        } else {
          const targetIdx = parseInt(chapVal, 10) - 1;
          if (targetIdx >= 0 && targetIdx < chapters.length && targetIdx !== chapterIndex) {
            void openChapter(targetIdx, 0, articleGeneration, false, false);
          }
        }
      }
    };
    const onReaderBack = (event: Event) => {
      if (!article) return;
      event.preventDefault();
      back();
    };
    window.addEventListener('quangtu:reader-back', onReaderBack);
    document.addEventListener('visibilitychange', handleReaderVisibilityChange);
    window.addEventListener('popstate', onReaderPopState);
    window.addEventListener('quangtu:login-modal-state',updateLoginModalState);
    window.addEventListener(SESSION_CHANGE_EVENT,updateSession);
    return()=>{
      window.removeEventListener('quangtu:reader-back', onReaderBack);
      document.removeEventListener('visibilitychange', handleReaderVisibilityChange);
      window.removeEventListener('popstate', onReaderPopState);
      window.removeEventListener('quangtu:login-modal-state',updateLoginModalState);
      window.removeEventListener('quangtu:offline-pdf-changed', updateDownloadedReadingFormat);window.removeEventListener(SESSION_CHANGE_EVENT,updateSession);
    };
  });
  onDestroy(()=>{stopAutoScroll();clearBookImageUrls();progressWriter.flush();progressSync.flush();principalGuard.invalidate();void readingClient?.flush().catch(()=>{});ttsController.destroy();if(toastTimer)clearTimeout(toastTimer);if(toastFrame!==null)cancelAnimationFrame(toastFrame)});
</script>

<svelte:window onkeydown={keydown} />
{#if article}
  <div class="reader-overlay" role="presentation" inert={loginModalOpen} aria-hidden={loginModalOpen ? 'true' : undefined} onclick={(event)=>{if(event.target===event.currentTarget&&!loginModalOpen)close()}}>
    <div use:nativeSystemBarsSurface class={`reader-modal bg-${background}`} class:zen-mode={zenMode} class:pdf-reader={showPdf} role="dialog" aria-modal={loginModalOpen || lightboxSource ? 'false' : 'true'} aria-label={currentChapter?.tieu_de || article.title} tabindex="-1" bind:this={dialog} inert={loginModalOpen || Boolean(lightboxSource)} aria-hidden={loginModalOpen || lightboxSource ? 'true' : undefined}>
      {#if bookmarked}<button class="bookmark-ribbon" type="button" aria-label={localizeUi('Đi tới vị trí đã đánh dấu')} title={localizeUi('Nhấn để đến vị trí đã đánh dấu')} onclick={()=>void goToBookmark()}>
        <svg width="30" height="58" viewBox="0 0 30 58" aria-hidden="true">
          <defs><linearGradient id="reader-bookmark-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9a23c"/><stop offset="1" stop-color="#edbd58"/></linearGradient></defs>
          <path d="M0 0h30v58L15 48 0 58z" fill="url(#reader-bookmark-gradient)"/>
          <path d="m15 18 2.35 4.76 5.25.76-3.8 3.7.9 5.23L15 30l-4.7 2.45.9-5.23-3.8-3.7 5.25-.76z" fill="#fff"/>
        </svg>
      </button>{/if}
      <header class="reader-top-bar">
        <div class="reader-top-left">
          <button class="reader-back" type="button" onclick={back} aria-label={showTocModal ? t.reader.closeToc : chapterIndex !== null ? t.reader.backToToc : t.common.back} title={showTocModal ? t.reader.closeToc : chapterIndex !== null ? t.reader.backToTocTitle : t.common.back}>
            <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.6" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            <span class="reader-back-text">{chapterIndex !== null ? t.reader.backToToc : t.common.back}</span>
          </button>

        </div>
        {#if !showPdf}
          <div class="reader-top-actions">
            <div class="reader-top-font-group" role="group" aria-label={t.readerToolbar.fontSize}>
              <button
                type="button"
                class="reader-top-font-btn minus"
                aria-label={t.readerToolbar.decreaseFont}
                title={`${t.readerToolbar.decreaseFont} (A−)`}
                disabled={fontSize <= 13}
                onclick={() => font(-1)}
              >
                A−
              </button>
              <span class="reader-top-font-size" title={`${t.readerToolbar.fontSize}: ${fontSize}px`}>
                {fontSize}px
              </span>
              <button
                type="button"
                class="reader-top-font-btn plus"
                aria-label={t.readerToolbar.increaseFont}
                title={`${t.readerToolbar.increaseFont} (A+)`}
                disabled={fontSize >= 45}
                onclick={() => font(1)}
              >
                A+
              </button>
            </div>

            <div class="reader-top-font-select-wrap" title={t.readerToolbar.fontFamily}>
              <select
                class="reader-top-font-select"
                aria-label={t.readerToolbar.fontFamily}
                value={fontFamily}
                onchange={(e) => changeFontFamily(e.currentTarget.value)}
              >
                {#each fontOptions as f}
                  <option value={f.key}>{f.label}</option>
                {/each}
              </select>
              <span class="reader-top-font-select-label" aria-hidden="true">
                <svg class="font-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="4 7 4 4 20 4 20 7" />
                  <line x1="9" y1="20" x2="15" y2="20" />
                  <line x1="12" y1="4" x2="12" y2="20" />
                </svg>
                <span class="font-name-text">{currentFontLabel}</span>
                <svg class="font-chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </div>

            <button
              type="button"
              class="reader-top-scroll-btn"
              class:active={autoScrollActive}
              aria-pressed={autoScrollActive}
              aria-label={t.readerToolbar.autoScroll}
              title={t.readerToolbar.autoScroll}
              onclick={autoScroll}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                {#if autoScrollActive}<path d="M9 5v14m6-14v14" />{:else}<path d="M12 4v15m-5-5 5 5 5-5" />{/if}
              </svg>
            </button>

            <button
              type="button"
              class="reader-top-speak-btn"
              class:active={ttsActive}
              aria-pressed={ttsActive}
              aria-busy={ttsLoading}
              title={ttsLoading ? t.readerToolbar.loading : ttsActive ? t.readerToolbar.stop : t.readerToolbar.listen}
              aria-label={ttsLoading ? t.readerToolbar.loading : ttsActive ? t.readerToolbar.stop : t.readerToolbar.listen}
              onclick={speak}
            >
              {#if ttsLoading}
                <span class="speak-loading-spinner" aria-hidden="true"></span>
              {:else if ttsActive}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                  <rect x="5" y="5" width="14" height="14" rx="2.5" />
                </svg>
              {:else}
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              {/if}
            </button>

            <button
              type="button"
              class="reader-top-bookmark-btn"
              class:active={bookmarked}
              aria-pressed={bookmarked}
              title={bookmarked ? (localeStore.current === 'en' ? 'Remove bookmark' : 'Bỏ đánh dấu trang này') : (localeStore.current === 'en' ? 'Bookmark this page' : 'Đánh dấu trang này')}
              aria-label={bookmarked ? (localeStore.current === 'en' ? 'Remove bookmark' : 'Bỏ đánh dấu trang này') : (localeStore.current === 'en' ? 'Bookmark this page' : 'Đánh dấu trang này')}
              onclick={toggleBookmark}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill={bookmarked ? "currentColor" : "none"} stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
          </div>
        {/if}
      </header>
      {#if !showPdf}<ReaderToolbar scrollElement={scrollArea} mediaInfo={currentReaderMediaInfo} {fontSize} {bold} background={themeStore?.mode === 'auto' ? 'auto' : background} {fontFamily} {lineHeight} {textAlign} {ttsSpeed} {ttsVoice} {bookmarked} {ttsActive} ttsLoading={ttsLoading || preparingSpeech} {autoScrollActive} {autoScrollSpeed} onFont={font} onBold={()=>{bold=!bold;persistSettings()}} onBackground={changeBackground} onFontFamily={(value)=>{fontFamily=value;persistSettings()}} onLineHeight={(value)=>{lineHeight=value;persistSettings()}} onTextAlign={(value)=>{textAlign=value;persistSettings()}} onTtsSpeed={(value)=>{ttsSpeed=value;ttsController.setRate(value);persistSettings()}} onTtsVoice={(value)=>{ttsVoice=value;ttsController.setVoice(value);persistSettings()}} onBookmark={toggleBookmark} onSpeak={speak} onShare={share} onAutoScroll={autoScroll} onAutoScrollSpeed={changeAutoScrollSpeed} onNotify={notify} onClose={close}/>{/if}
      {#if experienceNoticeVisible}
        <ContentExperienceNotice contentId={article.id} />
      {/if}
      <div class={`reader-scroll bg-${background}`} role="region" aria-label={localeStore.current === 'en' ? 'Reading content' : 'Nội dung bài đọc'} bind:this={scrollArea} onscroll={()=>onReaderScroll()} onwheel={()=>{if(autoScrollActive)stopAutoScroll()}} ontouchstart={()=>{if(autoScrollActive)stopAutoScroll()}}>
        {#if showPdf}
          {#key article.id}
            <PdfCanvasReader {background} backgroundSelection={themeStore?.mode === 'auto' ? 'auto' : background} onBackground={changeBackground} targetAnnotationId={requestedAnnotationId} url={article.pdfUrl} articleId={article.id} title={article.title} category={article.category} categoryIcon={categoryIcon(article.category)} author={article.author} dateLabel={formatVietnamDateWithWeekday(article.publishedAt, localeStore.current)} {viewCount} authenticated={session.authenticated} session={activitySession} currentArticle={article} {articles} onShare={share} onNotify={notify} onOpenArticle={onOpen} onViewerScroll={handlePdfViewerScroll} />
          {/key}
        {:else}
          <article class="reader-body" style={`font-size:${fontSize}px`}>
            {#if chapterIndex===null}
              <div class="reader-meta">
                <span class="reader-category">{categoryIcon(article.category)} {getLocalizedCategory(article.category)}</span>
                {#if formatVietnamDateWithWeekday(article.publishedAt, localeStore.current)}
                  <time datetime={article.publishedAt}>{formatVietnamDateWithWeekday(article.publishedAt, localeStore.current)}</time>
                {/if}
                <span class="reader-author">{localizedAuthor}</span>
              {#if showReaderEnglishFallback}
                <p class="reader-en-fallback" role="status">English version is in progress. Showing Vietnamese original below — bundled offline in the app.</p>
              {:else if showReaderEnglishDraft}
                <p class="reader-en-fallback reader-en-draft" role="status">{ENGLISH_TRANSLATION_NOTICE}</p>
              {/if}
                <span class="reader-view-count">👁 {viewCount===null?'...':`${viewCount} ${localeStore.current === 'en' ? 'views' : 'lượt xem'}`}</span>
              </div>
              <h1 id="reader-title">{activeTitle}</h1>
              {#if lastReadChapterIndex !== null && chapters[lastReadChapterIndex]}
                <div class="reader-resume-banner">
                  <div class="reader-resume-info">
                    <span class="reader-resume-label">{t.reader.previouslyReading}</span>
                    <strong class="reader-resume-title">{t.reader.chapter} {lastReadChapterIndex + 1}: {getChapterTitle(chapters[lastReadChapterIndex], lastReadChapterIndex)}</strong>
                  </div>
                  <button type="button" class="reader-resume-btn" onclick={() => void openChapter(lastReadChapterIndex,lastReadScrollTop)}>
                    <span>{t.reader.resumeReading}</span>
                    <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </button>
                </div>
              {/if}
            {/if}
            {#if loadingChapters && chapterIndex === null}
              <div class="toc-loading-state" role="status">
                <span class="chapter-content-loading-dot"></span>
                <p style="margin: 8px 0; font-size: 13px; color: var(--muted);">{t.reader.tableOfContents}...</p>
              </div>
            {:else if isEbook && chapterIndex===null && chapters.length}
              <div class="toc">
                <div class="toc-header">
                  <div class="toc-header-title">
                    <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                    <strong>{t.reader.tocTitle}</strong>
                    <span class="toc-count">{chapters.length} {t.reader.tocArticlesCount}</span>
                  </div>
                  {#if chapters.length > 5}
                    <div class="toc-search-box">
                      <input
                        type="search"
                        class="toc-search-input"
                        placeholder={t.reader.tocSearchPlaceholder}
                        bind:value={tocSearch}
                        aria-label={t.reader.tocSearchAria}
                      />
                      {#if tocSearch}
                        <button type="button" class="toc-search-clear" onclick={() => tocSearch = ''} aria-label={t.reader.tocSearchClear}>×</button>
                      {/if}
                    </div>
                  {/if}
                </div>
                <div class="toc-list">
                  {#if filteredChapters.length === 0}
                    <p class="toc-empty">{t.reader.tocNoMatch.replace('{q}', tocSearch)}</p>
                  {:else}
                    {#each filteredChapters as { chapter, index, displayNumber } (index)}
                      <button class="toc-item" class:is-active={index === lastReadChapterIndex} type="button" onclick={()=>void openChapter(index)}>
                        <span class="toc-number" class:active-num={index === lastReadChapterIndex}>{displayNumber}</span>
                        <span class="toc-text">
                          <span class="toc-title-row">
                            <strong>{getChapterTitle(chapter, index)}</strong>
                            {#if index === lastReadChapterIndex}
                              <span class="toc-active-badge">{t.reader.tocReading}</span>
                            {/if}
                            {#if hasChapterVideo(chapter)}
                              <span class="toc-video-badge" title={localeStore.current === 'en' ? 'Teaching with video' : 'Bài pháp có video kèm theo'}>
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                  <path d="M4 5a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2v-3.333l3.414 1.707A1 1 0 0023 14.472V9.528a1 1 0 00-1.586-.895L18 10.333V7a2 2 0 00-2-2H4zm10 2v10H4V7h10z" />
                                </svg>
                                <span>Video</span>
                              </span>
                            {/if}
                          </span>
                          {#if chapter.tom_tat}<span>{cleanChapterSummary(chapter.tom_tat)}</span>{/if}
                        </span>
                        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                      </button>
                    {/each}
                  {/if}
                </div>
                <p class="toc-help">{t.reader.tocHelp}</p>
              </div>
            {:else if isEbook && chapterIndex===null && !chapters.length}
              <div class="toc-empty-state" role="status" style="text-align: center; padding: 28px 16px; background: rgba(0,0,0,0.02); border-radius: 12px; margin: 16px 0;">
                <p style="margin: 0 0 12px 0; font-size: 14px; color: var(--muted);">{t.reader.tocFailedToLoad}</p>
                <button type="button" class="reader-resume-btn" onclick={() => void loadChapters(article, articleGeneration)}>
                  <span>{t.reader.tocRetry}</span>
                </button>
              </div>
            {:else}

              {#if chapterIndex !== null && !hasSourceChapterHeading}
                <div class="reader-chapter-banner">
                  <h1 class="reader-chapter-banner-title">{activeTitle}</h1>
                </div>
              {/if}

              {#key `${article?.id}:${chapterIndex}`}
                <div class:bold class="reader-content" style={`--reader-font:${activeFontCss};--reader-lh:${lineHeight};--reader-align:${textAlign}`} role="document" bind:this={contentArea} use:readerImageAction use:savedContentImages use:fallbackReaderMedia>
                  {#if loadingChapterContent && chapterIndex !== null && chapters[chapterIndex] && !chapters[chapterIndex].contentLoaded}
                    <div class="chapter-content-loading" aria-label={localeStore.current === 'en' ? 'Loading content...' : 'Đang tải nội dung...'} role="status">
                      <span class="chapter-content-loading-dot"></span><span class="chapter-content-loading-dot"></span><span class="chapter-content-loading-dot"></span>
                      <span class="visually-hidden">{localeStore.current === 'en' ? 'Loading content...' : 'Đang tải nội dung...'}</span>
                    </div>
                  {:else}
                    {@html displayContent}
                  {/if}
                </div>
                {#if isQuangTuBook && currentChapterVideoFile}
                  <ReaderVideoDownload
                    filename={currentChapterVideoFile.filename}
                    bytes={currentChapterVideoFile.remoteBytes}
                    onNotify={notify}
                    onUrlReady={(file, blobUrl) => {
                      if (blobUrl) quangTuVideoBlobUrls.set(file, blobUrl);
                      else quangTuVideoBlobUrls.delete(file);
                      quangTuVideoBlobUrls = new Map(quangTuVideoBlobUrls);
                      void refreshMediaStats();
                    }}
                  />
                {/if}
              {/key}
              <ReadingAnnotations targetAnnotationId={quoteTargetId} contentElement={contentArea} contentTitle={article.title} contentId={article.id} contentKind={readingContentKind} sectionId={currentChapter?.id || 'root'} contentVersion={`${contentVersion || 'unversioned'}:${currentChapter?.id || 'root'}`} session={activitySession} onNotify={notify} />
              {#if chapters.length && chapterIndex !== null}
                <nav class="reader-chapter-footer" aria-label={t.reader.nextChapterShort}>
                  <div class="chapter-footer-nav">
                    {#if chapterIndex !== null && chapterIndex > 0}
                      <button
                        type="button"
                        class="chapter-footer-btn prev"
                        onclick={() => chapterIndex !== null && void openChapter(chapterIndex - 1)}
                        aria-label={t.reader.prevChapterShort}
                      >
                        <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
                        <div class="footer-btn-content">
                          <span class="footer-btn-sub">{t.reader.prevChapterShort}</span>
                          <span class="footer-btn-title">
                            {getChapterTitle(chapters[(chapterIndex ?? 1) - 1], (chapterIndex ?? 1) - 1)}
                            {#if hasChapterVideo(chapters[(chapterIndex ?? 1) - 1])}
                              <span class="toc-video-badge mini">Video</span>
                            {/if}
                          </span>
                        </div>
                      </button>
                    {:else}
                      <div class="chapter-footer-placeholder"></div>
                    {/if}

                    <button
                      type="button"
                      class="chapter-footer-toc-btn"
                      onclick={() => void openChapter(null)}
                      aria-label={t.reader.tableOfContents}
                      title={t.reader.backToTocTitle}
                    >
                      <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                      <span>{t.reader.backToToc}</span>
                    </button>

                    {#if chapterIndex !== null && chapterIndex < chapters.length - 1}
                      <button
                        type="button"
                        class="chapter-footer-btn next"
                        onclick={() => chapterIndex !== null && void openChapter(chapterIndex + 1)}
                        aria-label={t.reader.nextChapterShort}
                      >
                        <div class="footer-btn-content">
                          <span class="footer-btn-sub">{t.reader.nextChapterShort}</span>
                          <span class="footer-btn-title">
                            {getChapterTitle(chapters[(chapterIndex ?? 0) + 1], (chapterIndex ?? 0) + 1)}
                            {#if hasChapterVideo(chapters[(chapterIndex ?? 0) + 1])}
                              <span class="toc-video-badge mini">Video</span>
                            {/if}
                          </span>
                        </div>
                        <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
                      </button>
                    {:else}
                      <div class="chapter-footer-placeholder"></div>
                    {/if}
                  </div>
                </nav>
              {/if}
            {/if}
            {#if chapterIndex===null}
              {#if article.tags.length}<div class="reader-tags" aria-label={localeStore.current === 'en' ? 'Article topics' : 'Chủ đề bài viết'}>{#each article.tags as tag}<span class="reader-tag">{tag}</span>{/each}</div>{/if}
              {#if externalUrl}<div class="reader-action-bar"><a class="reader-external-action" href={externalUrl} target="_blank" rel="noopener noreferrer">{localeStore.current === 'en' ? 'Read full article' : 'Xem bài đầy đủ'}<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/></svg></a></div>{/if}
              <MostViewedArticles currentArticle={article} {articles} onOpen={onOpen} />
              <CommentsPanel articleId={article.id} />
            {/if}
          </article>
        {/if}
      </div>

      {#if showTocModal}
        <div
          class="toc-modal-backdrop"
          role="presentation"
          onclick={(e) => { if (e.target === e.currentTarget) showTocModal = false; }}
          onkeydown={(e) => { if (e.key === 'Escape') showTocModal = false; }}
        >
          <div
            data-dialog-glass class="toc-modal-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t.reader.tocBookTitle}
          >
            <div class="toc-modal-header">
              <div class="toc-modal-title">
                <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" viewBox="0 0 24 24" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                <h3>{t.reader.tocBookTitle}</h3>
                <span class="toc-modal-count">{chapters.length} {t.reader.tocArticlesCount}</span>
              </div>
              <button
                type="button"
                class="toc-modal-close"
                onclick={() => showTocModal = false}
                aria-label={t.reader.closeToc}
              >
                <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div class="toc-modal-search">
              <input
                type="search"
                class="toc-modal-input"
                placeholder={t.reader.tocSearchPlaceholder}
                bind:value={tocSearch}
                aria-label={t.reader.tocSearchAria}
              />
              {#if tocSearch}
                <button type="button" class="toc-modal-clear" onclick={() => tocSearch = ''} aria-label={t.reader.tocSearchClear}>×</button>
              {/if}
            </div>

            <div class="toc-modal-list">
              {#if filteredChapters.length === 0}
                <p class="toc-empty">{t.reader.tocNoMatch.replace('{q}', tocSearch)}</p>
              {:else}
                {#each filteredChapters as { chapter, index, displayNumber } (index)}
                  <button
                    class="toc-modal-item"
                    class:is-active={chapterIndex === index}
                    type="button"
                    onclick={() => {
                      showTocModal = false;
                      void openChapter(index);
                    }}
                  >
                    <span class="toc-modal-num" class:active-num={chapterIndex === index}>{displayNumber}</span>
                    <div class="toc-modal-text">
                      <div class="toc-modal-item-title">
                        <strong>{getChapterTitle(chapter, index)}</strong>
                        {#if chapterIndex === index}
                          <span class="toc-active-badge">{t.reader.tocReading}</span>
                        {/if}
                        {#if hasChapterVideo(chapter)}
                          <span class="toc-video-badge mini">Video</span>
                        {/if}
                      </div>
                      {#if chapter.tom_tat}
                        <span class="toc-modal-sub">{cleanChapterSummary(chapter.tom_tat)}</span>
                      {/if}
                    </div>
                    <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
                  </button>
                {/each}
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </div>
    {#if lightboxSource}<ReaderImageLightbox source={lightboxSource} alt={lightboxAlt} onClose={closeLightbox}/>{/if}
  </div>
{/if}

{#if showMediaModal && currentReaderMediaInfo}
  <ReaderMediaModal
    title={currentReaderMediaInfo.title}
    mediaType={currentReaderMediaInfo.type}
    count={currentReaderMediaInfo.count}
    totalCount={currentReaderMediaInfo.total}
    cachedBytes={currentReaderMediaInfo.cachedBytes}
    totalBytes={currentReaderMediaInfo.totalBytes}
    isBusy={isMediaModalBusy}
    progressPercent={mediaModalProgress}
    errorMessage={mediaModalError}
    onDownloadAll={handleMediaModalDownloadAll}
    onClearAll={handleMediaModalClearAll}
    onClose={() => {
      showMediaModal = false;
      mediaModalError = '';
      if (article?.id) rememberMediaPrompt(article.id.replace(/^book_/u, ''));
    }}
  />
{/if}

<ReaderToast message={toastMessage} visible={toastVisible} />

<style>
  .reader-modal{position:relative}
  .bookmark-ribbon{position:absolute;top:0;right:70px;z-index:30;width:30px;height:58px;padding:0;border:0;background:transparent;filter:drop-shadow(0 5px 7px rgba(115,70,18,.28));cursor:pointer;animation:bookmarkRibbonDrop .4s cubic-bezier(.34,1.4,.64,1)}
  .bookmark-ribbon svg{display:block}
  .bookmark-ribbon:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 48%,transparent);outline-offset:3px}
  @keyframes bookmarkRibbonDrop{from{opacity:0;transform:translateY(-32px)}to{opacity:1;transform:translateY(0)}}
  .reader-en-fallback{margin:8px 0 0;padding:8px 12px;border:1px solid var(--border2);border-radius:10px;background:var(--bg2);color:var(--text2);font-size:var(--font-size-body);line-height:1.5;text-align:center}
  .reader-overlay{position:fixed;inset:0;z-index:2000;display:grid;place-items:stretch;padding:0;background:rgba(30,20,10,.68);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px)}
  .reader-modal{display:flex;width:100%;height:100dvh;overflow:hidden;flex-direction:column;border-radius:0;background:var(--card);animation:readerModalUp .28s cubic-bezier(.34,1.2,.64,1)}
  @keyframes readerModalUp{from{opacity:0;transform:translateY(24px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
  
  /* Theme variables applied to the entire reader modal */
  .reader-modal.bg-white{--bg:#fff;--bg2:#f7f7f7;--bg3:#eee;--card:#fff;--text:#1c1a15;--text2:#333;--muted:#666;--border:#ccc;--border2:#e2e2e2;--gold:#b37d22;--gold-light:#fdfaf3;--gold-muted:#e6dac3;--brown:#2e241c;background:#fff;color:#1c1a15}
  .reader-modal.bg-cream{--bg:#f4ecd8;--bg2:#eee2ca;--bg3:#e4d6bc;--card:#f7efde;--text:#33271f;--text2:#403126;--muted:#675548;--border:#9b8069;--border2:#c7b39a;--gold:#b37d22;--gold-light:#fbf3e4;--gold-muted:#e1cfad;--brown:#4a3525;background:#f4ecd8;color:#33271f}
  .reader-modal.bg-gray{--bg:#e8e8e8;--bg2:#dedede;--bg3:#d2d2d2;--card:#e8e8e8;--text:#222;--text2:#333;--muted:#666;--border:#bbb;--border2:#ccc;--gold:#b37d22;--gold-light:#f0ece3;--gold-muted:#d9cfbc;--brown:#333;background:#e8e8e8;color:#222}
  .reader-modal.bg-dark{--bg:#15120d;--bg2:#1c1813;--bg3:#241e17;--card:#15120d;--text:#ede8df;--text2:#cfc8be;--muted:#8e8477;--border:#3a3227;--border2:#28221a;--gold:#d4a84b;--gold-light:#221c13;--gold-muted:#3a2e1d;--brown:#f5eedf;background:#15120d;color:#ede8df}

  /* Compact, unified top navigation header */
  .reader-top-bar{position:relative;z-index:25;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;width:100%;min-height:50px;height:50px;padding:0 max(14px,env(safe-area-inset-right,0px)) 0 max(14px,env(safe-area-inset-left,0px));background:var(--bg2);border-bottom:1px solid var(--border2);transition:transform .24s cubic-bezier(.4,0,.2,1),opacity .24s ease,max-height .24s ease,border-color .24s ease}
  .reader-modal.zen-mode .reader-top-bar{transform:translateY(-100%);opacity:0;pointer-events:none;max-height:0!important;min-height:0!important;padding-top:0!important;padding-bottom:0!important;border-bottom-width:0!important;border-bottom-color:transparent!important;overflow:hidden!important;margin:0!important}
  .reader-top-left{display:inline-flex;align-items:center;gap:8px;flex-shrink:0}
  .reader-back{display:inline-flex;align-items:center;gap:8px;min-height:36px;height:36px;padding:0 16px 0 12px;border:1px solid color-mix(in srgb,var(--gold) 20%,transparent);border-radius:18px;background:color-mix(in srgb,var(--gold) 9%,transparent);color:var(--gold);cursor:pointer;font:inherit;font-size:15px;font-weight:700;text-align:left;transition:background-color .15s,color .15s,transform .12s}
  .reader-back svg{flex-shrink:0;width:22px;height:22px}
  .reader-back-text{font-weight:700;letter-spacing:0.2px}
  .reader-back:hover{background:color-mix(in srgb,var(--gold) 18%,transparent);color:var(--brown)}
  .reader-back:active{transform:scale(.97)}
  .reader-back:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 40%,transparent);outline-offset:1px}

  /* Quick top actions: only visible on mobile, hidden on desktop */
  .reader-top-actions{display:none}
  .reader-top-font-group{display:inline-flex;align-items:center;height:34px;box-sizing:border-box;padding:0 2px;border:1.5px solid var(--border);border-radius:17px;background:var(--card);box-shadow:0 1px 3px rgba(0,0,0,.04)}
  .reader-top-font-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:14px;background:transparent;color:var(--text);cursor:pointer;font:700 11.5px var(--font-app);line-height:1;transition:background .15s,color .15s,transform .12s}
  .reader-top-font-btn:hover:not(:disabled){background:var(--gold-light);color:var(--gold)}
  .reader-top-font-btn:active:not(:disabled){transform:scale(.92)}
  .reader-top-font-btn:disabled{opacity:.35;cursor:not-allowed}
  .reader-top-font-size{display:inline-flex;align-items:center;justify-content:center;min-width:32px;height:16px;line-height:16px;padding:0 3px;border-left:1px solid var(--border2);border-right:1px solid var(--border2);text-align:center;font-size:11px;font-weight:700;color:var(--gold);font-variant-numeric:tabular-nums;user-select:none}
  .reader-top-font-select-wrap{position:relative;display:inline-flex;align-items:center;height:34px;box-sizing:border-box;border:1.5px solid var(--border);border-radius:17px;background:var(--card);box-shadow:0 1px 3px rgba(0,0,0,.04);cursor:pointer;transition:border-color .15s,background .15s,transform .12s}
  .reader-top-font-select-wrap:hover{border-color:var(--gold);background:var(--gold-light)}
  .reader-top-font-select-wrap:active{transform:scale(.95)}
  .reader-top-font-select{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;z-index:2;-webkit-appearance:none;appearance:none}
  .reader-top-font-select-label{display:inline-flex;align-items:center;gap:4px;padding:0 9px 0 8px;font:600 11.5px var(--font-app);color:var(--text);pointer-events:none;white-space:nowrap;user-select:none}
  .reader-top-font-select-label .font-icon{color:var(--gold);flex-shrink:0}
  .reader-top-font-select-label .font-name-text{font-weight:600;letter-spacing:-0.2px}
  .reader-top-font-select-label .font-chevron{color:var(--muted);flex-shrink:0}
  .reader-top-font-select-wrap:hover .font-chevron{color:var(--gold)}
  :is(.reader-top-speak-btn,.reader-top-scroll-btn){display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;min-width:34px;padding:0;border:1.5px solid var(--border);border-radius:50%;background:var(--card);color:var(--text2);cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.04);transition:border-color .15s,background .15s,color .15s,transform .12s;flex-shrink:0}
  :is(.reader-top-speak-btn,.reader-top-scroll-btn) svg{width:16px;height:16px;display:block}
  :is(.reader-top-speak-btn,.reader-top-scroll-btn):hover{border-color:var(--gold);background:var(--gold-light);color:var(--brown)}
  :is(.reader-top-speak-btn,.reader-top-scroll-btn):active{transform:scale(.92)}
  :is(.reader-top-speak-btn,.reader-top-scroll-btn).active{border-color:var(--gold);background:var(--gold);color:#fff;box-shadow:0 2px 8px color-mix(in srgb,var(--gold) 35%,transparent)}
  :global([data-theme='dark']) :is(.reader-top-speak-btn,.reader-top-scroll-btn).active{color:#181410}
  .speak-loading-spinner{display:inline-block;width:14px;height:14px;border:2px solid color-mix(in srgb,var(--gold) 30%,transparent);border-top-color:var(--gold);border-radius:50%;animation:speakSpin .6s linear infinite}
  @keyframes speakSpin{to{transform:rotate(360deg)}}
  .reader-top-bookmark-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;min-width:34px;padding:0;border:1.5px solid var(--border);border-radius:50%;background:var(--card);color:var(--text2);cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.04);transition:border-color .15s,background .15s,color .15s,transform .12s;flex-shrink:0}
  .reader-top-bookmark-btn svg{width:16px;height:16px;display:block}
  .reader-top-bookmark-btn:hover{border-color:var(--gold);background:var(--gold-light);color:var(--brown)}
  .reader-top-bookmark-btn:active{transform:scale(.92)}
  .reader-top-bookmark-btn.active{border-color:var(--gold);background:var(--gold);color:#fff;box-shadow:0 2px 8px color-mix(in srgb,var(--gold) 35%,transparent)}
  :global([data-theme='dark']) .reader-top-bookmark-btn.active{color:#181410}

  /* Bottom chapter navigation */
  .reader-chapter-footer{margin-top:36px;padding-top:24px;border-top:1.5px solid var(--border2)}
  .chapter-footer-nav{display:flex;align-items:stretch;justify-content:space-between;gap:12px}
  .chapter-footer-placeholder{flex:1;min-width:0}
  .chapter-footer-btn{display:flex;flex:1;min-width:0;min-height:54px;align-items:center;gap:12px;padding:12px 18px;border:2px solid var(--border);border-radius:14px;background:var(--bg2);color:var(--text);cursor:pointer;text-align:left;transition:all .18s ease;box-shadow:0 2px 6px rgba(0,0,0,.04)}
  .chapter-footer-btn.prev{justify-content:flex-start}
  .chapter-footer-btn.next{justify-content:flex-end;text-align:right}
  .chapter-footer-btn:hover{border-color:var(--gold);background:var(--gold-light);color:var(--brown);box-shadow:0 4px 14px color-mix(in srgb,var(--gold) 18%,transparent);transform:translateY(-2px)}
  .chapter-footer-btn:active{transform:scale(.98)}
  .chapter-footer-btn svg{flex-shrink:0;color:var(--gold)}
  .footer-btn-content{display:flex;flex-direction:column;min-width:0;overflow:hidden}
  .footer-btn-sub{font-size:var(--font-size-meta);font-weight:700;color:var(--gold);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:2px}
  .footer-btn-title{font-size:var(--font-size-label);font-weight:700;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .chapter-footer-toc-btn{display:flex;align-items:center;justify-content:center;gap:6px;min-height:54px;padding:0 18px;border:1.5px solid var(--border);border-radius:14px;background:var(--bg2);color:var(--muted);cursor:pointer;font-size:var(--font-size-label);font-weight:700;white-space:nowrap;transition:all .18s ease}
  .chapter-footer-toc-btn:hover{border-color:var(--gold);background:var(--gold-light);color:var(--brown);transform:translateY(-2px)}
  .chapter-footer-toc-btn:active{transform:scale(.98)}
  @media(max-width:600px){
    .chapter-footer-nav{flex-direction:column;gap:10px}
    .chapter-footer-placeholder{display:none}
    .chapter-footer-btn{min-height:50px;padding:10px 14px;width:100%}
    .chapter-footer-btn.prev{justify-content:flex-start}
    .chapter-footer-btn.next{justify-content:space-between;text-align:left}
    .chapter-footer-toc-btn{order:3;min-height:44px;width:100%}
  }

  .reader-scroll{display:flex;min-height:0;flex:1;overflow:auto;flex-direction:column;overscroll-behavior:contain;transition:background-color .24s ease-out,color .24s ease-out}
  .reader-body{width:100%;max-width:820px;margin:0 auto;padding:40px 30px 72px;font-family:var(--font-app);line-height:1.9}
  .reader-meta{display:flex;align-items:center;gap:10px;margin-bottom:14px;color:var(--muted);font-family:var(--font-app);font-size:var(--font-size-meta);flex-wrap:wrap}
  .reader-category{padding:4px 11px;border-radius:20px;background:var(--gold-muted);color:var(--brown);font-size:var(--font-size-meta);font-weight:700;letter-spacing:1.5px;text-transform:uppercase}
  .reader-author{margin-left:auto;color:var(--gold);font-weight:500}
  .reader-view-count{padding:3px 9px;border:1px solid var(--border2);border-radius:12px;background:var(--bg2);color:var(--muted);font-size:11px;font-weight:500;white-space:nowrap}
  .reader-body h1{margin:0 0 18px;color:inherit;font-family:var(--font-app);font-size:clamp(20px,2.8vw,28px);font-weight:700;letter-spacing:-.4px;line-height:1.3;text-align:center;text-transform:uppercase}
  .reader-content{font-size:inherit;line-height:1.9;white-space:normal;-webkit-touch-callout:none}
  .reader-content.bold,.reader-content.bold :global(*){font-weight:700!important}
  .reader-content :global(span),
  .reader-content :global(p),
  .reader-content :global(div),
  .reader-content :global(font){color:inherit}
  /* Màu nhập theo nền giấy đang đọc; giữ nguyên HTML lưu trữ và trình biên tập. */
  .reader-content :global(:where([style*='color']:not(mark[data-reading-annotation]))){color:inherit!important;background-color:transparent!important}
  .reader-modal.bg-dark .reader-content :global(*){color:inherit!important}
  .reader-modal.bg-dark .reader-content :global(strong){color:var(--gold,#d4a84b)!important}
  .reader-modal.bg-dark .reader-content :global(em){color:var(--text)!important}
  .reader-modal .reader-content :global(mark[data-reading-annotation]),
  .reader-modal .reader-content :global(mark[data-reading-annotation] *){color:var(--highlight-ink)!important}
  .reader-content :global(p){margin:0 0 .38em!important;white-space:normal}
  .reader-content :global(p:empty){display:none!important}
  .reader-content :global(h1),.reader-content :global(h2),.reader-content :global(h3){margin:1.1em 0 .4em!important}
  .reader-content :global(strong){color:var(--brown);font-weight:700}
  .reader-content :global(em){color:var(--text)}
  .reader-content :global(img){display:block;max-width:100%;height:auto;margin:12px 0;border-radius:8px;cursor:zoom-in;transition:transform .2s}
  .reader-content :global(img:hover){transform:scale(1.01)}
  .reader-content :global(img:focus-visible){outline:3px solid var(--gold);outline-offset:3px}
  .reader-content :global(.reader-video-wrapper){position:relative;margin:22px auto 26px;max-width:100%;text-align:center}
  .reader-content :global(video),.reader-content :global(.reader-video){display:block;width:100%;max-width:640px;margin:0 auto;border-radius:12px;border:1.5px solid var(--gold-muted);box-shadow:0 4px 16px rgba(0,0,0,0.12);background:#000;outline:none}
  .reader-content :global(video:focus-visible),.reader-content :global(.reader-video:focus-visible){outline:3px solid var(--gold);outline-offset:3px}
  .reader-content :global(.tt-content__line){display:block;margin-bottom:.15em;text-align:justify;text-align-last:left}
  .reader-content :global(.tt-content__line--center){text-align:center;text-align-last:center}
  .reader-content :global(.tt-content__line--right){text-align:right;text-align-last:right}
  .reader-content :global(.tt-content__gap){height:.38em!important}
  .reader-content :global(.tt-converted-book){overflow-wrap:anywhere}
  .reader-content :global(.tt-converted-book p){margin:0 0 1em!important}
  .reader-content :global(.tt-converted-book strong),.reader-content :global(.tt-converted-book em){color:inherit}
  .reader-content :global(.tt-converted-book .source-heading){text-align:center;font-weight:700}
  .reader-content :global(.tt-converted-book .verse){text-align:center}
  .reader-content :global(.tt-converted-book .source-dedication){text-align:right}
  .reader-content :global(.tt-converted-book .footnote){padding:calc(var(--space-page)*.8);margin:calc(var(--space-page)*.9) 0 calc(var(--space-page)*1.2);background:var(--gold-light);border-inline-start:3px solid var(--gold);border-radius:0 var(--radius) var(--radius) 0;font-size:.9em;line-height:1.75}
  .reader-content :global(.tt-converted-book .footnote p){text-align:var(--reader-align,justify)}
  .reader-content :global(.tt-converted-book .footnote p:last-child){margin:0!important}
  .reader-content :global(.tt-converted-book .note-label){font:700 var(--font-size-meta)/1.5 var(--font-app);color:var(--brown);margin:0 0 calc(var(--space-page)*.4)}
  .reader-content :global(.tt-converted-book .footnote sup){vertical-align:baseline}
  .reader-content :global(.tt-converted-book .book-paragraph sup){font-size:.7em;line-height:0;color:var(--brown);font-weight:700}
  .reader-content :global(.tt-converted-book figure){margin:var(--space-page) 0;text-align:center}
  .reader-content :global(.tt-converted-book figure img){margin:auto;max-width:100%;max-height:none;height:auto;border-radius:0}
  .reader-content :global(.tt-converted-book .boxed){padding:calc(var(--space-page)*.8);background:var(--gold-light);border:1px solid var(--border);border-radius:var(--radius)}
  .reader-content :global(.tt-converted-book .boxed p:last-child){margin:0!important}
  .reader-content :global(.tt-converted-book .table-scroll){overflow:auto}
  .reader-content :global(.tt-converted-book table){border-collapse:collapse;width:100%;font-size:.85em;table-layout:fixed}
  .reader-content :global(.tt-converted-book th),.reader-content :global(.tt-converted-book td){padding:calc(var(--space-page)*.4);border:1px solid var(--border);vertical-align:top;text-align:left}
  .reader-content :global(.tt-converted-book th){background:var(--bg3)}
  @media(max-width:760px){
    .reader-content :global(.tt-converted-book .footnote){padding:calc(var(--space-page)*.6)}
    .reader-content :global(.tt-converted-book table){font-size:.8em}
    .reader-content :global(.tt-converted-book th),.reader-content :global(.tt-converted-book td){padding:calc(var(--space-page)*.3)}
  }
  .reader-content :global(.tt-converted-book img.tt-inline-glyph),.reader-content :global(.tt-converted-book img.source-ornament){display:inline-block;width:auto;height:1em;max-width:none;margin:0;border-radius:0;vertical-align:text-bottom;cursor:inherit;transform:none}
  .reader-content :global(.tt-converted-book figure.source-calligraphy){width:10%;margin:0 0 1em auto}
  .reader-content :global(.tt-converted-book figure.source-calligraphy img){width:100%;height:auto;margin:0}
  .reader-content :global(.tt-converted-book img.tt-ornament){display:block;max-width:100%;height:auto;margin:.6em auto;border-radius:0;cursor:inherit;transform:none}
  .reader-tags{display:flex;gap:7px;flex-wrap:wrap;margin-top:22px;padding-top:16px;border-top:1px solid var(--border2);font-family:var(--font-app)}
  .reader-tag{padding:4px 11px;border:1px solid var(--border2);border-radius:20px;background:var(--bg2);color:var(--muted);font-size:var(--font-size-meta)}
  .reader-action-bar{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:18px;font-family:var(--font-app)}
  .reader-external-action{display:inline-flex;min-height:38px;align-items:center;gap:6px;padding:7px 14px;border:1.5px solid var(--border);border-radius:20px;background:var(--bg2);color:var(--text2);font-size:var(--font-size-label);font-weight:600;text-decoration:none;transition:border-color .15s,background-color .15s,color .15s}
  .reader-external-action:hover{border-color:var(--gold);background:var(--gold-light);color:var(--brown)}
  .reader-external-action:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 40%,transparent);outline-offset:2px}
  .reader-body :global(.comments){margin-top:36px}
  
  .toc{overflow:hidden;margin:0 0 24px;border:1.5px solid var(--gold-muted);border-radius:12px;background:var(--gold-light);font-family:var(--font-app)}
  .toc-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:10px 14px;border-bottom:1px solid color-mix(in srgb,var(--gold) 20%,transparent);background:var(--gold-muted);color:var(--brown);font-size:var(--font-size-label);font-weight:700}
  .toc-header-title{display:flex;align-items:center;gap:8px}
  .toc-count{margin-left:auto;padding:2px 8px;border-radius:10px;background:color-mix(in srgb,var(--gold) 15%,transparent);color:var(--gold);font-size:11px;font-weight:600}
  .toc-search-box{position:relative;display:flex;align-items:center;min-width:160px;max-width:220px;flex:1}
  .toc-search-input{width:100%;height:28px;padding:3px 24px 3px 9px;border:1px solid color-mix(in srgb,var(--gold) 40%,transparent);border-radius:14px;background:var(--card);color:var(--text);font:inherit;font-size:16px;outline:none;transition:border-color .15s,box-shadow .15s}
  .toc-search-input:focus{border-color:var(--gold);box-shadow:0 0 0 2px color-mix(in srgb,var(--gold) 25%,transparent);background:var(--card)}
  .toc-search-clear{position:absolute;right:5px;top:50%;transform:translateY(-50%);width:16px;height:16px;display:flex;align-items:center;justify-content:center;border:0;background:transparent;color:var(--muted);cursor:pointer;font-size:13px;font-weight:700;line-height:1}
  .toc-search-clear:hover{color:var(--text)}
  .toc-empty{margin:14px 0;color:var(--muted);font-size:var(--font-size-body);text-align:center;font-style:italic}
  .toc-list{display:flex;flex-direction:column;gap:2px;padding:6px 8px}
  .toc-item{display:flex;width:100%;align-items:center;gap:10px;padding:9px 10px;border:0;border-radius:8px;background:transparent;color:var(--text);cursor:pointer;font:inherit;text-align:left;transition:background .15s}
  .toc-item:hover{background:color-mix(in srgb,var(--gold) 12%,transparent)}
  .toc-item>svg{flex-shrink:0;color:var(--muted)}
  .toc-number{display:flex;width:24px;height:24px;flex-shrink:0;align-items:center;justify-content:center;border-radius:50%;background:var(--gold);color:#fff;font-size:11px;font-weight:700;line-height:1}
  .toc-text{display:flex;min-width:0;flex:1;flex-direction:column;gap:2px}
  .toc-text strong{color:var(--text);font-size:var(--font-size-body);font-weight:600;line-height:1.3}
  .toc-title-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .toc-video-badge{display:inline-flex;align-items:center;gap:3.5px;padding:1.5px 6.5px;border-radius:10px;background:rgba(220,38,38,.09);color:#dc2626;border:1px solid rgba(220,38,38,.25);font-size:var(--font-size-meta);font-weight:700;line-height:1.2;letter-spacing:.2px;vertical-align:middle;flex-shrink:0}
  .toc-video-badge svg{flex-shrink:0}
  .toc-video-badge.mini{padding:1px 5px;font-size:var(--font-size-meta);margin-left:4px}
  :root[data-theme='dark'] .toc-video-badge{background:rgba(239,68,68,.18);color:#f87171;border-color:rgba(239,68,68,.35)}
  .toc-text>span:not(.toc-title-row){overflow:hidden;color:var(--muted);font-size:var(--font-size-meta);line-height:1.4;text-overflow:ellipsis;white-space:nowrap}
  .toc-help{margin:0;padding:8px 14px 12px;color:var(--muted);font-size:var(--font-size-meta);text-align:center}

  /* Ultra-optimized mobile header and reader space with Safe Area Inset support */
  @media(max-width:768px){
    .reader-top-bar{
      min-height: calc(48px + var(--app-safe-top,env(safe-area-inset-top,0px)));
      height: calc(48px + var(--app-safe-top,env(safe-area-inset-top,0px)));
      padding: var(--app-safe-top,env(safe-area-inset-top,0px)) max(env(safe-area-inset-right, 0px), 12px) 0 max(env(safe-area-inset-left, 0px), 12px);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      box-sizing: border-box;
    }
    .reader-back{display:inline-flex;align-items:center;justify-content:center;width:var(--touch-target-size);height:var(--touch-target-size);min-width:var(--touch-target-size);padding:0;border:1px solid color-mix(in srgb,var(--gold) 25%,transparent);border-radius:50%;background:color-mix(in srgb,var(--gold) 9%,transparent);color:var(--gold);flex-shrink:0}
    .reader-back svg{width:20px;height:20px}
    .reader-back-text{display:none!important}


    .reader-modal.zen-mode .reader-top-bar{
      opacity: 0 !important;
      pointer-events: none !important;
      transform: translateY(-100%) !important;
    }

    .reader-body{
      padding: 12px 16px max(calc(110px + env(safe-area-inset-bottom, 0px)), 110px);
    }
    .reader-body h1{font-size:19px;margin-bottom:12px}
    .reader-meta{gap:6px;margin-bottom:10px}
    .reader-author{margin-left:0}
    .toc-header{padding:8px 12px;font-size:var(--font-size-label)}
    .toc-item{padding:7px 8px}
    .toc-text strong{font-size:var(--font-size-body)}
    .toc-text>span{font-size:var(--font-size-meta)}
    .reader-top-left{display:inline-flex;align-items:center;gap:6px;flex-shrink:0}
    .reader-top-actions{
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      margin-left: auto;
      margin-right: 0;
      flex-shrink: 0;
    }
  }

  @media(max-width:480px){
    .reader-top-font-select-label .font-name-text{display:none}
    .reader-top-font-select-label{padding:0 8px;gap:3px}
  }

  @media(max-width:380px){
    .reader-top-bar{padding:0 8px;gap:4px}
    .reader-top-actions{gap:4px}
    .reader-back{width:var(--touch-target-size);height:var(--touch-target-size);min-width:var(--touch-target-size)}
    .reader-top-font-group{height:var(--touch-target-size);border-radius:999px}
    .reader-top-font-btn{width:36px;height:36px;font-size:12px}
    .reader-top-font-size{min-width:28px;font-size:10px;padding:0 2px}
    .reader-top-font-select-wrap{height:var(--touch-target-size);border-radius:999px}
    :is(.reader-top-speak-btn,.reader-top-scroll-btn){width:var(--touch-target-size);height:var(--touch-target-size);min-width:var(--touch-target-size)}
    .reader-top-bookmark-btn{width:var(--touch-target-size);height:var(--touch-target-size);min-width:var(--touch-target-size)}
  }

  .reader-content{font-family:var(--reader-font,var(--font-reader));line-height:var(--reader-lh,1.9);text-align:var(--reader-align,justify);-webkit-touch-callout:none}
  .reader-content :global(.tts-word.active){border-radius:2px;background:var(--gold);color:var(--bg)}
  @media(min-width:769px){.reader-body{padding-bottom:32px}}
  @media(prefers-reduced-motion:reduce){.reader-modal,.bookmark-ribbon{animation:none}.reader-scroll,.toc-item,.reader-content :global(img),.reader-external-action{transition:none}.reader-content :global(img:hover){transform:none}}
  .chapter-content-loading{display:flex;align-items:center;justify-content:center;gap:8px;padding:48px 0;min-height:80px}
  .chapter-content-loading-dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--gold);opacity:0.3;animation:chapterDotPulse 1.2s ease-in-out infinite}
  .chapter-content-loading-dot:nth-child(2){animation-delay:.2s}
  .chapter-content-loading-dot:nth-child(3){animation-delay:.4s}
  @keyframes chapterDotPulse{0%,80%,100%{opacity:0.3;transform:scale(.8)}40%{opacity:1;transform:scale(1.1)}}
  @media(prefers-reduced-motion:reduce){.chapter-content-loading-dot{animation:none;opacity:0.6}}

  /* Intro & Resume banners */
  .reader-intro-card{margin:0 0 20px;padding:14px 18px;border-left:4px solid var(--gold);border-radius:0 12px 12px 0;background:var(--gold-light);color:var(--text2);font-size:var(--font-size-body);line-height:1.6}
  .reader-intro-text{margin:0}
  .reader-resume-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 24px;padding:12px 16px;border:1.5px solid var(--gold);border-radius:14px;background:var(--gold-light);box-shadow:0 3px 10px color-mix(in srgb,var(--gold) 10%,transparent)}
  .reader-resume-info{display:flex;flex-direction:column;min-width:0}
  .reader-resume-label{font-size:var(--font-size-meta);font-weight:700;color:var(--gold);letter-spacing:1px;text-transform:uppercase}
  .reader-resume-title{font-size:var(--font-size-body);font-weight:700;color:var(--brown);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .reader-resume-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border:0;border-radius:18px;background:var(--gold);color:#fff;font-size:var(--font-size-label);font-weight:700;cursor:pointer;flex-shrink:0;box-shadow:0 2px 6px color-mix(in srgb,var(--gold) 25%,transparent);transition:all .15s}
  .reader-resume-btn:hover{background:var(--brown);transform:scale(1.03)}
  .reader-resume-btn:active{transform:scale(.96)}

  /* Chapter banner when reading */
  .reader-chapter-banner{margin-bottom:var(--dialog-action-space);padding:0;border:0;background:transparent;box-shadow:none}
  .reader-body .reader-chapter-banner-title{margin:0;font-size:var(--font-size-section-title);font-weight:700;color:var(--text);line-height:1.3}
  .reader-chapter-banner-summary{margin:0 0 16px;font-size:var(--font-size-body);line-height:1.5;color:var(--muted)}
  .reader-chapter-banner-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .reader-chapter-banner-toc-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border:1.5px solid var(--border);border-radius:18px;background:var(--card);color:var(--text);font-size:var(--font-size-label);font-weight:700;cursor:pointer;transition:all .15s}
  .reader-chapter-banner-toc-btn:hover{border-color:var(--gold);color:var(--gold);background:var(--gold-light)}
  .reader-chapter-banner-overview-btn{display:inline-flex;align-items:center;padding:7px 12px;border:1px solid transparent;border-radius:18px;background:transparent;color:var(--muted);font-size:var(--font-size-label);font-weight:600;cursor:pointer;transition:all .15s}
  .reader-chapter-banner-overview-btn:hover{color:var(--text);background:var(--bg3)}

  /* TOC active indicators */
  .toc-item.is-active{background:color-mix(in srgb,var(--gold) 15%,transparent)!important;outline:1.5px solid var(--gold)}
  .toc-number.active-num{background:var(--brown)!important;box-shadow:0 0 0 2px var(--card)}
  .toc-active-badge{display:inline-flex;align-items:center;padding:1.5px 6.5px;border-radius:10px;background:var(--gold);color:#fff;font-size:var(--font-size-meta);font-weight:700;line-height:1.2;flex-shrink:0}

  /* TOC Modal Bottom Sheet / Drawer */
  .toc-modal-backdrop{position:absolute;inset:0;z-index:90;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.5);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);animation:tocFadeIn .2s ease-out}
  @keyframes tocFadeIn{from{opacity:0}to{opacity:1}}
  .toc-modal-sheet{display:flex;flex-direction:column;width:100%;max-width:680px;max-height:85vh;max-height:85dvh;height:80vh;height:80dvh;border-radius:20px 20px 0 0;border:1px solid var(--dialog-surface-border,var(--border));background:var(--dialog-surface-background,var(--card));box-shadow:var(--dialog-surface-shadow,var(--shadow-xl));overflow:hidden;animation:tocSlideUp .24s cubic-bezier(.16,1,.3,1)}
  @keyframes tocSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
  .toc-modal-header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px 12px;border-bottom:1px solid var(--border2);background:transparent}
  .toc-modal-title{display:flex;align-items:center;gap:10px}
  .toc-modal-title svg{color:var(--gold)}
  .toc-modal-title h3{margin:0;font-size:17px;font-weight:700;color:var(--text)}
  .toc-modal-count{padding:2px 8px;border-radius:12px;background:var(--gold-muted);color:var(--brown);font-size:11px;font-weight:700}
  .toc-modal-close{display:flex;align-items:center;justify-content:center;width:var(--touch-target-size);height:var(--touch-target-size);min-width:var(--touch-target-size);border:0;border-radius:50%;background:var(--bg2);color:var(--muted);cursor:pointer;transition:all .15s}
  .toc-modal-close:hover{background:color-mix(in srgb,var(--gold) 15%,transparent);color:var(--brown)}
  .toc-modal-search{padding:10px 16px;border-bottom:1px solid var(--border2);position:relative}
  .toc-modal-input{width:100%;height:var(--touch-target-size);padding:0 44px 0 14px;border:1.5px solid var(--border);border-radius:999px;background:var(--bg);color:var(--text);font:inherit;font-size:16px;outline:none;transition:border-color .15s}
  .toc-modal-input:focus{border-color:var(--gold)}
  .toc-modal-clear{position:absolute;right:16px;top:50%;transform:translateY(-50%);width:var(--touch-target-size);height:var(--touch-target-size);display:grid;place-items:center;border:0;background:transparent;color:var(--muted);font-size:16px;font-weight:700;cursor:pointer}
  .toc-modal-list{flex:1;overflow-y:auto;padding:8px 12px calc(8px + env(safe-area-inset-bottom,0px));overscroll-behavior:contain;display:flex;flex-direction:column;gap:3px}
  .toc-modal-item{display:flex;align-items:center;gap:12px;width:100%;padding:10px 12px;border:0;border-radius:10px;background:transparent;color:var(--text);text-align:left;cursor:pointer;transition:background .15s}
  .toc-modal-item:hover{background:color-mix(in srgb,var(--gold) 10%,transparent)}
  .toc-modal-item.is-active{background:color-mix(in srgb,var(--gold) 18%,transparent)!important;outline:1.5px solid var(--gold)}
  .toc-modal-num{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:var(--bg3);color:var(--text);font-size:12px;font-weight:700;flex-shrink:0}
  .toc-modal-num.active-num{background:var(--gold);color:#fff}
  .toc-modal-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
  .toc-modal-item-title{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .toc-modal-item-title strong{font-size:var(--font-size-body);line-height:1.3;color:var(--text)}
  .toc-modal-sub{font-size:var(--font-size-meta);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .toc-modal-item svg{color:var(--muted);flex-shrink:0}

  /* Chế độ đêm (Dark mode) đồng bộ và hoàn thiện màu sắc */
  .reader-modal.bg-dark,
  :root[data-theme='dark'] .reader-modal.bg-dark {
    --bg: #15120d;
    --bg2: #1c1813;
    --bg3: #241e17;
    --card: #15120d;
    --text: #ede8df;
    --text2: #cfc8be;
    --muted: #8e8477;
    --border: #3a3227;
    --border2: #28221a;
    --gold: #d4a84b;
    --gold-light: #221c13;
    --gold-muted: #3a2e1d;
    --brown: #f5eedf;
    background: #15120d;
    color: #ede8df;
  }

  .reader-modal.bg-dark .toc,
  :root[data-theme='dark'] .reader-modal.bg-dark .toc {
    background: #1c1813;
    border-color: #3a3227;
  }
  .reader-modal.bg-dark .toc-header,
  :root[data-theme='dark'] .reader-modal.bg-dark .toc-header {
    background: #241e17;
    border-bottom-color: #3a3227;
    color: #d4a84b;
  }
  .reader-modal.bg-dark .toc-count,
  :root[data-theme='dark'] .reader-modal.bg-dark .toc-count {
    background: rgba(212, 168, 75, 0.15);
    color: #d4a84b;
  }
  .reader-modal.bg-dark .toc-search-input,
  :root[data-theme='dark'] .reader-modal.bg-dark .toc-search-input {
    background: #15120d;
    color: #ede8df;
    border-color: #3a3227;
  }
  .reader-modal.bg-dark .toc-search-input:focus,
  :root[data-theme='dark'] .reader-modal.bg-dark .toc-search-input:focus {
    background: #1c1813;
    border-color: #d4a84b;
    box-shadow: 0 0 0 2px rgba(212, 168, 75, 0.25);
  }
  .reader-modal.bg-dark .toc-search-input::placeholder,
  :root[data-theme='dark'] .reader-modal.bg-dark .toc-search-input::placeholder {
    color: #8e8477;
  }
  .reader-modal.bg-dark .toc-search-clear,
  :root[data-theme='dark'] .reader-modal.bg-dark .toc-search-clear {
    color: #8e8477;
  }
  .reader-modal.bg-dark .toc-search-clear:hover,
  :root[data-theme='dark'] .reader-modal.bg-dark .toc-search-clear:hover {
    color: #ede8df;
  }
  .reader-modal.bg-dark .toc-item:hover,
  :root[data-theme='dark'] .reader-modal.bg-dark .toc-item:hover {
    background: rgba(212, 168, 75, 0.12);
  }
  .reader-modal.bg-dark .toc-item.is-active,
  :root[data-theme='dark'] .reader-modal.bg-dark .toc-item.is-active {
    background: rgba(212, 168, 75, 0.18) !important;
    outline: 1.5px solid #d4a84b;
  }
  .reader-modal.bg-dark .toc-number,
  :root[data-theme='dark'] .reader-modal.bg-dark .toc-number {
    background: #241e17;
    color: #d4a84b;
    border: 1px solid #3a3227;
  }
  .reader-modal.bg-dark .toc-number.active-num,
  :root[data-theme='dark'] .reader-modal.bg-dark .toc-number.active-num {
    background: #d4a84b !important;
    color: #15120d !important;
    box-shadow: 0 0 0 2px #15120d;
  }
  .reader-modal.bg-dark .toc-active-badge,
  :root[data-theme='dark'] .reader-modal.bg-dark .toc-active-badge {
    background: #d4a84b;
    color: #15120d;
  }

  /* Resume reading banner in dark mode */
  .reader-modal.bg-dark .reader-resume-banner,
  :root[data-theme='dark'] .reader-modal.bg-dark .reader-resume-banner {
    background: #1c1813;
    border-color: #d4a84b;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  }
  .reader-modal.bg-dark .reader-resume-label,
  :root[data-theme='dark'] .reader-modal.bg-dark .reader-resume-label {
    color: #d4a84b;
  }
  .reader-modal.bg-dark .reader-resume-title,
  :root[data-theme='dark'] .reader-modal.bg-dark .reader-resume-title {
    color: #ede8df;
  }
  .reader-modal.bg-dark .reader-resume-btn,
  :root[data-theme='dark'] .reader-modal.bg-dark .reader-resume-btn {
    background: #d4a84b;
    color: #15120d;
    box-shadow: 0 2px 8px rgba(212, 168, 75, 0.3);
  }
  .reader-modal.bg-dark .reader-resume-btn:hover,
  :root[data-theme='dark'] .reader-modal.bg-dark .reader-resume-btn:hover {
    background: #e2ba64;
    color: #15120d;
  }

  /* Header controls in dark mode */
  .reader-modal.bg-dark :is(.reader-top-speak-btn,.reader-top-scroll-btn).active,
  :root[data-theme='dark'] .reader-modal.bg-dark :is(.reader-top-speak-btn,.reader-top-scroll-btn).active,
  .reader-modal.bg-dark .reader-top-bookmark-btn.active,
  :root[data-theme='dark'] .reader-modal.bg-dark .reader-top-bookmark-btn.active {
    color: #15120d;
  }
  .reader-modal.bg-dark .reader-top-font-select option,
  :root[data-theme='dark'] .reader-modal.bg-dark .reader-top-font-select option {
    background: #1c1813;
    color: #ede8df;
  }

  /* TOC Sheet in dark mode */
  .reader-modal.bg-dark .toc-modal-sheet,
  :root[data-theme='dark'] .reader-modal.bg-dark .toc-modal-sheet {
    background: var(--dialog-surface-background,var(--card));
  }
  .reader-modal.bg-dark .toc-modal-header,
  :root[data-theme='dark'] .reader-modal.bg-dark .toc-modal-header {
    background: transparent;
    border-bottom-color: #28221a;
  }
  .reader-modal.bg-dark .toc-modal-close,
  :root[data-theme='dark'] .reader-modal.bg-dark .toc-modal-close {
    background: rgba(255, 255, 255, 0.08);
    color: #cfc8be;
  }
  .reader-modal.bg-dark .toc-modal-close:hover,
  :root[data-theme='dark'] .reader-modal.bg-dark .toc-modal-close:hover {
    background: rgba(212, 168, 75, 0.2);
    color: #d4a84b;
  }
  .reader-modal.bg-dark .toc-modal-input,
  :root[data-theme='dark'] .reader-modal.bg-dark .toc-modal-input {
    background: #1c1813;
    color: #ede8df;
    border-color: #3a3227;
  }
  .reader-modal.bg-dark .toc-modal-input:focus,
  :root[data-theme='dark'] .reader-modal.bg-dark .toc-modal-input:focus {
    border-color: #d4a84b;
  }
  .reader-modal.bg-dark .toc-modal-item.is-active,
  :root[data-theme='dark'] .reader-modal.bg-dark .toc-modal-item.is-active {
    background: rgba(212, 168, 75, 0.18) !important;
    outline: 1.5px solid #d4a84b;
  }
  .reader-modal.bg-dark .toc-modal-num,
  :root[data-theme='dark'] .reader-modal.bg-dark .toc-modal-num {
    background: #241e17;
    color: #ede8df;
  }
  .reader-modal.bg-dark .toc-modal-num.active-num,
  :root[data-theme='dark'] .reader-modal.bg-dark .toc-modal-num.active-num {
    background: #d4a84b;
    color: #15120d;
  }
  /* Giữ vùng chạm đủ lớn và đưa đủ công cụ vào màn hẹp. */
  .reader-top-bar .reader-back{min-width:var(--touch-target-size);min-height:var(--touch-target-size);height:var(--touch-target-size)}
  .reader-top-bar .reader-top-font-group{height:auto;min-height:var(--touch-target-size);flex-shrink:0}
  .reader-top-bar .reader-top-font-btn{width:var(--touch-target-size);min-width:var(--touch-target-size);height:var(--touch-target-size)}
  .reader-top-bar .reader-top-font-select-wrap{min-width:var(--touch-target-size);height:var(--touch-target-size);flex-shrink:0}
  .reader-top-bar .reader-top-font-select{min-width:var(--touch-target-size);min-height:var(--touch-target-size)}
  .reader-top-bar :is(.reader-top-speak-btn,.reader-top-scroll-btn),.reader-top-bar .reader-top-bookmark-btn{width:var(--touch-target-size);min-width:var(--touch-target-size);height:var(--touch-target-size)}
  @media(max-width:768px){
    .reader-top-actions{min-width:0;flex-shrink:1;justify-content:flex-start;overflow-x:auto;overscroll-behavior-x:contain}
  }
  @media(max-width:380px){
    .reader-top-bar{padding:var(--app-safe-top,env(safe-area-inset-top,0px)) max(env(safe-area-inset-right,0px),8px) 0 max(env(safe-area-inset-left,0px),8px)}
  }
  @media(max-width:768px){
    .reader-top-bar{flex-wrap:nowrap;gap:calc(var(--dialog-action-gap)/2)}
    .reader-top-actions{flex:1;min-width:0;margin:0;justify-content:space-between;gap:calc(var(--dialog-action-gap)/4);overflow:visible}
    .reader-top-font-size{width:calc(var(--touch-target-size)*.75);min-width:0;padding:0;font-size:var(--font-size-meta)}
    .reader-top-font-select-wrap{width:var(--touch-target-size);justify-content:center}
    .reader-top-font-select-label{padding:0 calc(var(--dialog-action-gap)/2);gap:calc(var(--dialog-action-gap)/4)}
    .reader-top-font-select-label .font-name-text{display:none}
  }
  @media(max-width:400px){
    .reader-top-bar{height:auto;gap:calc(var(--dialog-action-gap)/4);padding-inline:max(env(safe-area-inset-left,0px),calc(var(--dialog-action-gap)/2)) max(env(safe-area-inset-right,0px),calc(var(--dialog-action-gap)/2))}
    .reader-top-actions{flex-wrap:wrap;justify-content:flex-start}
  }

  .reader-modal.bg-purple{--bg:var(--reading-paper-purple);--bg2:var(--reading-paper-purple);--bg3:var(--reading-paper-purple);--card:var(--reading-paper-purple);--text:var(--reading-paper-purple-ink);--text2:var(--reading-paper-purple-ink);--muted:var(--reading-paper-purple-ink);--border:var(--reading-paper-purple-border);--border2:var(--reading-paper-purple-border);--brown:var(--reading-paper-purple-ink);background:var(--bg);color:var(--text)}

  .reader-modal[class*='bg-'], :root[data-theme='dark'] .reader-modal[class*='bg-']{--bg2:var(--bg);--card:var(--bg)}
  /* Các bề mặt phụ và màu nhấn đi theo nền giấy đang đọc. */
  .reader-modal:is(.bg-white,.bg-gray,.bg-purple){
    --gold:var(--text);
    --on-gold:var(--reading-paper-white);
    --gold-light:color-mix(in srgb,var(--text) 5%,var(--bg));
    --gold-muted:color-mix(in srgb,var(--text) 10%,var(--bg));
  }
  .reader-modal.pdf-reader.bg-cream{--bg:var(--reading-paper-cream);--text:var(--reading-paper-cream-ink);--text2:var(--reading-paper-cream-ink);--muted:var(--reading-paper-cream-ink);background:var(--bg);color:var(--text)}
  .reader-modal[class*="bg-"]{
    --dialog-glass-background:color-mix(in srgb,var(--card) 78%,transparent);
    --dialog-glass-border:color-mix(in srgb,var(--card) 70%,var(--border));
  }

  /* Phong cách 3D Pha lê gọn gàng cho giao diện Đọc sách (giữ nguyên mặt giấy đọc văn bản) */
  .reader-modal .reader-top-bar{
    background:linear-gradient(180deg,rgba(255,255,255,.45) 0%,rgba(255,255,255,0) 65%),var(--bg2);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.68),0 3px 10px -4px rgba(60,40,10,.14);
  }
  .reader-modal.bg-dark .reader-top-bar{
    background:linear-gradient(180deg,rgba(255,255,255,.06) 0%,rgba(255,255,255,0) 65%),var(--bg2);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.1),0 4px 12px rgba(0,0,0,.45);
  }
  .reader-modal :is(.reader-back,.reader-top-font-group,.reader-top-font-select-wrap,.reader-top-speak-btn:not(.active),.reader-top-scroll-btn:not(.active),.reader-top-bookmark-btn:not(.active)){
    border:1px solid color-mix(in srgb,var(--border) 55%,rgba(255,255,255,.85));
    background:linear-gradient(180deg,rgba(255,255,255,.72) 0%,var(--card) 100%);
    box-shadow:inset 0 1.5px 0 rgba(255,255,255,.9),inset 0 -2px 0 rgba(60,40,10,.12),0 3px 8px -2px rgba(60,40,10,.14);
  }
  .reader-modal.bg-dark :is(.reader-back,.reader-top-font-group,.reader-top-font-select-wrap,.reader-top-speak-btn:not(.active),.reader-top-scroll-btn:not(.active),.reader-top-bookmark-btn:not(.active)){
    border-color:rgba(255,255,255,.16);
    background:linear-gradient(180deg,rgba(255,255,255,.1) 0%,var(--bg2) 100%);
    box-shadow:inset 0 1.5px 0 rgba(255,255,255,.18),inset 0 -2px 0 rgba(0,0,0,.48),0 4px 10px rgba(0,0,0,.4);
  }
  .reader-modal .reader-category{
    border-radius:999px;
    border:1px solid rgba(255,255,255,.78);
    background:linear-gradient(180deg,rgba(255,255,255,.55) 0%,transparent 100%),var(--gold-muted);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.85),inset 0 -1.5px 0 rgba(60,40,10,.14),0 2px 6px rgba(60,40,10,.08);
  }
  .reader-modal .reader-view-count{
    border-radius:999px;
    border:1px solid rgba(255,255,255,.75);
    background:linear-gradient(180deg,rgba(255,255,255,.75) 0%,var(--bg2) 100%);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.88),0 2px 5px rgba(60,40,10,.07);
  }
  .reader-modal.bg-dark .reader-category{
    border-color:color-mix(in srgb,var(--gold) 35%,rgba(255,255,255,.14));
    background:linear-gradient(180deg,rgba(212,168,75,.22) 0%,rgba(212,168,75,.1) 100%);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 2px 6px rgba(0,0,0,.35);
    color:var(--gold);
  }
  .reader-modal.bg-dark .reader-view-count{
    border-color:rgba(255,255,255,.14);
    background:linear-gradient(180deg,rgba(255,255,255,.1) 0%,rgba(255,255,255,.04) 100%);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 2px 6px rgba(0,0,0,.35);
    color:var(--text2);
  }
  .reader-modal .reader-resume-banner{
    border-radius:var(--radius-card);
    border:1px solid color-mix(in srgb,var(--gold) 36%,rgba(255,255,255,.82));
    background:
      linear-gradient(180deg,rgba(255,255,255,.72) 0%,rgba(255,255,255,.04) 48%),
      linear-gradient(145deg,var(--gold-light) 0%,color-mix(in srgb,var(--gold-muted) 45%,var(--card)) 100%);
    box-shadow:inset 0 1.5px 0 rgba(255,255,255,.94),inset 0 -3px 0 rgba(140,96,24,.16),0 8px 18px -6px rgba(140,96,24,.2);
  }
  .reader-modal.bg-dark .reader-resume-banner{
    border-color:color-mix(in srgb,var(--gold) 45%,rgba(255,255,255,.12));
    background:
      linear-gradient(180deg,rgba(255,255,255,.08) 0%,rgba(255,255,255,0) 48%),
      linear-gradient(145deg,var(--bg2) 0%,var(--card) 100%);
    box-shadow:inset 0 1.5px 0 rgba(255,255,255,.16),inset 0 -3px 0 rgba(0,0,0,.5),0 8px 20px -6px rgba(0,0,0,.5);
  }
  .reader-modal .reader-resume-btn{
    border:1px solid rgba(255,255,255,.45);
    border-radius:999px;
    background:linear-gradient(145deg,#e0ad5a 0%,var(--gold) 65%,#9c6c1b 100%);
    color:#24180c;
    box-shadow:inset 0 1.5px 0 rgba(255,255,255,.62),inset 0 -2.5px 0 rgba(90,56,8,.26),0 4px 12px -2px color-mix(in srgb,var(--gold) 42%,transparent);
  }
  .reader-modal .toc{
    border-radius:var(--radius-card);
    border:1px solid color-mix(in srgb,var(--gold) 22%,rgba(255,255,255,.8));
    background:
      linear-gradient(180deg,rgba(255,255,255,.62) 0%,rgba(255,255,255,.04) 24%),
      linear-gradient(160deg,var(--gold-light) 0%,color-mix(in srgb,var(--gold-muted) 32%,var(--card)) 100%);
    box-shadow:inset 0 1.5px 0 rgba(255,255,255,.92),inset 0 -3.5px 0 rgba(120,84,32,.14),0 10px 22px -8px rgba(60,40,10,.16);
  }
  .reader-modal.bg-dark .toc{
    border-color:rgba(255,255,255,.14);
    background:
      linear-gradient(180deg,rgba(255,255,255,.07) 0%,transparent 24%),
      linear-gradient(160deg,var(--bg2) 0%,var(--card) 100%);
    box-shadow:inset 0 1.5px 0 rgba(255,255,255,.16),inset 0 -3.5px 0 rgba(0,0,0,.52),0 10px 24px -6px rgba(0,0,0,.55);
  }
  .reader-modal .toc-header{
    background:linear-gradient(180deg,rgba(255,255,255,.42) 0%,rgba(255,255,255,.05) 100%),var(--gold-muted);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.75);
  }
  .reader-modal.bg-dark .toc-header{
    background:linear-gradient(180deg,rgba(255,255,255,.08) 0%,transparent 100%),var(--bg3);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.1);
  }
  .reader-modal .toc-search-input{
    border-radius:999px;
    box-shadow:inset 0 1.5px 3px rgba(60,40,10,.08),0 1px 0 rgba(255,255,255,.72);
  }
  .reader-modal .toc-number{
    box-shadow:inset 0 1.5px 0 rgba(255,255,255,.52),inset 0 -2px 0 rgba(80,48,8,.24),0 2px 6px rgba(120,80,20,.2);
  }
  .reader-modal .toc-item{border-radius:var(--radius-control)}
  .reader-modal .toc-item.is-active{
    outline:none;
    border:1px solid var(--gold);
    background:linear-gradient(180deg,rgba(255,255,255,.72) 0%,color-mix(in srgb,var(--gold-muted) 65%,var(--card)) 100%);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.9),inset 0 -2px 0 rgba(160,110,30,.14),0 4px 10px -3px rgba(179,125,34,.2);
  }
  .reader-modal.bg-dark .toc-item.is-active{
    background:linear-gradient(180deg,rgba(212,168,75,.2) 0%,rgba(212,168,75,.09) 100%);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 4px 12px rgba(0,0,0,.4);
  }
  .reader-modal .chapter-footer-btn,
  .reader-modal .chapter-footer-toc-btn{
    border-radius:var(--radius-control);
    box-shadow:inset 0 1.5px 0 rgba(255,255,255,.78),inset 0 -2.5px 0 rgba(60,40,10,.12),0 4px 12px -4px rgba(60,40,10,.14);
  }
  .reader-modal.bg-dark .chapter-footer-btn,
  .reader-modal.bg-dark .chapter-footer-toc-btn{
    box-shadow:inset 0 1.5px 0 rgba(255,255,255,.14),inset 0 -2.5px 0 rgba(0,0,0,.48),0 6px 14px rgba(0,0,0,.42);
  }
  .reader-modal .reader-top-bar{box-sizing:border-box;height:auto;min-height:calc(50px + var(--app-safe-top,env(safe-area-inset-top,0px)));padding-top:var(--app-safe-top,env(safe-area-inset-top,0px))}
  .toc-search-input{min-height:var(--touch-target-size);height:var(--touch-target-size);padding-right:var(--touch-target-size)}
  .toc-search-clear{right:0;width:var(--touch-target-size);height:var(--touch-target-size)}
</style>
