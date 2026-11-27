<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { browser } from '$app/environment';
  import { goto, pushState, replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { getSessionContext } from '$lib/stores/session.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { confirmInApp } from '$lib/browser/app-dialog';
  import { createBrowserId } from '$lib/browser/random-id';
  import {
    loadDreamJournal, saveDreamJournalEntry, deleteDreamJournalEntry, clearDreamJournal,
    type DreamJournalEntry,
  } from '$lib/browser/spiritual-tools-storage';
  import { DREAM_ENTRIES, DREAM_TOPICS, filterDreamEntries, getDreamEntry, getPopularDreamEntries, type DreamEntry } from '$lib/domain/practice/dream-interpretation';
  import { getDreamCopy } from '$lib/i18n/dream-ui';
  import DreamArticle from './DreamArticle.svelte';
  import DreamJournalPanel from './DreamJournalPanel.svelte';
  import DreamGuideDialog from './DreamGuideDialog.svelte';
  import ItalicParensText from './ItalicParensText.svelte';
  import './divination-shared.css';
  import '$lib/styles/dream-interpretation.css';

  const locale = getLocaleContext();
  const session = getSessionContext();
  const isEnglish = $derived(locale.current === 'en');
  const copy = $derived(getDreamCopy(isEnglish));
  const principal = $derived(session.value.authenticated ? session.value.user?.id ?? null : null);
  const topicCounts = new Map(DREAM_TOPICS.map((topic) => [topic.id, DREAM_ENTRIES.filter((entry) => entry.category === topic.id).length]));
  const topicIcons: Record<string, string> = { candle: '🕯', lotus: '🪷', paw: '🐾', sparkles: '✧', wallet: '◈', heart: '♡', leaf: '❧', compass: '◉', users: '♧', rings: '◇' };

  let mounted = $state(false);
  let mobile = $state(true);
  let query = $state('');
  let category = $state('all');
  let selectedId = $state('');
  let drafts = $state<Record<string, string>>({});
  let entries = $state<DreamJournalEntry[]>([]);
  let historyLoading = $state(true);
  let historyError = $state(false);
  let pending = $state(false);
  let guideOpen = $state(false);
  let status = $state('');
  let noteStatus = $state('');
  let loadRevision = 0;
  let disposed = false;
  let listScroll = 0;
  let focusEntryId = '';
  let wasDetailOpen = false;

  const filtered = $derived(filterDreamEntries(query, category));
  const hasQuery = $derived(query.trim().length > 0);
  const selectedTopic = $derived(DREAM_TOPICS.find((topic) => topic.id === category));
  const displayedEntries = $derived(!selectedTopic && !hasQuery ? getPopularDreamEntries() : filtered);
  const detailOpen = $derived(mobile && Boolean(page.state.dreamDetail && getDreamEntry(page.state.dreamDetail)));
  const selected = $derived(detailOpen
    ? getDreamEntry(page.state.dreamDetail ?? '')
    : displayedEntries.find((entry) => entry.id === selectedId) ?? displayedEntries[0]);

  function handleBack(): void {
    if (guideOpen) { guideOpen = false; return; }
    if (detailOpen) { window.history.back(); return; }
    if (page.state.homeDivination && page.state.dreamDetail) void goto('/');
    else if (page.state.homeDivination) window.history.back();
    else void goto('/tu-tap');
  }

  async function readJournal(): Promise<void> {
    const revision = ++loadRevision;
    const owner = principal;
    historyLoading = true;
    historyError = false;
    try {
      const loaded = await loadDreamJournal(owner);
      if (disposed || revision !== loadRevision || owner !== principal) return;
      entries = loaded;
    } catch {
      if (disposed || revision !== loadRevision || owner !== principal) return;
      historyError = true;
    } finally {
      if (!disposed && revision === loadRevision && owner === principal) historyLoading = false;
    }
  }

  $effect(() => {
    const owner = principal;
    const identityReady = session.initialResolutionComplete !== false;
    loadRevision += 1;
    entries = [];
    drafts = {};
    status = '';
    noteStatus = '';
    pending = false;
    historyLoading = true;
    historyError = false;
    if (!mounted || !identityReady) return;
    void owner;
    void readJournal();
    return () => { loadRevision += 1; };
  });

  $effect(() => {
    if (!mounted) return;
    const opened = detailOpen;
    if (wasDetailOpen && !opened) {
      void tick().then(() => {
        if (disposed) return;
        document.getElementById(`dream-row-${focusEntryId}`)?.focus({ preventScroll: true });
        window.scrollTo({ top: listScroll, behavior: 'instant' });
      });
    }
    wasDetailOpen = opened;
  });

  onMount(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const updateWidth = () => { mobile = media.matches; };
    updateWidth();
    media.addEventListener('change', updateWidth);
    mounted = true;
    document.dispatchEvent(new CustomEvent('qts:subpage-header', {
      detail: { active: true, onBack: handleBack, backLabel: page.state.homeDivination ? copy.backHome : copy.backPractice },
    }));
    return () => {
      disposed = true;
      loadRevision += 1;
      media.removeEventListener('change', updateWidth);
      document.dispatchEvent(new CustomEvent('qts:subpage-header', { detail: { active: false } }));
    };
  });

  async function selectEntry(entry: DreamEntry): Promise<void> {
    selectedId = entry.id;
    status = '';
    noteStatus = '';
    if (!browser) return;
    if (!mobile) {
      if (page.state.dreamDetail) replaceState('', { ...page.state, dreamDetail: entry.id });
      return;
    }
    if (page.state.dreamDetail) replaceState('', { ...page.state, dreamDetail: entry.id });
    else {
      listScroll = window.scrollY;
      focusEntryId = entry.id;
      // Sau reload, đồng bộ lại entry danh sách trước khi thêm phiếu chi tiết.
      replaceState('', { ...page.state });
      pushState('', { ...page.state, dreamDetail: entry.id });
    }
    await tick();
    if (disposed) return;
    document.getElementById('dream-article-title')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  async function openJournal(entry: DreamJournalEntry): Promise<void> {
    const dream = getDreamEntry(entry.dreamId);
    if (!dream) { status = copy.removedArticle; return; }
    query = '';
    category = 'all';
    drafts = { ...drafts, [entry.dreamId]: entry.note };
    await selectEntry(dream);
  }

  async function saveNote(): Promise<void> {
    if (!selected || pending || historyLoading || historyError || session.initialResolutionComplete === false) return;
    const owner = principal;
    const revision = loadRevision;
    const dream = selected;
    const note = drafts[dream.id] ?? '';
    pending = true;
    const result = await saveDreamJournalEntry(owner, {
      id: createBrowserId(), dreamId: dream.id, title: dream.title, createdAt: new Date().toISOString(), note,
    });
    if (disposed || revision !== loadRevision || owner !== principal) return;
    pending = false;
    if (result.ok) {
      entries = result.entries;
      if ((drafts[dream.id] ?? '') === note) drafts = { ...drafts, [dream.id]: '' };
    }
    noteStatus = result.ok ? copy.saved : copy.saveError;
  }

  async function removeEntries(id?: string): Promise<void> {
    if (pending || historyLoading || historyError || session.initialResolutionComplete === false) return;
    const owner = principal;
    const revision = loadRevision;
    pending = true;
    const confirmed = await confirmInApp(id ? copy.confirmDelete : copy.confirmClear);
    if (disposed || revision !== loadRevision || owner !== principal) return;
    if (!confirmed) { pending = false; return; }
    const result = id ? await deleteDreamJournalEntry(owner, id) : await clearDreamJournal(owner);
    if (disposed || revision !== loadRevision || owner !== principal) return;
    pending = false;
    if (result.ok) entries = result.entries;
    status = result.ok ? (id ? copy.deleted : copy.cleared) : copy.saveError;
  }
</script>

<div class="div-page dream-page" data-practice-route-back>
  <div class="div-subbar">
    <div class="div-subbar-title-wrap">
      <span class="div-subbar-eyebrow">{copy.group}</span>
      <h1 class="div-subbar-title">{copy.title}</h1>
    </div>
    <button type="button" class="div-guide-btn" onclick={() => (guideOpen = true)}>
      <span aria-hidden="true">?</span> {copy.guide}
    </button>
  </div>

  {#snippet topicsSection()}
    <section class="dream-topics" aria-labelledby="dream-topic-heading">
      <h2 id="dream-topic-heading" class="div-section-accent-heading">{copy.topics}</h2>
      <div class="dream-topic-grid">
        {#each DREAM_TOPICS as topic (topic.id)}
          <button
            type="button"
            class="dream-topic-card"
            aria-pressed={category === topic.id}
            onclick={() => {
              category = category === topic.id ? 'all' : topic.id;
            }}
          >
            <span class="dream-topic-icon" aria-hidden="true">{topicIcons[topic.icon] ?? '✧'}</span>
            <span>
              <strong>{isEnglish ? topic.titleEn : topic.title}</strong>
              <small>{topicCounts.get(topic.id) ?? 0} {copy.articles}</small>
            </span>
          </button>
        {/each}
      </div>
    </section>
  {/snippet}

  {#if !detailOpen}
    <div class="dream-verse-banner">
      <p>{copy.verse}</p>
      <small>{copy.disclaimer}</small>
    </div>
    <div class="dream-search-wrap">
      <span aria-hidden="true">⌕</span>
      <input type="search" aria-label={copy.search} placeholder={copy.searchPlaceholder} bind:value={query} />
      {#if query}
        <button type="button" class="dream-circle-button" aria-label={copy.clearSearch} onclick={() => (query = '')}>✕</button>
      {/if}
    </div>
    {#if !hasQuery}
      {@render topicsSection()}
    {/if}
  {/if}

  <div class="dream-workspace">
    {#if !detailOpen}
      <section class="dream-list-col" aria-labelledby="dream-results-title">
        <div class="dream-list-heading">
          <h2 id="dream-results-title" class="div-section-accent-heading">
            {selectedTopic ? (isEnglish ? selectedTopic.titleEn : selectedTopic.title) : query.trim() ? copy.results : copy.popular}
          </h2>
          {#if category !== 'all'}
            <button type="button" class="div-btn div-btn--soft" onclick={() => (category = 'all')}>{copy.all}</button>
          {/if}
        </div>
        <span class="dream-result-count" role="status">{displayedEntries.length} {copy.articles}</span>
        {#if displayedEntries.length === 0}
          <div class="dream-empty div-card">
            <strong>{copy.emptyTitle}</strong>
            <p>{copy.emptyText}</p>
          </div>
        {:else}
          {#each displayedEntries as entry (entry.id)}
            <button
              id={`dream-row-${entry.id}`}
              type="button"
              class="dream-row-btn"
              aria-pressed={!mobile && selected?.id === entry.id}
              onclick={() => void selectEntry(entry)}
            >
              <span class="dream-row-main">
                <span class="dream-reference">{copy.reference}</span>
                <strong>
                  <ItalicParensText text={entry.title} />
                </strong>
                <span>
                  <ItalicParensText text={entry.short} />
                </span>
              </span>
              <span aria-hidden="true">→</span>
            </button>
          {/each}
        {/if}
      </section>
    {/if}
    {#if selected && (!mobile || detailOpen)}
      <DreamArticle
        entry={selected}
        {copy}
        status={noteStatus}
        note={drafts[selected.id] ?? ''}
        {pending}
        canSave={!historyLoading && !historyError && session.initialResolutionComplete !== false}
        storageError={historyError}
        onRetry={() => void readJournal()}
        onNote={(note) => {
          if (selected) drafts = { ...drafts, [selected.id]: note };
        }}
        onSave={() => void saveNote()}
      />
    {/if}
  </div>

  {#if !detailOpen && hasQuery}
    {@render topicsSection()}
  {/if}

  {#if status}
    <p class="div-toast" role="status">{status}</p>
  {/if}
  <DreamJournalPanel
    {entries}
    {copy}
    {isEnglish}
    loading={historyLoading}
    error={historyError}
    {pending}
    onOpen={(entry) => void openJournal(entry)}
    onDelete={(id) => void removeEntries(id)}
    onClear={() => void removeEntries()}
    onRetry={() => void readJournal()}
  />
</div>
{#if guideOpen}
  <DreamGuideDialog {copy} onClose={() => (guideOpen = false)} />
{/if}
