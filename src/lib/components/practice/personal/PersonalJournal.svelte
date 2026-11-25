<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { personalPracticeCopy } from '$lib/i18n/personal-practice-copy';
  import type { createPersonalPracticeStorage } from '$lib/browser/personal-practice-storage';
  import { getVietnamIsoDate } from '$lib/domain/practice/stats';
  import { countReflectionWords, REFLECTION_MINIMUM_WORDS } from '$lib/domain/practice/personal-practice';
  import PracticeConfirmDialog from '../dialog/PracticeConfirmDialog.svelte';
  import ReflectionGuide from './ReflectionGuide.svelte';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { alertInApp } from '$lib/browser/app-dialog';
  import { recordPracticeParticipation } from '$lib/browser/practice-participation';
  import { followTextareaCaret } from '$lib/browser/copying-caret';
  import type { MindfulPostKind, MindfulPostReceipt } from '$lib/contracts/mindful-community';
  import { mindfulShareFailureKey } from '$lib/browser/mindful-community-client';
  import MindfulReviewNotice from './MindfulReviewNotice.svelte';

  interface Props {
    storage: ReturnType<typeof createPersonalPracticeStorage>;
    onShare?: (kind: 'repentance' | 'good_deed', content: string, nickname: string) => Promise<MindfulPostReceipt | void>;
    onSignIn?: () => void;
  }
  let { storage, onShare, onSignIn }: Props = $props();
  const locale = getLocaleContext();
  const copy = $derived(personalPracticeCopy[locale.current === 'en' ? 'en' : 'vi']);
  let date = $state(getVietnamIsoDate());
  let repentance = $state('');
  let goodDeeds = $state('');
  let nickname = $state('');
  let status = $state('');
  let failed = $state(false);
  let shareStatusKind = $state<MindfulPostKind | null>(null);
  let shareStatusBanner = $state<HTMLParagraphElement>();
  let repentanceNotice = $state<ReturnType<typeof MindfulReviewNotice>>();
  let goodDeedNotice = $state<ReturnType<typeof MindfulReviewNotice>>();
  let clearedAfterShare = $state<Partial<Record<MindfulPostKind, string>>>({});
  let sharing = $state<'repentance' | 'good_deed' | null>(null);
  let busy = $state(false);
  let saveNoticeOpen = $state(false);
  let showGuide = $state(true);
  let zenTarget = $state<'repentance' | 'good_deed' | null>(null);
  let clearTarget = $state<'repentance' | 'good_deed' | null>(null);
  let clearTrigger = $state<HTMLButtonElement>();
  let repentanceEditor = $state<HTMLTextAreaElement>();
  let receipts = $state<Partial<Record<'repentance' | 'good_deed', MindfulPostReceipt>>>({});
  let latestReceipt = $state<MindfulPostReceipt | null>(null);
  let blockedReceipt = $state<MindfulPostReceipt | null>(null);
  let revision = 0;
  let reflectionBaseline = '';
  let mobileTab = $state<'repentance' | 'good_deed'>('repentance');
  let nicknameDebounceTimer: ReturnType<typeof setTimeout> | undefined;

  const repentanceWords = $derived(countReflectionWords(repentance));
  const goodDeedsWords = $derived(countReflectionWords(goodDeeds));

  function persistNickname(value: string): void {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 40 || /[\u0000-\u001f\u007f]/u.test(trimmed)) return;
    try {
      if (storage.getNickname() !== trimmed) storage.saveNickname(trimmed);
    } catch {
      // Bỏ qua lỗi tạm thời khi người dùng đang gõ dở
    }
  }

  function handleNicknameInput(event: Event): void {
    const target = event.currentTarget as HTMLInputElement;
    nickname = target.value;
    clearTimeout(nicknameDebounceTimer);
    nicknameDebounceTimer = setTimeout(() => {
      persistNickname(nickname);
    }, 400);
  }

  function handleNicknameBlur(): void {
    clearTimeout(nicknameDebounceTimer);
    if (nickname.trim()) persistNickname(nickname);
  }

  function withSnippet(label: string, target = zenTarget): string {
    const snippet = `\n\n--- ${label} ---\n`;
    const content = target === 'repentance' ? repentance : goodDeeds;
    return content.trim() ? `${content.trimEnd()}${snippet}` : `--- ${label} ---\n`;
  }
  function insertSnippet(label: string, target = zenTarget) {
    if (!target) return;
    const next = withSnippet(label, target);
    if (next.length > 20_000) return;
    editEntry(target, next);
  }

  function editEntry(kind: MindfulPostKind, value: string): void {
    delete clearedAfterShare[kind];
    if (kind === 'repentance') repentance = value;
    else goodDeeds = value;
  }

  async function startWriting(): Promise<void> {
    showGuide = false;
    await tick();
    repentanceEditor?.focus();
  }

  function openZen(target: 'repentance' | 'good_deed', trigger: HTMLButtonElement): void {
    // Safari không tự focus nút khi chạm; modal cần đúng điểm trả focus khi đóng.
    trigger.focus({ preventScroll: true });
    zenTarget = target;
  }

  async function copyEntry(target: 'repentance' | 'good_deed'): Promise<void> {
    const content = target === 'repentance' ? repentance : goodDeeds;
    if (!content || busy) return;
    const currentRevision = revision;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard_unavailable');
      await navigator.clipboard.writeText(content);
      if (currentRevision !== revision) return;
      failed = false; status = copy.copiedEntry;
    } catch {
      if (currentRevision !== revision) return;
      failed = true; status = copy.copyEntryError;
    }
  }

  function requestClear(target: 'repentance' | 'good_deed', trigger: HTMLButtonElement): void {
    trigger.focus({ preventScroll: true });
    clearTrigger = trigger;
    clearTarget = target;
  }

  function clearEntry(): void {
    if (clearTarget) editEntry(clearTarget, '');
    clearTarget = null;
    status = ''; failed = false;
  }

  $effect(() => {
    const owner = storage;
    const selectedDate = date;
    receipts = {}; latestReceipt = null;
    clearedAfterShare = {}; shareStatusKind = null;
    sharing = null; clearTarget = null; busy = false; saveNoticeOpen = false; status = ''; failed = false;
    repentance = ''; goodDeeds = ''; nickname = '';
    try {
      const entry = owner.getReflections().find(item => item.date === selectedDate);
      repentance = entry?.repentance ?? ''; goodDeeds = entry?.goodDeeds ?? '';
      reflectionBaseline = JSON.stringify([selectedDate, entry?.repentance ?? '', entry?.goodDeeds ?? '']);
      nickname = owner.getNickname();
    } catch { failed = true; status = untrack(() => copy.notReady); }
    return () => { clearTimeout(nicknameDebounceTimer); revision += 1; };
  });
  $effect(() => { storage; blockedReceipt = null; });

  function privateReflection() {
    // Sau khi gửi, chỉ làm trống khung soạn. Lưu ô còn lại vẫn phải giữ bản riêng.
    return { date, repentance: clearedAfterShare.repentance ?? repentance, goodDeeds: clearedAfterShare.good_deed ?? goodDeeds };
  }

  function save(): boolean {
    const entry = privateReflection();
    try {
      storage.saveReflection({ ...entry, updatedAt: new Date().toISOString() });
      if (nickname.trim()) persistNickname(nickname);
      reflectionBaseline = JSON.stringify([entry.date, entry.repentance, entry.goodDeeds]);
      failed = false; status = copy.saved; return true;
    } catch { failed = true; status = copy.saveError; return false; }
  }
  async function saveManually(kind: 'repentance' | 'good_deed', trigger: HTMLButtonElement): Promise<void> {
    if (busy || saveNoticeOpen) return;
    shareStatusKind = null;
    trigger.focus({ preventScroll: true });
    if (nickname.trim()) persistNickname(nickname);
    const currentRevision = revision;
    const words = kind === 'repentance' ? repentanceWords : goodDeedsWords;
    saveNoticeOpen = true;
    try {
      if (words < REFLECTION_MINIMUM_WORDS) {
        failed = true;
        status = copy.wordsMinimumHint
          .replace('{0}', String(REFLECTION_MINIMUM_WORDS))
          .replace('{1}', String(REFLECTION_MINIMUM_WORDS - words));
      } else {
        if (save()) recordPracticeParticipation('reflection','recorded',storage.ownerId);
      }
      await alertInApp(status);
    } finally {
      if (currentRevision === revision) saveNoticeOpen = false;
    }
  }
  /** Guard same-principal remounts: a failed local save must keep this draft on screen. */
  export function preserveDraft(): boolean {
    if (nickname.trim()) persistNickname(nickname);
    const entry = privateReflection();
    return JSON.stringify([entry.date, entry.repentance, entry.goodDeeds]) !== reflectionBaseline ? save() : true;
  }
  function saveNickname(): void {
    clearTimeout(nicknameDebounceTimer);
    if (!nickname.trim()) return;
    persistNickname(nickname);
  }
  function changeDate(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    if (!input.value || !input.validity.valid || busy) { input.value = date; return; }
    if (!preserveDraft()) { input.value = date; return; }
    date = input.value;
  }
  function requestShare(kind: 'repentance' | 'good_deed'): void {
    if (busy || blockedReceipt || hasPendingShare(kind)) return;
    shareStatusKind = kind;
    if (!onShare) { if (onSignIn && save()) onSignIn(); return; }
    if (!nickname.trim()) { failed = true; status = copy.nicknameRequired; return; }
    if (!validPublicShare(kind)) return;
    if (save()) { status = ''; sharing = kind; }
  }
  function hasPendingShare(kind: 'repentance' | 'good_deed'): boolean {
    const receipt = receipts[kind];
    const content = kind === 'repentance' ? repentance : goodDeeds;
    return receipt?.reviewState === 'pending' && receipt.kind === kind
      && receipt.nickname.normalize('NFC').trim() === nickname.normalize('NFC').trim()
      && receipt.content.normalize('NFC').trim() === content.normalize('NFC').trim();
  }
  function validPublicShare(kind: 'repentance' | 'good_deed'): boolean {
    const name = nickname.normalize('NFC').trim();
    if (!name || name.length > 40 || /[\u0000-\u001f\u007f@]/u.test(name)) {
      failed = true; status = copy.nicknameInvalid; return false;
    }
    const content = (kind === 'repentance' ? repentance : goodDeeds).normalize('NFC').trim();
    if (!content || content.length > 3000 || content.includes('\u0000')) {
      failed = true; status = copy.publicContentInvalid; return false;
    }
    const words = countReflectionWords(content);
    if (words < REFLECTION_MINIMUM_WORDS) {
      failed = true;
      status = copy.wordsMinimumHint
        .replace('{0}', String(REFLECTION_MINIMUM_WORDS))
        .replace('{1}', String(REFLECTION_MINIMUM_WORDS - words));
      return false;
    }
    return true;
  }
  async function send(): Promise<void> {
    if (!sharing || !onShare || busy || blockedReceipt) return;
    const kind = sharing;
    if (hasPendingShare(kind)) { sharing = null; return; }
    if (!validPublicShare(kind)) { sharing = null; return; }
    const content = kind === 'repentance' ? repentance : goodDeeds;
    const currentRevision = revision;
    busy = true;
    try {
      const receipt = await onShare(kind, content.normalize('NFC').trim(), nickname.normalize('NFC').trim());
      if (currentRevision !== revision) return;
      sharing = null;
      if (!receipt) { failed = true; status = copy.shareError; return; }
      receipts[kind] = receipt; latestReceipt = receipt;
      if (receipt.accountLocked) blockedReceipt = receipt;
      const removed = receipt.reviewState === 'removed' || receipt.status === 'removed';
      const rejected = receipt.reviewState === 'rejected';
      const pending = receipt.reviewState === 'pending';
      const accepted = !receipt.accountLocked && !removed && !rejected && (pending || receipt.status === 'published');
      failed = !accepted;
      status = receipt.accountLocked ? copy.shareLocked : removed ? copy.shareRemoved : rejected ? copy.shareRejected
        : pending ? '' : accepted ? copy.shared : copy.shareError;
      if (accepted) {
        editEntry(kind, '');
        clearedAfterShare[kind] = content;
        await tick();
        if (currentRevision !== revision) return;
        if (pending) {
          const notice = kind === 'repentance' ? repentanceNotice : goodDeedNotice;
          notice?.focusDetails();
          await alertInApp(copy.sharePendingConfirmation);
        } else {
          shareStatusBanner?.focus();
        }
      }
    } catch (error) {
      if (currentRevision !== revision) return;
      sharing = null; failed = true; status = copy[mindfulShareFailureKey(error)];
    } finally { if (currentRevision === revision) busy = false; }
  }
