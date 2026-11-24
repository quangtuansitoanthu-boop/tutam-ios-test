<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount, tick } from 'svelte';
  import { page as routePage } from '$app/state';
  import { afterNavigate, replaceState } from '$app/navigation';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { getSessionContext, GUEST_SESSION, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { serverStateKeys } from '$lib/browser/server-state';
  import { approveAllMindful, decideModeration, fetchModerationQueue, ModerationApiError, prepareMindfulApproveAll, suspendModerationMember } from '$lib/browser/admin-community-moderation';
  import { createBrowserId } from '$lib/browser/random-id';
  import { adminModerationUi } from '$lib/i18n/admin-community-moderation';
  import { personalPracticeCopy } from '$lib/i18n/personal-practice-copy';
  import type { MindfulApproveAllPreparation, MindfulApproveAllPreparationInput, MindfulModerationKind, MindfulModerationState, ModerationCountSummary, ModerationDecision, ModerationMember, ModerationQueueItem, ModerationQueueKind } from '$lib/contracts/community-moderation';
  import type { PageSessionDTO } from '$lib/server/auth/types';
  import type { AdminMember } from '../members/admin-member-types';
  import AdminMemberSuspendDialog from '../members/AdminMemberSuspendDialog.svelte';
  import AdminModerationDecisionDialog from './AdminModerationDecisionDialog.svelte';
  import '$lib/styles/admin-member-management.css';

  const queryClient = useQueryClient();
  const locale = getLocaleContext();
  const t = $derived(adminModerationUi[locale.current]);
  const keys = serverStateKeys.communityModeration;
  // Context đã có phiên SSR trước khi root đăng ký snapshot cho các browser owner.
  const sessionStore = getSessionContext();
  let session = $state(sessionStore.value);
  const principal = $derived(session.authenticated && session.user?.role === 'admin' ? session.user.id : null);
  const mainQueues = ['mindful', 'comments'] as const;
  const reviewStates = ['pending', 'published'] as const;
  const postKinds = ['all', 'repentance', 'good_deed'] as const;
  // Existing report and profile tools remain reachable by direct admin link.
  function queueFromUrl(url: URL): ModerationQueueKind {
    const requested = url.searchParams.get('moderation');
    if (requested === 'comments' || requested === 'reports' || requested === 'profiles') return requested;
    return 'mindful';
  }
  let kind = $state<ModerationQueueKind>(queueFromUrl(routePage.url));
  const legacyQueue = $derived(kind === 'profiles' || kind === 'reports');
  let reviewState = $state<MindfulModerationState>('pending');
  let postKind = $state<MindfulModerationKind | 'all'>('all');
  let cursors = $state<Array<string | null>>([null]);
  let page = $state(0);
  let selected = $state<ModerationQueueItem | null>(null);
  let expandedId = $state<string | null>(null);
  let action = $state<ModerationDecision['action'] | 'approveAll' | null>(null);
  let reason = $state('');
  let busy = $state(false);
  let error = $state('');
  let notice = $state('');
  let conflict = $state(false);
  let suspending = $state<AdminMember | null>(null);
  interface BulkApproval { preparation: MindfulApproveAllPreparation; postKind?: MindfulModerationKind; after: string | null; updated: number; conflicted: number; started: boolean; }
  let bulk = $state<BulkApproval | null>(null);
  let preparationRequest = $state<MindfulApproveAllPreparationInput | null>(null);
  let preparing = $state(false);
  let operationId = '';
  let detail = $state<HTMLElement | null>(null);
  const locked = $derived(busy || Boolean(bulk?.started));
  const bulkProgress = $derived(bulk?.started ? t.bulkProgress.replace('{updated}', String(bulk.updated)).replace('{conflicted}', String(bulk.conflicted)) : '');
  const bulkScope = $derived(bulk ? t.bulkScope.replace('{kind}', bulk.postKind ? t[bulk.postKind] : t.allKinds).replace('{cutoff}', date(bulk.preparation.cutoff)) : '');
  let epoch = 0;
  let mutation: AbortController | null = null;
  function pageKey(owner: string, requestedKind: ModerationQueueKind, after: string | null, requestedState = reviewState, requestedPostKind = postKind) {
    return requestedKind === 'mindful' ? [...keys.kind(owner, requestedKind), requestedState, requestedPostKind, after] : keys.page(owner, requestedKind, after);
  }
  const queue = createQuery(() => {
    const requestedKind = kind;
    const after = cursors[page];
    const requestedState = reviewState, requestedPostKind = postKind;
    return {
      queryKey: pageKey(principal ?? '', requestedKind, after, requestedState, requestedPostKind),
      queryFn: ({ signal }) => fetchModerationQueue(requestedKind, after, signal, requestedKind === 'mindful' ? { state: requestedState, ...(requestedPostKind === 'all' ? {} : { postKind: requestedPostKind }) } : undefined),
      enabled: browser && Boolean(principal), staleTime: 30_000, retry: false,
      refetchOnWindowFocus: false, refetchOnReconnect: false,
    };
  }, () => queryClient);

  function clearPrivate(next: PageSessionDTO) {
    const previous = principal;
    epoch++; mutation?.abort(); mutation = null;
    selected = null; expandedId = null; action = null; suspending = null; reason = ''; busy = false; error = ''; notice = ''; conflict = false;
    bulk = null; preparationRequest = null; preparing = false; operationId = '';
    cursors = [null]; page = 0; session = next;
    if (previous) {
      void queryClient.cancelQueries({ queryKey: keys.principal(previous) });
      queryClient.removeQueries({ queryKey: keys.principal(previous) });
    }
  }
  $effect(() => {
    if (principal && queue.error instanceof ModerationApiError && [401, 403].includes(queue.error.status)) clearPrivate(GUEST_SESSION);
  });
  afterNavigate(({ to }) => {
    if (!to || to.url.pathname !== '/admin/community') return;
    const next = queueFromUrl(to.url);
    if (kind !== next) changeQueue(next, false);
  });
  onMount(() => {
    const changed = (event: Event) => {
      const next = (event as CustomEvent<PageSessionDTO>).detail;
      if (next?.user?.id !== session.user?.id || next?.user?.role !== session.user?.role || next?.authenticated !== session.authenticated) clearPrivate(next ?? GUEST_SESSION);
    };
    window.addEventListener(SESSION_CHANGE_EVENT, changed);
    return () => { epoch++; mutation?.abort(); window.removeEventListener(SESSION_CHANGE_EVENT, changed); };
  });
  function changeQueue(next: ModerationQueueKind, updateUrl = true) {
    if (locked) return;
    if (updateUrl && browser) {
      const url = new URL(window.location.href);
      if (next === 'mindful') url.searchParams.set('moderation', 'mindful');
      else url.searchParams.delete('moderation');
      if (url.href !== window.location.href) replaceState(url, routePage.state);
    }
    kind = next; cursors = [null]; page = 0; selected = null; expandedId = null; notice = ''; error = '';
    preparationRequest = null;
  }
  function changeFilter(nextState: MindfulModerationState, nextKind: MindfulModerationKind | 'all') {
    if (locked) return;
    reviewState = nextState; postKind = nextKind; cursors = [null]; page = 0; selected = null; expandedId = null; notice = ''; error = ''; preparationRequest = null;
  }
  function changePage(next: number) {
    if (locked) return;
    if (next > page && queue.data?.nextCursor) cursors = [...cursors.slice(0, page + 1), queue.data.nextCursor];
    page = next; selected = null; expandedId = null; notice = ''; error = '';
  }
  function open(next: ModerationDecision['action']) { action = next; operationId = createBrowserId(); reason = ''; error = ''; conflict = false; }
  function close() { if (!busy) { action = null; suspending = null; error = ''; conflict = false; if (bulk && !bulk.started) { bulk = null; preparationRequest = null; } } }
  function date(value: string | null | undefined) { return value ? new Date(value).toLocaleString(locale.current === 'en' ? 'en-GB' : 'vi-VN') : t.unavailable; }
  function countLabel(summary: ModerationCountSummary | undefined) { return summary ? summary.capped ? '99+' : String(summary.count) : ''; }
  function remaining(value: string | null | undefined) {
    if (!value) return t.unavailable;
    const hours = Math.ceil((new Date(value).getTime() - Date.now()) / 3_600_000);
    return hours > 0 ? t.remainingHours.replace('{hours}', String(hours)) : t.dueNow;
  }
  async function select(item: ModerationQueueItem) {
    if (expandedId === item.id) {
      expandedId = null;
      selected = null;
    } else {
      expandedId = item.id;
      selected = item;
      error = '';
      await tick();
      detail?.focus({ preventScroll: true });
      detail?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  }
  function quickApprove(item: ModerationQueueItem) {
    selected = item;
    open('approve');
  }
  function quickReject(item: ModerationQueueItem) {
    selected = item;
    open('reject');
  }
  function quickResolve(item: ModerationQueueItem) {
    selected = item;
    open('resolve');
  }
  function quickHide(item: ModerationQueueItem) {
    selected = item;
    open('hide');
  }
  function openSuspend(member: ModerationMember) {
    error = '';
    suspending = { ...member, kind: 'member', accountType: member.role === 'admin' ? 'admin' : 'member', email: null,
      username: null, suspendedAt: null, avatarUrl: null, createdAt: null, updatedAt: null };
  }
  async function reload() {
    if (busy) return;
    if (conflict) { bulk = null; preparationRequest = null; }
    close(); selected = null; expandedId = null;
    await queryClient.invalidateQueries({ queryKey: keys.kind(principal ?? '', kind) });
    await queue.refetch();
  }
  function prepareBatchCurrentPage() {
    if (locked || !principal || !queue.data?.items.length) return;
    action = 'approveAll';
  }
  async function submitBatchCurrentPage() {
    if (busy || !principal || !queue.data?.items.length) return;
    const items = [...queue.data.items];
    const ticket = epoch, owner = principal, controller = new AbortController();
    mutation = controller; busy = true; error = ''; conflict = false;
    let updatedCount = 0;
    try {
      for (const it of items) {
        if (ticket !== epoch || controller.signal.aborted) break;
        await decideModeration(it.kind, it.id, { action: 'approve', revision: it.revision }, controller.signal);
        updatedCount++;
      }
      notice = `${t.saved} (${updatedCount})`;
      action = null; selected = null; expandedId = null;
      await queryClient.invalidateQueries({ queryKey: keys.kind(owner, kind) });
    } catch (cause) {
      if (ticket !== epoch || controller.signal.aborted) return;
      if (cause instanceof ModerationApiError && [401, 403].includes(cause.status)) { clearPrivate(GUEST_SESSION); return; }
      conflict = cause instanceof ModerationApiError && [404, 409].includes(cause.status);
      error = conflict ? t.conflict : t.error;
    } finally {
      if (ticket === epoch) { busy = false; mutation = null; }
    }
  }
  async function prepareBulk() {
    if (locked || !principal || kind !== 'mindful' || reviewState !== 'pending') return;
    const ticket = epoch, owner = principal, controller = new AbortController();
    preparationRequest ??= { operationId: createBrowserId(), ...(postKind === 'all' ? {} : { postKind }) };
    const request = preparationRequest;
    mutation = controller; busy = true; preparing = true; error = ''; notice = '';
    try {
      const preparation = await prepareMindfulApproveAll(request, controller.signal);
      if (ticket !== epoch || principal !== owner) return;
      bulk = { preparation, ...(request.postKind ? { postKind: request.postKind } : {}), after: null, updated: 0, conflicted: 0, started: false };
      action = 'approveAll'; conflict = false;
    } catch (cause) {
      if (ticket !== epoch || controller.signal.aborted) return;
      if (cause instanceof ModerationApiError && [401, 403].includes(cause.status)) { clearPrivate(GUEST_SESSION); return; }
      if (cause instanceof ModerationApiError && cause.status === 409) preparationRequest = null;
      error = t.bulkPrepareError;
    } finally { if (ticket === epoch) { busy = false; preparing = false; mutation = null; } }
  }
  async function submitBulk() {
    if (busy || !principal || !bulk) return;
    const ticket = epoch, owner = principal, controller = new AbortController();
    mutation = controller; busy = true; error = ''; conflict = false;
    bulk = { ...bulk, started: true };
    try {
      while (bulk) {
        const step: BulkApproval = bulk;
        const result = await approveAllMindful({ operationId: step.preparation.operationId, cutoff: step.preparation.cutoff, after: step.after, ...(step.postKind ? { postKind: step.postKind } : {}) }, controller.signal);
        if (ticket !== epoch || principal !== owner) return;
        if (result.operationId !== step.preparation.operationId || result.cutoff !== step.preparation.cutoff || (result.nextCursor !== null && result.nextCursor === step.after)) throw new ModerationApiError(502);
        bulk = { ...step, after: result.nextCursor, updated: step.updated + result.updated, conflicted: step.conflicted + result.conflicted };
        if (result.nextCursor === null) {
          notice = `${t.bulkDone} ${t.bulkProgress.replace('{updated}', String(bulk.updated)).replace('{conflicted}', String(bulk.conflicted))}`;
          action = null; bulk = null; preparationRequest = null; selected = null; expandedId = null; cursors = [null]; page = 0;
          await queryClient.invalidateQueries({ queryKey: keys.kind(owner, 'mindful') });
          break;
        }
      }
    } catch (cause) {
      if (ticket !== epoch || controller.signal.aborted) return;
      if (cause instanceof ModerationApiError && [401, 403].includes(cause.status)) { clearPrivate(GUEST_SESSION); return; }
      conflict = cause instanceof ModerationApiError && [404, 409].includes(cause.status);
      error = conflict ? t.conflict : t.bulkFailed;
    } finally { if (ticket === epoch) { busy = false; mutation = null; } }
  }
  async function submit(suspend = false) {
    if (action === 'approveAll') {
      if (kind === 'mindful') await submitBulk();
      else await submitBatchCurrentPage();
      return;
    }
    if (busy || !principal || (!suspend && (!action || !selected))) return;
    if (action === 'reject' && !reason.trim()) { error = t.reasonRequired; return; }
    const target = action === 'hide' ? selected?.target : selected;
    if (!suspend && !target) return;
    const ticket = epoch, owner = principal, controller = new AbortController();
    mutation = controller; busy = true; error = ''; conflict = false;
    try {
      if (suspend && suspending) await suspendModerationMember(suspending.id, controller.signal);
      else if (action && target) await decideModeration(target.kind, target.id, {
        action, revision: target.revision, ...(target.kind === 'mindful' ? { operationId } : {}), ...(action === 'reject' ? { reason: reason.trim() } : {}),
      }, controller.signal);
      if (ticket !== epoch || principal !== owner) return;
      notice = suspend ? t.suspended : t.saved;
      if (action === 'hide' && target) void queryClient.invalidateQueries({ queryKey: keys.kind(owner, target.kind), refetchType: 'none' });
      action = null; suspending = null; selected = null; expandedId = null; reason = '';
      await queryClient.invalidateQueries({ queryKey: keys.kind(owner, kind) });
    } catch (cause) {
      if (ticket !== epoch || controller.signal.aborted) return;
      if (cause instanceof ModerationApiError && [401, 403].includes(cause.status)) { clearPrivate(GUEST_SESSION); return; }
      conflict = cause instanceof ModerationApiError && [404, 409].includes(cause.status);
      error = conflict ? t.conflict : t.error;
    } finally {
      if (ticket === epoch) { busy = false; mutation = null; }
    }
  }
</script>

<section class="admin-moderation" class:admin-moderation-mindful={kind === 'mindful'} aria-labelledby="admin-moderation-title" aria-busy={busy || queue.isFetching}>
  <header>
    <h2 id="admin-moderation-title">{legacyQueue ? t[kind] : kind === 'mindful' ? t.mindfulTitle : t.title}</h2>
    <p>{kind === 'mindful' ? t.mindfulDescription : t.description}</p>
  </header>
  {#if !principal}
    <p role="alert">{t.forbidden}</p>
  {:else}
    <nav class="admin-moderation-tabs" aria-label={t.queues}>
      {#each mainQueues as value (value)}
        <button
          type="button"
          aria-pressed={kind === value}
          disabled={locked}
          onclick={() => changeQueue(value)}
        >
          {t[value]}
        </button>
      {/each}
    </nav>

    {#if kind === 'mindful'}
      <div class="mindful-filters">
        <fieldset>
          <legend>{t.mindfulState}</legend>
          <div class="mindful-state-tabs">
            {#each reviewStates as value (value)}
              {@const summary = queue.data?.summary?.[value]}
              <button type="button" aria-pressed={reviewState === value} disabled={locked} onclick={() => changeFilter(value, postKind)}>
                <span>{t[value]}</span>
                {#if summary !== undefined}
                  <span class="tab-count-badge">{summary.capped ? '99+' : summary.count}</span>
                {/if}
              </button>
            {/each}
          </div>
        </fieldset>
        <fieldset>
          <legend>{t.postKindFilter}</legend>
          <div class="mindful-filter">
            {#each postKinds as value (value)}
              <button type="button" aria-pressed={postKind === value} disabled={locked} onclick={() => changeFilter(reviewState, value)}>
                {value === 'all' ? t.allKinds : t[value]}
              </button>
            {/each}
          </div>
        </fieldset>
      </div>
      {#if reviewState === 'pending'}
        {@const pendingCount = queue.data?.summary?.pending?.count}
        <div class="bulk-actions-banner">
          <span>{t.approveFiltered}</span>
          <button
            type="button"
            class="primary mod-btn btn-approve btn-bulk"
            disabled={locked || queue.isFetching || !pendingCount}
            onclick={() => void prepareBulk()}
          >
            {#if preparing}
              {t.preparing}
            {:else if pendingCount && pendingCount > 0}
              {t.approveAll} ({queue.data?.summary?.pending?.capped ? '99+' : pendingCount})
            {:else}
              {t.approveAll}
            {/if}
          </button>
        </div>
      {/if}
      {#if bulk?.started && action !== 'approveAll'}
        <div class="mindful-bulk-progress">
          <p role="status">{bulkProgress}</p>
          <p>{t.bulkFailed}</p>
          <button type="button" onclick={() => { action = 'approveAll'; }}>{t.resume}</button>
        </div>
      {/if}
      {#if error && !action}<p class="admin-moderation-error" role="alert">{error}</p>{/if}
    {:else if kind !== 'reports' && queue.data?.items.length}
      <div class="bulk-actions-banner">
        <span>{kind === 'comments' ? t.approveCommentsPage : t.approveItemsPage}</span>
        <button
          type="button"
          class="primary mod-btn btn-approve btn-bulk"
          disabled={locked || queue.isFetching}
          onclick={prepareBatchCurrentPage}
        >
          {t.approveAll} ({queue.data.items.length})
        </button>
      </div>
    {/if}

    {#if notice}<p role="status">{notice}</p>{/if}
    {#if queue.isPending}
      <div class="admin-moderation-status-loading">
        <p role="status">{t.loading}</p>
      </div>
    {:else if queue.isError}
      <div class="admin-moderation-error-box" role="alert">
        <p class="error-msg">
          {#if queue.error instanceof ModerationApiError && queue.error.code === 'invalid_queue' && kind === 'mindful'}
            {t.mindfulBackendOutdated}
          {:else}
            {t.loadError}
          {/if}
        </p>
        {#if queue.error instanceof ModerationApiError}
          <p class="error-detail">
            <small>
              (Mã lỗi: {queue.error.status}{#if queue.error.code} - {queue.error.code}{/if}{#if queue.error.serverMessage}: {queue.error.serverMessage}{:else if queue.error.message && queue.error.message !== `moderation_${queue.error.status}`}: {queue.error.message}{/if})
            </small>
          </p>
        {:else if queue.error instanceof Error}
          <p class="error-detail"><small>({queue.error.message})</small></p>
        {/if}
        <button type="button" class="btn-retry" onclick={reload}>{t.retry}</button>
      </div>
    {:else if !queue.data?.items.length}
      <p class="admin-moderation-empty">{kind === 'mindful' ? reviewState === 'pending' ? t.emptyPending : t.emptyPublished : t.empty}</p>
    {:else}
      <div class="admin-moderation-grid">
        <div class="admin-moderation-list">
          {#each queue.data.items as item (item.id)}
            {@const isExpanded = expandedId === item.id}
            <article class="admin-moderation-card" class:mindful-selected={selected?.id === item.id} class:card-expanded={isExpanded}>
              <div class="mod-card-header">
                <div class="mod-card-tags">
                  <span class="mod-tag status-main">
                    {item.kind === 'mindful'
                      ? (item.mindfulKind ? t[item.mindfulKind] : t.mindful)
                      : (item.kind === 'reports' ? t.openReport : t.pending)}
                  </span>
                  {#if item.kind === 'mindful'}
                    <span class="mod-tag status-sub">
                      {reviewState === 'pending' ? t.pending : t.published}
                    </span>
                  {/if}
                </div>
                <div class="mod-card-time">
                  <time datetime={item.submittedAt}>
                    {new Date(item.submittedAt).toLocaleString(locale.current === 'en' ? 'en-GB' : 'vi-VN')}
                  </time>
                  {#if item.kind === 'mindful' && reviewState === 'pending'}
                    <span class="mod-remaining-time">{remaining(item.reviewDueAt)}</span>
                  {/if}
                </div>
              </div>

              <div class="mod-card-body">
                <div class="mod-avatar-col">
                  {#if item.avatarUrl}
                    <img src={item.avatarUrl} alt="" width="48" height="48" referrerpolicy="no-referrer" class="mod-avatar-img" />
                  {:else}
                    <div class="mod-avatar-fallback" aria-hidden="true">
                      {item.displayName ? item.displayName.charAt(0).toUpperCase() : '?'}
                    </div>
                  {/if}
                </div>
                <div class="mod-info-col">
                  {#if item.kind === 'profiles'}
                    <div class="mod-profile-names">
                      <div class="profile-field proposed">
                        <span class="field-label">{t.submittedIdentity}:</span>
                        <strong class="field-name">{item.displayName}</strong>
                      </div>
                      <div class="profile-field current">
                        <span class="field-label">{t.approvedIdentity}:</span>
                        <span class="field-name-old">{item.approvedIdentity?.displayName || t.unavailable}</span>
                      </div>
                    </div>
                  {:else}
                    <h3 class="mod-author-name">{item.displayName}</h3>
                    {#if item.kind === 'reports'}
                      <p class="mod-report-reason"><strong>{t.reportReason}:</strong> {item.reportReason ? t[item.reportReason] : ''}</p>
                    {/if}
                    <p class="mod-content-preview">{item.content}</p>
                  {/if}
                </div>
              </div>

              <div class="mod-card-actions">
                {#if item.kind === 'mindful' && reviewState === 'published'}
                  <button
                    type="button"
                    class="mod-btn btn-danger"
                    disabled={locked}
                    onclick={() => { selected = item; open('delete'); }}
                  >
                    {t.delete}
                  </button>
                {:else if item.kind === 'reports'}
                  <button
                    type="button"
                    class="mod-btn btn-approve primary"
                    disabled={locked}
                    onclick={() => quickResolve(item)}
                  >
                    {t.resolve}
                  </button>
                  <button
                    type="button"
                    class="mod-btn btn-reject"
                    disabled={locked}
                    onclick={() => quickHide(item)}
                  >
                    {t.hide}
                  </button>
                {:else}
                  <button
                    type="button"
                    class="mod-btn btn-approve primary"
                    disabled={locked}
                    onclick={() => quickApprove(item)}
                  >
                    <span class="btn-icon">✓</span> {item.kind === 'mindful' ? t.approveNow : t.approve}
                  </button>
                  <button
                    type="button"
                    class="mod-btn btn-reject"
                    disabled={locked}
                    onclick={() => quickReject(item)}
                  >
                    <span class="btn-icon">✕</span> {t.reject}
                  </button>
                {/if}

                <button
                  type="button"
                  class="mod-btn btn-detail"
                  disabled={locked}
                  aria-expanded={isExpanded}
                  onclick={() => void select(item)}
                >
                  {#if isExpanded}
                    <span>▲ {t.collapse}</span>
                  {:else}
                    <span>▼ {item.kind === 'mindful' ? t.viewMindful : t.view}</span>
                  {/if}
                </button>
              </div>

              {#if isExpanded}
                <div
                  class="mod-card-expanded admin-moderation-card admin-moderation-context"
                  role="article"
                  aria-label={item.kind === 'mindful' ? t.mindfulContext : t.context}
                  tabindex="-1"
                  bind:this={detail}
                >
                  <h4>{item.kind === 'mindful' ? t.mindfulContext : t.context}</h4>

                  {#if item.kind === 'reports'}
                    <div class="mod-expanded-report">
                      <p><strong>{t.reportReason}:</strong> {item.reportReason ? t[item.reportReason] : ''}</p>
                      <p>{item.content}</p>
                    </div>
                    {#if item.target}
                      <div class="mod-expanded-target">
                        <h5>Nội dung bị báo cáo:</h5>
                        <p><strong>{item.target.displayName}:</strong> {item.target.content}</p>
                      </div>
                    {/if}
                  {:else if item.kind === 'profiles'}
                    <div class="mod-profile-compare-grid">
                      <div class="profile-box proposed">
                        <h5>{t.submittedIdentity}</h5>
                        {#if item.avatarUrl}
                          <img src={item.avatarUrl} alt={item.displayName} width="64" height="64" referrerpolicy="no-referrer" />
                        {/if}
                        <strong>{item.displayName}</strong>
                      </div>
                      {#if item.approvedIdentity}
                        <div class="profile-box current">
                          <h5>{t.approvedIdentity}</h5>
                          {#if item.approvedIdentity.avatarUrl}
                            <img src={item.approvedIdentity.avatarUrl} alt={item.approvedIdentity.displayName} width="64" height="64" referrerpolicy="no-referrer" />
                          {/if}
                          <strong>{item.approvedIdentity.displayName}</strong>
                        </div>
                      {/if}
                    </div>
                  {:else}
                    <div class="mod-expanded-full-content">
                      <p>{item.content}</p>
                    </div>
                  {/if}

                  {#if item.articleId}
                    <p class="mod-meta-link"><strong>{t.article}:</strong> {item.articleTitle || item.articleId}</p>
                  {/if}
                  {#if item.parentId}
                    <blockquote class="mod-meta-parent"><strong>{t.parent}:</strong> {item.parentContent || t.unavailable}</blockquote>
                  {/if}

                  {#if item.kind === 'mindful'}
                    <dl class="mindful-review-meta">
                      <div><dt>{t.submitted}</dt><dd>{date(item.submittedAt)}</dd></div>
                      <div>
                        <dt>{reviewState === 'pending' ? t.reviewDue : item.reviewState === 'auto_approved' ? t.autoPublished : t.publishedAt}</dt>
                        <dd>{date(reviewState === 'pending' ? item.reviewDueAt : item.publishedAt)}</dd>
                      </div>
                      {#if reviewState === 'pending'}
                        <div><dt>{t.remaining}</dt><dd>{remaining(item.reviewDueAt)}</dd></div>
                      {/if}
                    </dl>
                    <p class="mindful-policy">{reviewState === 'pending' ? t.pendingPolicy : t.publishedPolicy}</p>
                  {/if}

                  <div class="mod-expanded-actions">
                    {#if item.kind === 'mindful' && reviewState === 'published'}
                      <button type="button" class="admin-moderation-error" disabled={locked} onclick={() => open('delete')}>{t.delete}</button>
                    {:else if item.kind !== 'reports'}
                      <button type="button" class="primary" disabled={locked} onclick={() => open('approve')}>{item.kind === 'mindful' ? t.approveNow : t.approve}</button>
                      <button type="button" disabled={locked} onclick={() => open('reject')}>{t.reject}</button>
                    {:else}
                      {#if item.target}<button type="button" disabled={busy} onclick={() => open('hide')}>{t.hide}</button>{/if}
                      <button type="button" disabled={busy} onclick={() => open('resolve')}>{t.resolve}</button>
                    {/if}
                    {#if item.member && !item.member.isSelf && item.member.status === 'active'}
                      <button type="button" class="admin-moderation-error" disabled={locked} onclick={() => item.member && openSuspend(item.member)}>{t.suspend}</button>
                    {/if}
                  </div>
                </div>
              {/if}
            </article>
          {/each}
        </div>
      </div>
    {/if}

    {#if queue.data?.items.length}
      <nav class="admin-moderation-actions moderation-pagination" aria-label={t.pagination}>
        <button type="button" disabled={locked || queue.isFetching || page === 0} onclick={() => changePage(page - 1)}>{t.previous}</button>
        <button type="button" disabled={locked || queue.isFetching || !queue.data?.nextCursor} onclick={() => changePage(page + 1)}>{t.next}</button>
      </nav>
    {/if}
    {#if kind === 'mindful'}
      <aside class="mindful-policy">
        <strong>{t.policyTitle}</strong>
        <p>{personalPracticeCopy[locale.current].sharePolicyWarning}</p>
        <p>{t.moderationPolicyNote}</p>
      </aside>
    {/if}
  {/if}
</section>

{#if action && principal}
  <AdminModerationDecisionDialog
    {action}
    locale={locale.current}
    {busy}
    {error}
    {conflict}
    bind:reason
    mindful={kind === 'mindful'}
    scope={bulk ? `${bulkScope}\n${t.bulkCount.replace('{count}', countLabel(bulk.preparation.summary))}` : (kind !== 'mindful' && queue.data?.items.length ? `${t.bulkScope.replace('{kind}', t[kind]).replace('{cutoff}', date(new Date().toISOString()))}\n${t.bulkCount.replace('{count}', String(queue.data.items.length))}` : '')}
    progressText={action === 'approveAll' ? bulkProgress : ''}
    resuming={action === 'approveAll' && Boolean(bulk?.started)}
    onClose={close}
    onConfirm={() => void submit()}
    onReload={() => void reload()}
  />
{/if}
{#if suspending && principal}
  <AdminMemberSuspendDialog
    member={suspending}
    targetStatus="suspended"
    {busy}
    {error}
    onClose={close}
    onConfirm={() => submit(true)}
  />
{/if}

<style>
  .admin-moderation .admin-moderation-tabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
    width: 100%;
    max-width: 440px;
    padding: 4px;
    margin: 0 0 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--bg2);
    box-sizing: border-box;
  }
  .admin-moderation-tabs button {
    display: flex;
    align-items: center;
    justify-content: center;
    min-inline-size: 0;
    min-height: 44px;
    padding: 8px 10px;
    border: 1px solid transparent;
    border-radius: calc(var(--radius-control) - 3px);
    background: transparent;
    color: var(--text2);
    font-size: 13.5px;
    font-weight: 600;
    text-align: center;
    cursor: pointer;
    transition: all .18s ease;
    box-sizing: border-box;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .admin-moderation-tabs button[aria-pressed='true'] {
    background: var(--card);
    border-color: var(--border2);
    color: var(--brown);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
    font-weight: 700;
  }
  :root[data-theme='dark'] .admin-moderation-tabs button[aria-pressed='true'] {
    background: var(--bg3);
    color: var(--gold);
    border-color: var(--border);
  }

  .admin-moderation-mindful .mod-card-expanded p { text-align: justify; }
  .mindful-filters {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 100%;
    max-width: 720px;
    box-sizing: border-box;
    margin: 0 0 16px;
    padding: 14px;
    border: 1px solid var(--border2);
    border-radius: var(--radius-control);
    background: var(--card);
  }
  @media (min-width: 750px) {
    .mindful-filters {
      display: grid;
      grid-template-columns: minmax(0, 260px) minmax(0, 1fr);
      align-items: start;
    }
  }
  .mindful-filters fieldset {
    min-inline-size: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .mindful-filters legend {
    padding: 0;
    margin-bottom: 8px;
    color: var(--text2);
    font-size: 12px;
    font-weight: 600;
  }
  .mindful-state-tabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    width: 100%;
    box-sizing: border-box;
  }
  .mindful-state-tabs button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-inline-size: 0;
    min-height: 42px;
    padding: 8px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg);
    color: var(--text2);
    font-size: 13px;
    font-weight: 500;
    text-align: center;
    cursor: pointer;
    transition: all .15s ease;
    box-sizing: border-box;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mindful-state-tabs button[aria-pressed='true'] {
    border-color: var(--gold);
    background: var(--gold-light);
    color: var(--brown);
    font-weight: 600;
  }
  :root[data-theme='dark'] .mindful-state-tabs button[aria-pressed='true'] {
    color: var(--gold);
  }
  .tab-count-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    background: color-mix(in srgb, var(--gold) 20%, transparent);
    color: inherit;
    flex-shrink: 0;
  }
  .mindful-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    width: 100%;
    box-sizing: border-box;
  }
  .mindful-filter button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    min-width: 0;
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg);
    color: var(--text2);
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    transition: all .15s ease;
    box-sizing: border-box;
  }
  .mindful-filter button[aria-pressed='true'] {
    border-color: var(--gold);
    background: var(--gold-light);
    color: var(--brown);
    font-weight: 600;
  }
  :root[data-theme='dark'] .mindful-filter button[aria-pressed='true'] {
    color: var(--gold);
  }
  .mindful-selected { border-color: var(--gold); background: var(--gold-light); }

  /* Bulk action banner */
  .bulk-actions-banner {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    padding: 14px;
    margin-bottom: 16px;
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--gold) 10%, var(--card));
    border: 1px solid color-mix(in srgb, var(--gold) 30%, transparent);
    box-sizing: border-box;
    width: 100%;
  }
  .bulk-actions-banner span {
    font-size: 13px;
    color: var(--text);
    font-weight: 500;
    line-height: 1.45;
  }
  .bulk-actions-banner .btn-bulk {
    width: 100%;
    min-height: 44px;
    font-size: 13.5px;
    font-weight: 600;
    border-radius: 10px;
    box-sizing: border-box;
  }
  @media (min-width: 600px) {
    .bulk-actions-banner {
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
    }
    .bulk-actions-banner .btn-bulk {
      width: auto;
      min-width: 180px;
    }
  }

  /* Status and Error states */
  .admin-moderation-status-loading {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 20px 0;
    color: var(--text2);
    font-size: 13.5px;
  }
  .admin-moderation-error-box {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 14px;
    margin: 12px 0 16px;
    border: 1px solid color-mix(in srgb, var(--red) 30%, transparent);
    border-radius: var(--radius-control);
    background: color-mix(in srgb, var(--red) 8%, var(--card));
    box-sizing: border-box;
    width: 100%;
  }
  .admin-moderation-error-box .error-msg {
    margin: 0;
    color: var(--danger-text);
    font-size: 13.5px;
    font-weight: 500;
  }
  .admin-moderation-error-box .error-detail {
    margin: 0;
    color: var(--text2);
    font-size: 12px;
  }
  .admin-moderation-error-box .btn-retry {
    min-height: 40px;
    min-width: 100px;
    padding: 8px 16px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--card);
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background .15s ease;
  }
  .admin-moderation-error-box .btn-retry:hover {
    background: var(--hover);
  }

  /* Pagination */
  .moderation-pagination {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    width: 100%;
    margin-top: 16px;
    box-sizing: border-box;
  }
  .moderation-pagination button {
    width: 100%;
    min-height: 44px;
    justify-content: center;
    text-align: center;
    box-sizing: border-box;
    border-radius: var(--radius-sm);
  }
  @media (min-width: 600px) {
    .moderation-pagination {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .moderation-pagination button {
      width: auto;
      min-width: 110px;
    }
  }

  /* Moderation list & Card styling */
  .admin-moderation-grid {
    display: block;
    width: 100%;
  }
  .admin-moderation-list {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
    width: 100%;
  }
  .admin-moderation-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    background: var(--bg);
    transition: border-color .15s ease, box-shadow .15s ease;
  }
  @media (max-width: 480px) {
    .admin-moderation-card {
      padding: 14px 12px;
      gap: 10px;
    }
  }
  .admin-moderation-card:hover {
    border-color: color-mix(in srgb, var(--gold) 50%, var(--border));
  }
  .card-expanded {
    border-color: var(--gold);
    box-shadow: 0 4px 16px rgba(0, 0, 0, .06);
  }

  /* Header inside card */
  .mod-card-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: var(--font-size-meta);
  }
  .mod-card-tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .mod-tag {
    display: inline-flex;
    align-items: center;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.3;
  }
  .status-main {
    background: var(--gold-light);
    color: var(--brown);
    border: 1px solid color-mix(in srgb, var(--gold) 35%, transparent);
  }
  :root[data-theme='dark'] .status-main {
    color: var(--gold);
  }
  .status-sub {
    background: var(--bg2);
    color: var(--text2);
    border: 1px solid var(--border);
  }
  .mod-card-time {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    color: var(--text2);
    font-size: 11.5px;
  }
  .mod-remaining-time {
    font-weight: 600;
    color: var(--brown);
  }
  :root[data-theme='dark'] .mod-remaining-time {
    color: var(--gold);
  }

  /* Body inside card */
  .mod-card-body {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .mod-avatar-col {
    flex: 0 0 48px;
  }
  .mod-avatar-img {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    object-fit: cover;
    border: 1px solid var(--border2);
  }
  .mod-avatar-fallback {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: var(--gold-light);
    color: var(--brown);
    font-size: 18px;
    font-weight: 700;
    border: 1px solid color-mix(in srgb, var(--gold) 30%, transparent);
  }
  :root[data-theme='dark'] .mod-avatar-fallback {
    color: var(--gold);
  }
  .mod-info-col {
    flex: 1;
    min-width: 0;
  }
  .mod-author-name {
    margin: 0 0 4px;
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
  }
  .mod-report-reason {
    margin: 0 0 4px;
    font-size: 12.5px;
    color: var(--danger-text);
  }
  .mod-content-preview {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text2);
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  /* Profile comparison row in card */
  .mod-profile-names {
    display: grid;
    gap: 4px;
    font-size: 13px;
  }
  .profile-field {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px;
  }
  .field-label {
    color: var(--text2);
    font-size: 12px;
  }
  .field-name {
    color: var(--text);
    font-weight: 600;
  }
  .field-name-old {
    color: var(--muted);
    font-style: italic;
  }

  /* Actions row */
  .mod-card-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding-top: 10px;
    border-top: 1px solid var(--border2);
    width: 100%;
    box-sizing: border-box;
  }
  .mod-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 44px;
    min-width: 0;
    max-width: 100%;
    padding: 8px 10px;
    border-radius: var(--radius-control);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all .15s ease;
    box-sizing: border-box;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mod-card-actions .btn-approve {
    background: var(--gold);
    border: 1px solid var(--gold);
    color: var(--on-gold);
    grid-column: 1;
    width: 100%;
  }
  .mod-card-actions .btn-approve:hover:not(:disabled) {
    background: var(--gold2);
  }
  .mod-card-actions .btn-reject {
    background: var(--card);
    border: 1px solid color-mix(in srgb, var(--red) 40%, var(--border));
    color: var(--danger-text);
    grid-column: 2;
    width: 100%;
  }
  .mod-card-actions .btn-reject:hover:not(:disabled) {
    background: color-mix(in srgb, var(--red) 10%, transparent);
  }
  .mod-card-actions .btn-danger {
    background: var(--card);
    border: 1px solid var(--red);
    color: var(--danger-text);
    grid-column: 1 / -1;
    width: 100%;
  }
  .mod-card-actions .btn-detail {
    background: var(--bg2);
    border: 1px solid var(--border);
    color: var(--text);
    grid-column: 1 / -1;
    width: 100%;
    font-weight: 500;
  }
  @media (min-width: 750px) {
    .mod-card-actions { display: flex; flex-wrap: wrap; }
    .mod-card-actions .mod-btn { width: auto; }
  }
  .btn-icon {
    font-size: 14px;
    font-weight: 700;
  }

  /* Accordion detail area */
  .mod-card-expanded {
    margin-top: 8px;
    padding: 16px;
    border-radius: var(--radius-control);
    background: var(--card);
    border: 1px solid var(--border2);
  }
  .mod-card-expanded h4 {
    margin: 0 0 12px;
    font-size: 15px;
    font-weight: 600;
    color: var(--brown);
  }
  :root[data-theme='dark'] .mod-card-expanded h4 {
    color: var(--gold);
  }
  .mod-profile-compare-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
    gap: 12px;
    margin-bottom: 12px;
  }
  .profile-box {
    display: grid;
    gap: 6px;
    padding: 12px;
    border-radius: var(--radius-sm);
    background: var(--bg2);
    border: 1px solid var(--border2);
  }
  .profile-box h5 {
    margin: 0;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .5px;
    color: var(--text2);
  }
  .profile-box img {
    border-radius: 8px;
    object-fit: cover;
  }
  .mod-expanded-full-content {
    margin-bottom: 12px;
    font-size: 13.5px;
    line-height: 1.6;
    color: var(--text);
    background: var(--bg2);
    padding: 12px;
    border-radius: var(--radius-sm);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .mod-meta-link, .mod-meta-parent {
    font-size: 12.5px;
    color: var(--text2);
    margin: 6px 0;
  }
  .mod-expanded-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--border2);
  }

  .mindful-review-meta {
    display: grid;
    gap: var(--radius-sm);
    margin: var(--space-page) 0;
    padding: var(--radius-control);
    border-radius: var(--radius-control);
    background: var(--bg2);
    font-size: var(--font-size-label);
  }
  .mindful-review-meta div {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--radius-sm);
  }
  .mindful-review-meta dd { margin: 0; }
  .mindful-policy, .mindful-bulk-progress {
    border-top: 1px solid var(--border2);
    padding-top: var(--space-page);
    margin-top: var(--space-page);
  }
  .admin-moderation-context {
    scroll-margin-block: calc(var(--nav-h) + var(--space-page));
  }
</style>