</script>

{#snippet shareStatus(kind: MindfulPostKind)}
  {#if shareStatusKind === kind && status}
    <p bind:this={shareStatusBanner} class="share-status share-status--banner" class:error={failed} role="status" tabindex="-1">{status}</p>
  {/if}
{/snippet}

{#snippet editorTools(target: 'repentance' | 'good_deed')}
  <div class="editor-tools">
    <button type="button" class="editor-tool-btn" aria-label={copy.copyEntry} title={copy.copyEntry} disabled={busy || !(target === 'repentance' ? repentance : goodDeeds)} onclick={() => void copyEntry(target)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg>
    </button>
    <button type="button" class="editor-tool-btn" aria-label={copy.clearEntry} title={copy.clearEntry} disabled={busy || !(target === 'repentance' ? repentance : goodDeeds)} onclick={(event) => requestClear(target, event.currentTarget)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></svg>
    </button>
    <button type="button" class="zen-open-btn" aria-label={copy.zenMode} title={copy.zenMode} onclick={(event) => openZen(target, event.currentTarget)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/></svg>
    </button>
  </div>
{/snippet}

{#snippet segmentSuggestions(target: 'repentance' | 'good_deed')}
  <div class="quick-snippets-bar" aria-label={copy.quickInsert}>
    <span class="snippet-label">{copy.quickInsert}</span>
    <div class="snippet-pills-scroll">
      {#each (target === 'repentance' ? copy.repentanceSections : copy.goodDeedSections) as section (section.text)}
        <button
          type="button"
          class="snippet-pill"
          disabled={withSnippet(section.text, target).length > 20_000}
          onclick={() => insertSnippet(section.text, target)}
        >
          + {section.label}
        </button>
      {/each}
    </div>
  </div>
{/snippet}

<div class="personal-journal">
  <div class="journal-meta-strip">
    <div class="meta-field">
      <span class="meta-icon" aria-hidden="true">🗓️</span>
      <label class="meta-label">
        <span class="meta-name">{copy.date}</span>
        <input
          type="date"
          value={date}
          onchange={changeDate}
          max={getVietnamIsoDate()}
          disabled={busy}
          class="meta-input meta-input--date"
          aria-label={copy.date}
        />
      </label>
    </div>

    <div class="meta-field meta-field--nickname">
      <span class="meta-icon" aria-hidden="true">📿</span>
      <label class="meta-label">
        <span class="meta-name">{copy.nickname}</span>
        <input
          bind:value={nickname}
          oninput={handleNicknameInput}
          onblur={handleNicknameBlur}
          onchange={saveNickname}
          maxlength="40"
          autocomplete="off"
          disabled={busy}
          class="meta-input meta-input--text"
          aria-label={copy.nickname}
        />
      </label>
    </div>

    <button
      type="button"
      class="guide-toggle-button"
      onclick={() => (showGuide = !showGuide)}
      aria-expanded={showGuide}
    >
      📖 {showGuide ? copy.hideGuide : copy.viewGuide}
    </button>
  </div>

  {#if blockedReceipt || latestReceipt?.reviewState !== 'pending' || latestReceipt.status === 'removed' || showGuide}
    <MindfulReviewNotice receipt={blockedReceipt ?? latestReceipt} journal />
  {/if}

  {#if showGuide}
    <div class="guide-banner">
      <ReflectionGuide onDismiss={() => void startWriting()} embedded={false} />
    </div>
  {:else}
    <div class="mobile-segment-nav" role="tablist" aria-label={copy.reflectionTab}>
      <button
        type="button"
        role="tab"
        id="tab-repentance"
        aria-selected={mobileTab === 'repentance'}
        aria-controls="panel-repentance"
        class="segment-tab segment-tab--repentance"
        class:segment-tab--active={mobileTab === 'repentance'}
        onclick={() => (mobileTab = 'repentance')}
      >
        <span class="segment-tab-icon" aria-hidden="true">🌿</span>
        <span class="segment-tab-title">{copy.repentanceMobileTab}</span>
        {#if repentanceWords > 0}
          <span class="segment-tab-badge" title={copy.wordsCount.replace('{0}', String(repentanceWords))}>
            {repentanceWords}
          </span>
        {/if}
      </button>

      <button
        type="button"
        role="tab"
        id="tab-good-deed"
        aria-selected={mobileTab === 'good_deed'}
        aria-controls="panel-good-deed"
        class="segment-tab segment-tab--good-deed"
        class:segment-tab--active={mobileTab === 'good_deed'}
        onclick={() => (mobileTab = 'good_deed')}
      >
        <span class="segment-tab-icon" aria-hidden="true">🌸</span>
        <span class="segment-tab-title">{copy.goodDeedsMobileTab}</span>
        {#if goodDeedsWords > 0}
          <span class="segment-tab-badge" title={copy.wordsCount.replace('{0}', String(goodDeedsWords))}>
            {goodDeedsWords}
          </span>
        {/if}
      </button>
    </div>

    <div class="journal-columns">
      <section
        id="panel-repentance"
        aria-labelledby="tab-repentance"
        class="journal-card journal-card--repentance"
        data-mobile-active={mobileTab === 'repentance'}
      >
        <div class="card-header card-header--repentance">
          <div class="card-title-group">
            <span class="card-eyebrow">🌿 {copy.repentanceMobileTab}</span>
            <h3>{copy.repentance}</h3>
            <p class="card-subtitle">{copy.repentanceSubtitle}</p>
          </div>
          {@render editorTools('repentance')}
        </div>

        {@render segmentSuggestions('repentance')}

        <div class="editor-wrap">
          <textarea
            use:followTextareaCaret
            aria-label={copy.repentance}
            bind:this={repentanceEditor}
            bind:value={() => repentance, (value) => editEntry('repentance', value)}
            maxlength="20000"
            placeholder={copy.repentancePlaceholder}
            class="journal-textarea"
          ></textarea>
        </div>

        <div class="word-counter" class:word-counter--reached={repentanceWords >= REFLECTION_MINIMUM_WORDS}>
          {#if repentanceWords < REFLECTION_MINIMUM_WORDS}
            <span class="counter-badge counter-badge--progress">
              📝 {copy.wordsCount.replace('{0}', String(repentanceWords))} / {REFLECTION_MINIMUM_WORDS}
            </span>
            <span class="counter-hint">
              {copy.wordsMinimumHint.replace('{0}', String(REFLECTION_MINIMUM_WORDS)).replace('{1}', String(REFLECTION_MINIMUM_WORDS - repentanceWords))}
            </span>
          {:else}
            <span class="counter-badge counter-badge--success">
              ✨ {copy.wordsCount.replace('{0}', String(repentanceWords))}
            </span>
            <span class="counter-hint">
              {copy.wordsReached.replace('{0}', String(repentanceWords))}
            </span>
          {/if}
        </div>

        <div class="mindful-quote-card mindful-quote-card--repentance">
          <div class="quote-header">
            <span class="quote-icon" aria-hidden="true">📜</span>
            <span class="quote-title">{copy.vowTitle}</span>
          </div>
          <blockquote class="reader quote-text">
            “{copy.vow}”
          </blockquote>
        </div>

        {#if receipts.repentance}
          {#key receipts.repentance.id}
            <MindfulReviewNotice bind:this={repentanceNotice} receipt={receipts.repentance} compact journal />
          {/key}
        {/if}

        <div class="actions">
          {@render shareStatus('repentance')}
          <button
            type="button"
            class="btn-save-private"
            onclick={(event) => void saveManually('repentance', event.currentTarget)}
            disabled={busy}
          >
            {copy.savePrivate}
          </button>
          <button
            type="button"
            class="btn-share-community"
            onclick={() => requestShare('repentance')}
            disabled={(!onShare && !onSignIn) || busy || Boolean(blockedReceipt) || hasPendingShare('repentance') || repentanceWords < REFLECTION_MINIMUM_WORDS}
            title={repentanceWords < REFLECTION_MINIMUM_WORDS ? copy.wordsMinimumHint.replace('{0}', String(REFLECTION_MINIMUM_WORDS)).replace('{1}', String(REFLECTION_MINIMUM_WORDS - repentanceWords)) : undefined}
          >
            {hasPendingShare('repentance') ? copy.sharePendingAction : copy.shareRepentance}
          </button>
        </div>
      </section>

      <section
        id="panel-good-deed"
        aria-labelledby="tab-good-deed"
        class="journal-card journal-card--good-deed"
        data-mobile-active={mobileTab === 'good_deed'}
      >
        <div class="card-header card-header--good-deed">
          <div class="card-title-group">
            <span class="card-eyebrow">🌸 {copy.goodDeedsMobileTab}</span>
            <h3>{copy.goodDeeds}</h3>
            <p class="card-subtitle">{copy.goodDeedsSubtitle}</p>
          </div>
          {@render editorTools('good_deed')}
        </div>

        {@render segmentSuggestions('good_deed')}

        <div class="editor-wrap">
          <textarea
            use:followTextareaCaret
            aria-label={copy.goodDeeds}
            bind:value={() => goodDeeds, (value) => editEntry('good_deed', value)}
            maxlength="20000"
            placeholder={copy.goodPlaceholder}
            class="journal-textarea"
          ></textarea>
        </div>

        <div class="word-counter" class:word-counter--reached={goodDeedsWords >= REFLECTION_MINIMUM_WORDS}>
          {#if goodDeedsWords < REFLECTION_MINIMUM_WORDS}
            <span class="counter-badge counter-badge--progress">
              📝 {copy.wordsCount.replace('{0}', String(goodDeedsWords))} / {REFLECTION_MINIMUM_WORDS}
            </span>
            <span class="counter-hint">
              {copy.wordsMinimumHint.replace('{0}', String(REFLECTION_MINIMUM_WORDS)).replace('{1}', String(REFLECTION_MINIMUM_WORDS - goodDeedsWords))}
            </span>
          {:else}
            <span class="counter-badge counter-badge--success">
              ✨ {copy.wordsCount.replace('{0}', String(goodDeedsWords))}
            </span>
            <span class="counter-hint">
              {copy.wordsReached.replace('{0}', String(goodDeedsWords))}
            </span>
          {/if}
        </div>

        <div class="mindful-quote-card mindful-quote-card--good-deed">
          <div class="quote-header">
            <span class="quote-icon" aria-hidden="true">📜</span>
            <span class="quote-title">{copy.meritTitle}</span>
          </div>
          <blockquote class="reader quote-text">
            “{copy.merit}”
          </blockquote>
        </div>

        {#if receipts.good_deed}
          {#key receipts.good_deed.id}
            <MindfulReviewNotice bind:this={goodDeedNotice} receipt={receipts.good_deed} compact journal />
          {/key}
        {/if}

        <div class="actions">
          {@render shareStatus('good_deed')}
          <button
            type="button"
            class="btn-save-private"
            onclick={(event) => void saveManually('good_deed', event.currentTarget)}
            disabled={busy}
          >
            {copy.savePrivate}
          </button>
          <button
            type="button"
            class="btn-share-community"
            onclick={() => requestShare('good_deed')}
            disabled={(!onShare && !onSignIn) || busy || Boolean(blockedReceipt) || hasPendingShare('good_deed') || goodDeedsWords < REFLECTION_MINIMUM_WORDS}
            title={goodDeedsWords < REFLECTION_MINIMUM_WORDS ? copy.wordsMinimumHint.replace('{0}', String(REFLECTION_MINIMUM_WORDS)).replace('{1}', String(REFLECTION_MINIMUM_WORDS - goodDeedsWords)) : undefined}
          >
            {hasPendingShare('good_deed') ? copy.sharePendingAction : copy.shareGood}
          </button>
        </div>
      </section>
    </div>
    {#if !onShare}<p class="notice">{onSignIn ? copy.signInToShare : copy.unavailable}</p>{/if}
    {#if shareStatusKind === null}<p class="share-status" class:error={failed} role="status">{status}</p>{/if}
  {/if}
</div>

{#if zenTarget}
  <dialog class="zen-overlay" use:modalDialog oncancel={() => (zenTarget = null)} onclose={() => (zenTarget = null)} aria-label={zenTarget === 'repentance' ? copy.repentance : copy.goodDeeds}>
    <header class="zen-header">
      <div class="zen-title-group">
        <span class="zen-eyebrow">{copy.zenTitle} · {copy.date}: {date}</span>
        <h2>{zenTarget === 'repentance' ? copy.repentance : copy.goodDeeds}</h2>
      </div>
      <button type="button" class="zen-close-btn" onclick={() => (zenTarget = null)}>
        ✕ {copy.exitZenMode}
      </button>
    </header>

    {@render segmentSuggestions(zenTarget)}

    <div class="zen-editor-area">
      {#if zenTarget === 'repentance'}
        <textarea
          aria-label={copy.repentance}
          bind:value={() => repentance, (value) => editEntry('repentance', value)}
          maxlength="20000"
          placeholder={copy.repentancePlaceholder}
          class="zen-textarea"
          data-modal-focus
        ></textarea>
      {:else}
        <textarea
          aria-label={copy.goodDeeds}
          bind:value={() => goodDeeds, (value) => editEntry('good_deed', value)}
          maxlength="20000"
          placeholder={copy.goodPlaceholder}
          class="zen-textarea"
          data-modal-focus
        ></textarea>
      {/if}
    </div>

    <footer class="zen-footer">
      <div class="zen-stats">
        {#if zenTarget === 'repentance'}
          <span class="zen-stat-count">📝 {copy.wordsCount.replace('{0}', String(repentanceWords))} ({copy.charCount.replace('{0}', String(repentance.length))})</span>
          {#if repentanceWords < REFLECTION_MINIMUM_WORDS}
            <span class="zen-stat-hint zen-stat-hint--warn">⚠️ {copy.wordsMinimumHint.replace('{0}', String(REFLECTION_MINIMUM_WORDS)).replace('{1}', String(REFLECTION_MINIMUM_WORDS - repentanceWords))}</span>
          {:else}
            <span class="zen-stat-hint zen-stat-hint--ok">✓ {copy.wordsReached.replace('{0}', String(repentanceWords))}</span>
          {/if}
          {#if repentance.length > 3000}
            <span class="zen-stat-notice">ℹ️ {copy.charLimitNotice}</span>
          {/if}
        {:else}
          <span class="zen-stat-count">📝 {copy.wordsCount.replace('{0}', String(goodDeedsWords))} ({copy.charCount.replace('{0}', String(goodDeeds.length))})</span>
          {#if goodDeedsWords < REFLECTION_MINIMUM_WORDS}
            <span class="zen-stat-hint zen-stat-hint--warn">⚠️ {copy.wordsMinimumHint.replace('{0}', String(REFLECTION_MINIMUM_WORDS)).replace('{1}', String(REFLECTION_MINIMUM_WORDS - goodDeedsWords))}</span>
          {:else}
            <span class="zen-stat-hint zen-stat-hint--ok">✓ {copy.wordsReached.replace('{0}', String(goodDeedsWords))}</span>
          {/if}
          {#if goodDeeds.length > 3000}
            <span class="zen-stat-notice">ℹ️ {copy.charLimitNotice}</span>
          {/if}
        {/if}
      </div>
      <p class:error={failed} role="status">{status}</p>
      <div class="zen-actions">
        <button type="button" class="zen-save-btn" onclick={(event) => zenTarget && void saveManually(zenTarget, event.currentTarget)} disabled={busy}>{copy.savePrivate}</button>
        <button type="button" class="zen-done-btn" onclick={() => (zenTarget = null)}>✓ {copy.exitZenMode}</button>
      </div>
    </footer>
  </dialog>
{/if}

<PracticeConfirmDialog open={sharing !== null} title={copy.confirmTitle}
  description={`${sharing === 'good_deed' ? copy.goodConsent : copy.repentanceConsent}\n\n${copy.shareReviewDescription}`} justifyDescription
  cancelLabel={copy.cancel} confirmLabel={busy ? copy.sending : copy.confirm} {busy}
  onCancel={() => { if (!busy) sharing = null; }} onConfirm={() => { void send(); }}>
  {#snippet children()}
    <div class="share-confirm-copy">
      <p>{copy.sharePolicyWarning}</p>
      <p>{copy.sharePrivateKept}</p>
    </div>
  {/snippet}
</PracticeConfirmDialog>

<PracticeConfirmDialog open={clearTarget !== null} title={copy.clearEntryTitle} description={copy.clearEntryConfirm}
  cancelLabel={copy.cancel} confirmLabel={copy.clearEntry} returnFocusTo={clearTrigger}
  onCancel={() => { clearTarget = null; }} onConfirm={clearEntry} />

<style>
  .share-status,
  .share-confirm-copy p {
    text-align: justify;
    line-height: 1.7;
    overflow-wrap: anywhere;
    color: var(--text2);
  }
  .share-status--banner {
    grid-column: 1 / -1;
    margin: 0;
    padding: calc(var(--space-page) * 0.5) var(--space-page);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--gold-light);
    color: var(--text);
    font-size: var(--font-size-label);
    font-weight: 700;
  }
  .share-status--banner.error { color: var(--danger-text); }
  .share-confirm-copy p {
    margin: 0 0 calc(var(--space-page) * 0.6);
    font-size: var(--font-size-label);
  }
  .personal-journal {
    min-width: 0;
  }

  /* Hồ sơ soi tâm gọn gàng đầu trang */
  .journal-meta-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: calc(var(--space-page) * 0.5);
    padding: calc(var(--space-page) * 0.5) var(--space-page);
    margin-bottom: var(--space-page);
    background: var(--card);
    border: 1px solid var(--border2);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-sm);
  }
  .meta-field {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .meta-icon {
    font-size: 1.15rem;
    flex-shrink: 0;
  }
  .meta-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
    font-size: var(--font-size-label);
    color: var(--text2);
    margin: 0;
    flex: 1;
    min-width: 0;
  }
  .meta-name {
    white-space: nowrap;
    font-size: var(--font-size-label);
  }
  .meta-input {
    font: inherit;
    box-sizing: border-box;
    min-height: 44px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--bg);
    color: var(--text);
    padding: 4px 10px;
    font-size: var(--font-size-input);
  }
  .meta-input--date {
    max-width: 160px;
  }
  .meta-input--text {
    max-width: 170px;
  }
  .guide-toggle-button {
    min-height: 44px;
    padding: 6px 14px;
    background: var(--gold-light);
    border: 1px solid var(--gold);
    color: var(--brown, var(--text));
    border-radius: var(--radius-control);
    font: 700 var(--font-size-label) var(--font-app);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    box-shadow: var(--shadow-sm);
    margin-inline-start: auto;
  }
  .guide-toggle-button:focus-visible,
  .meta-input:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }
  .guide-banner {
    margin-bottom: var(--space-page);
  }

  /* Segmented navigation trên Mobile */
  .mobile-segment-nav {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: calc(var(--space-page) * 0.4);
    margin-bottom: var(--space-page);
  }
  .segment-tab {
    min-height: 44px;
    padding: calc(var(--space-page) * 0.45) calc(var(--space-page) * 0.4);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--card);
    color: var(--text2);
    font: 700 var(--font-size-label)/1.4 var(--font-app);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }
  .segment-tab--active {
    background: var(--gold-light);
    border-color: var(--gold);
    color: var(--brown, var(--text));
    box-shadow: var(--shadow-sm);
  }
  .segment-tab-icon {
    font-size: 1.05rem;
  }
  .segment-tab-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 10px;
    background: var(--gold);
    color: var(--on-gold);
    font-size: var(--font-size-meta);
    font-weight: 800;
  }

  /* Sổ quán chiếu cards */
  .journal-card {
    min-width: 0;
    padding: calc(var(--space-page) * 0.9);
    margin-bottom: var(--space-page);
    background: var(--dialog-glass-background, var(--card));
    border: 1px solid var(--border2);
    border-radius: var(--radius-card);
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-sm);
  }
  .journal-card--repentance {
    border-top: 3px solid var(--brown, #8b5e3c);
  }
  .journal-card--good-deed {
    border-top: 3px solid var(--gold, #dfb75c);
  }

  /* Header card */
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: calc(var(--space-page) * 0.5);
    margin-bottom: calc(var(--space-page) * 0.4);
  }
  .card-title-group {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .card-eyebrow {
    font-size: var(--font-size-meta);
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--brown, var(--gold));
    margin-bottom: 2px;
  }
  .card-header h3 {
    margin: 0;
    font-size: var(--font-size-card-title);
    font-weight: 800;
    line-height: 1.3;
    color: var(--text);
  }
  .card-subtitle {
    margin: 3px 0 0;
    font-size: var(--font-size-label);
    color: var(--text2);
    line-height: 1.45;
  }

  /* Toolbar công cụ */
  .editor-tools {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }
  .editor-tools svg {
    width: 20px;
    height: 20px;
  }
  .editor-tool-btn,
  .zen-open-btn {
    min-height: 44px;
    min-width: 44px;
    padding: 0;
    justify-content: center;
    background: var(--gold-light);
    border: 1px solid var(--gold);
    color: var(--brown, var(--text));
    border-radius: var(--radius-control);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    box-shadow: none;
    transition: background 0.15s ease;
  }
  .editor-tool-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .editor-tool-btn:focus-visible,
  .zen-open-btn:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }

  /* Thanh gợi ý phân đoạn nhanh */
  .quick-snippets-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-block: calc(var(--space-page) * 0.35);
    margin-bottom: calc(var(--space-page) * 0.4);
    border-top: 1px dashed var(--border2);
    border-bottom: 1px dashed var(--border2);
    overflow: hidden;
  }
  .snippet-label {
    font-size: var(--font-size-meta);
    font-weight: 700;
    color: var(--text2);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .snippet-pills-scroll {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    padding-block: 2px;
  }
  .snippet-pills-scroll::-webkit-scrollbar {
    display: none;
  }
  .snippet-pill {
    flex-shrink: 0;
    min-height: 38px;
    padding: 4px 12px;
    background: var(--bg);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: var(--radius-control);
    font-size: var(--font-size-label);
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    box-shadow: none;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }
  .snippet-pill:hover:not(:disabled),
  .snippet-pill:focus-visible:not(:disabled) {
    background: var(--gold-light);
    border-color: var(--gold);
    color: var(--brown);
  }
  .snippet-pill:disabled {
    opacity: 0.45;
    cursor: default;
  }

  /* Khung soạn thảo textarea */
  .editor-wrap {
    margin-block: calc(var(--space-page) * 0.3);
  }
  .journal-textarea {
    --journal-nav-clearance: 0px;
    width: 100%;
    min-height: calc(var(--space-page) * 13 + var(--journal-nav-clearance));
    padding: calc(var(--space-page) * 0.75);
    padding-block-end: calc(var(--space-page) * 0.75 + var(--journal-nav-clearance));
    scroll-margin-block-end: calc(var(--journal-nav-clearance) + var(--space-page));
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    font-family: var(--font-reader);
    font-size: var(--font-size-input, 1.05rem);
    line-height: 1.8;
    color: var(--text);
    background: var(--bg);
    resize: vertical;
    box-sizing: border-box;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .journal-textarea:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 1px;
    border-color: var(--gold);
  }
  :global(:root[data-native-app='true']) .journal-textarea {
    --journal-nav-clearance: calc(var(--nav-base-h) + env(safe-area-inset-bottom, 0px));
  }
  @media (max-width: 768px) {
    .journal-textarea {
      --journal-nav-clearance: calc(var(--nav-base-h) + env(safe-area-inset-bottom, 0px));
    }
  }

  /* Word counter êm dịu */
  .word-counter {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-block: calc(var(--space-page) * 0.3) calc(var(--space-page) * 0.6);
    font-size: var(--font-size-label);
    color: var(--text2);
    flex-wrap: wrap;
  }
  .counter-badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 9px;
    border-radius: var(--radius-sm);
    font-weight: 700;
  }
  .counter-badge--progress {
    background: var(--gold-light);
    color: var(--brown, var(--text));
    border: 1px solid var(--gold);
  }
  .counter-badge--success {
    background: var(--card);
    color: var(--green-ok, #2e7d32);
    border: 1px solid var(--green-ok, #2e7d32);
  }
  .counter-hint {
    font-size: var(--font-size-meta);
    line-height: 1.4;
  }

  /* Thẻ kệ kinh quán niệm */
  .mindful-quote-card {
    padding: calc(var(--space-page) * 0.6) calc(var(--space-page) * 0.8);
    margin-bottom: calc(var(--space-page) * 0.8);
    background: var(--bg);
    border: 1px solid var(--border2);
    border-radius: var(--radius-sm);
  }
  .mindful-quote-card--repentance {
    border-inline-start: 3px solid var(--brown, #8b5e3c);
  }
  .mindful-quote-card--good-deed {
    border-inline-start: 3px solid var(--gold, #dfb75c);
  }
  .quote-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }
  .quote-icon {
    font-size: 0.95rem;
  }
  .quote-title {
    font-size: var(--font-size-meta);
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--brown, var(--gold));
  }
  .quote-text {
    margin: 0;
    font-family: var(--font-reader);
    font-style: italic;
    font-size: var(--font-size-body);
    line-height: 1.75;
    color: var(--text2);
    text-align: left;
  }

  /* Khu vực nút bấm */
  .actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: calc(var(--space-page) * 0.5);
    margin-top: auto;
  }
  .btn-save-private {
    min-height: 48px;
    background: var(--gold);
    color: var(--on-gold);
    font: 700 var(--font-size-label) var(--font-app);
    border: 1px solid var(--gold2, var(--gold));
    border-radius: var(--radius-control);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    box-shadow: var(--shadow-sm);
    transition: opacity 0.15s ease;
  }
  .btn-share-community {
    min-height: 48px;
    background: var(--card);
    color: var(--text);
    font: 700 var(--font-size-label) var(--font-app);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: opacity 0.15s ease, background 0.15s ease;
  }
  .btn-save-private:disabled,
  .btn-share-community:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .btn-save-private:focus-visible,
  .btn-share-community:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }

  p {
    line-height: 1.7;
    color: var(--text2);
  }
  .notice {
    padding: calc(var(--space-page) * 0.6);
    background: var(--gold-light);
    border-radius: var(--radius);
  }
  .error {
    color: var(--danger-text);
  }

  /* Modal Toàn màn hình (Zen Mode) */
  .zen-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: var(--bg);
    color: var(--text);
    display: flex;
    flex-direction: column;
    padding: calc(var(--space-page) * 0.75);
    padding-top: calc(env(safe-area-inset-top, 0px) + var(--space-page) * 0.5);
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + var(--space-page) * 0.5);
    overflow: hidden;
    box-sizing: border-box;
    margin: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    border: 0;
  }
  .zen-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: calc(var(--space-page) * 0.4);
    border-bottom: 1px solid var(--border2);
    gap: var(--space-page);
  }
  .zen-title-group {
    display: grid;
    min-width: 0;
  }
  .zen-eyebrow {
    font-size: var(--font-size-meta, 0.75rem);
    font-weight: 700;
    color: var(--brown, var(--gold));
    letter-spacing: 0.05em;
  }
  .zen-header h2 {
    margin: 0;
    font-size: var(--font-size-section-title);
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .zen-close-btn {
    flex-shrink: 0;
    min-height: 44px;
    padding: 6px 14px;
    background: var(--card);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: var(--radius-control);
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }
  .zen-editor-area {
    flex: 1;
    display: flex;
    min-height: 0;
    margin-block: calc(var(--space-page) * 0.3);
  }
  .zen-textarea {
    flex: 1;
    width: 100%;
    height: 100%;
    min-height: 100%;
    box-sizing: border-box;
    font-family: var(--font-reader);
    font-size: var(--font-size-input);
    line-height: 1.85;
    padding: var(--space-page);
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    background: var(--card);
    color: var(--text);
    resize: none;
  }
  .zen-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: calc(var(--space-page) * 0.5);
    padding-top: calc(var(--space-page) * 0.4);
    border-top: 1px solid var(--border2);
    background: var(--bg);
  }
  .zen-stats {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: var(--font-size-label);
  }
  .zen-stat-count {
    font-weight: 700;
    color: var(--text);
  }
  .zen-stat-hint {
    font-weight: 600;
    padding: 2px 7px;
    border-radius: var(--radius-sm);
  }
  .zen-stat-hint--warn {
    background: var(--gold-light);
    color: var(--brown, var(--gold));
  }
  .zen-stat-hint--ok {
    background: var(--card);
    color: var(--green-ok);
  }
  .zen-stat-notice {
    font-size: var(--font-size-meta);
    color: var(--text2);
  }
  .zen-actions {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }
  .zen-save-btn {
    min-height: 44px;
    padding: 6px 14px;
    background: var(--card);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: var(--radius-control);
    font-weight: 700;
    cursor: pointer;
  }
  .zen-done-btn {
    min-height: 44px;
    padding: 6px 14px;
    background: var(--gold);
    color: var(--on-gold);
    border: 1px solid var(--gold);
    border-radius: var(--radius-control);
    font-weight: 700;
    cursor: pointer;
  }

  /* Responsive Rules: Mobile vs Desktop */
  @media (max-width: 767px) {
    .journal-card[data-mobile-active='false'] {
      display: none !important;
    }
    .mobile-segment-nav {
      display: grid;
    }
    .journal-meta-strip {
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
    }
    .meta-field {
      width: 100%;
      justify-content: space-between;
    }
    .meta-label {
      width: 100%;
      justify-content: space-between;
    }
    .meta-input--date,
    .meta-input--text {
      max-width: none;
      width: 100%;
      min-width: 0;
      flex: 1;
    }
    .meta-input--date {
      text-align: end;
    }
    .meta-input--text {
      text-align: start;
    }
    .guide-toggle-button {
      width: 100%;
      justify-content: center;
      margin-inline-start: 0;
    }
    .actions {
      grid-template-columns: 1fr;
    }
  }

  @media (min-width: 768px) {
    .mobile-segment-nav {
      display: none;
    }
    .journal-columns {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-page);
    }
    .journal-card {
      display: flex !important;
    }
  }
</style>

