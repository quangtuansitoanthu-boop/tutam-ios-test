<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount, untrack } from 'svelte';
  import { createInfiniteQuery, createQuery, useQueryClient, type InfiniteData } from '@tanstack/svelte-query';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getBrowserSessionSnapshot, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { mindfulCommunityCopy } from '$lib/i18n/mindful-community-copy';
  import { personalPracticeCopy } from '$lib/i18n/personal-practice-copy';
  import { MINDFUL_REACTION_TEMPLATES, type MindfulPost, type MindfulPostPage } from '$lib/contracts/mindful-community';
  import type { MindfulNotification, MindfulNotificationPage, MindfulPostContext } from '$lib/contracts/mindful-notifications';
  import { COMMUNITY_BLOCKS_CHANGED_EVENT, type CommunityBlocksChangedDetail } from '$lib/contracts/community-moderation';
  import { fetchMindfulPostContext, fetchMindfulPosts, sendMindfulReaction, deleteMindfulPost, MindfulCommunityError, MINDFUL_COMMUNITY_QUERY_POLICY } from '$lib/browser/mindful-community-client';
  import { serverStateKeys } from '$lib/browser/server-state';
  import { getVietnamIsoDate } from '$lib/domain/practice/stats';
  import { countReflectionWords } from '$lib/domain/practice/personal-practice';
  import RosarySelect from '../rosary/RosarySelect.svelte';
  import PracticeConfirmDialog from '../dialog/PracticeConfirmDialog.svelte';
  import MindfulReactions from './MindfulReactions.svelte';
  import MindfulReviewNotice from '../personal/MindfulReviewNotice.svelte';
  import { isMindfulPostPublic, mindfulPostPublishedAt } from '$lib/domain/practice/mindful-post-review';
  let { principalId = null, canModerate = false, nickname = '', active = true, targetPostId = null, targetReactionId = null, targetIntent = 0, targetOnly = false, targetVisible = true, onTargetClose = () => {}, onSignIn = () => {} }: {
    principalId?: string | null; canModerate?: boolean; nickname?: string; active?: boolean; targetPostId?: string | null;
    targetReactionId?: string | null; targetIntent?: number; targetOnly?: boolean; targetVisible?: boolean; onTargetClose?: () => void; onSignIn?: (button: EventTarget | null) => void;
  } = $props();
  const locale = getLocaleContext();
  const isEn = $derived(locale.current === 'en');
  const reflectionCopy = $derived(personalPracticeCopy[isEn ? 'en' : 'vi']);
  const t = $derived(mindfulCommunityCopy[locale.current === 'en' ? 'en' : 'vi']);
  const queryClient = useQueryClient();
  let tab = $state<'repentance' | 'good_deed' | 'mine'>('repentance');
  let period = $state<'today' | 'all'>('all');
  let today = $state(getVietnamIsoDate());
  let online = $state(browser ? navigator.onLine !== false : true);
  let message = $state('');
  let reactionNotice = $state<{ postId: string; reason: 'guest' | 'nickname' } | null>(null);
  let selected = $state<MindfulPost | null>(null);
  let deleting = $state<MindfulPost | null>(null);
  const withdrawing = $derived(deleting?.status === 'hidden' && deleting.reviewState === 'pending');
  const removingRejected = $derived(deleting?.status === 'hidden' && deleting.reviewState === 'rejected');
  let viewing = $state<MindfulPost | null>(null);
  let templateId = $state('');
  let busy = $state(false);
  let expandedPosts = $state<Record<string, boolean>>({});
  let showPolicy = $state(false);
  let controller: AbortController | null = null;
  let generation = 0;
  let midnightTimer: ReturnType<typeof setTimeout> | undefined;
  let targetMode = $state(Boolean(untrack(() => targetPostId)));
  let targetOpen = $state(false);
  const refreshDay = () => { today = getVietnamIsoDate(); };
  function scheduleMidnight() {
    clearTimeout(midnightTimer);
    const nextMidnight = Date.parse(`${getVietnamIsoDate()}T00:00:00+07:00`) + 86_400_000;
    midnightTimer = setTimeout(() => { if (document.visibilityState === 'visible') refreshDay(); scheduleMidnight(); }, Math.max(1, nextMidnight - Date.now()));
  }
  const scope = $derived(principalId ?? 'guest');
  function cachedTarget(): { data: MindfulPostContext; updatedAt: number } | undefined {
    if (!principalId || !targetPostId) return;
    let notification: MindfulNotification | undefined;
    if (targetReactionId) {
      const inbox = queryClient.getQueryData<InfiniteData<MindfulNotificationPage & { principal: string }>>(serverStateKeys.mindfulCommunity.notifications(principalId));
      notification = inbox?.pages.filter(page => page.principal === principalId).flatMap(page => page.items)
        .find(item => item.id === targetReactionId && item.postId === targetPostId);
    }
    const queries = [
      ...queryClient.getQueryCache().findAll({ queryKey: serverStateKeys.mindfulCommunity.post(principalId, targetPostId) }),
      ...queryClient.getQueryCache().findAll({ queryKey: [...serverStateKeys.mindfulCommunity.principal(principalId), 'posts'] }),
    ];
    for (const query of queries) {
      if (query.state.isInvalidated || query.state.fetchStatus !== 'idle'
        || Date.now() - query.state.dataUpdatedAt >= MINDFUL_COMMUNITY_QUERY_POLICY.staleTime) continue;
      const data = query.state.data as { id?: string; post?: MindfulPost; notification?: MindfulNotification | null; pages?: MindfulPostPage[] } | undefined;
      const post: MindfulPost | undefined = data?.id === targetPostId ? query.state.data as MindfulPost
        : data?.post ?? data?.pages?.flatMap(page => page.items).find(item => item.id === targetPostId);
      const focused = notification ?? (data?.notification?.id === targetReactionId ? data.notification : undefined);
      if (post?.id === targetPostId && post.isOwn && isMindfulPostPublic(post)
        && typeof post.content === 'string' && typeof post.nickname === 'string' && typeof post.viewerReacted === 'boolean'
        && ['repentance', 'good_deed'].includes(post.kind) && Number.isFinite(Date.parse(post.createdAt)) && Number.isFinite(post.reactionCount)
        && (!targetReactionId || focused)) {
        return { data: { post, notification: focused ?? null }, updatedAt: query.state.dataUpdatedAt };
      }
    }
  }
  const targetQuery = createQuery<MindfulPostContext>(() => {
    const cached = cachedTarget();
    const postId = targetPostId, reactionId = targetReactionId;
    return {
      queryKey: [...serverStateKeys.mindfulCommunity.post(scope, postId ?? ''), 'notification', reactionId ?? ''],
      queryFn: ({ signal }) => fetchMindfulPostContext(postId!, reactionId, { signal }),
      initialData: cached?.data, initialDataUpdatedAt: cached?.updatedAt,
      enabled: browser && active && targetMode && Boolean(principalId && targetPostId) && online,
      ...MINDFUL_COMMUNITY_QUERY_POLICY,
    };
  });
  const targetPost = $derived(online && principalId && targetQuery.data?.post?.id === targetPostId
    && targetQuery.data.post.isOwn && isMindfulPostPublic(targetQuery.data.post) ? targetQuery.data.post : null);
  const targetNotification = $derived(targetPost && targetQuery.data?.notification?.id === targetReactionId
    ? targetQuery.data.notification : null);
  $effect(() => {
    targetPostId; targetReactionId; targetIntent;
    untrack(() => {
      targetMode = Boolean(targetPostId);
      targetOpen = Boolean(targetPostId) && targetVisible;
      if (targetPostId) { tab = 'mine'; period = 'all'; viewing = null; }
    });
  });
  $effect(() => { if (!targetVisible) targetOpen = false; });
  function closeTarget() { targetOpen = false; onTargetClose(); }
  function selectTab(value: typeof tab) { targetMode = false; targetOpen = false; tab = value; message = ''; reactionNotice = null; onTargetClose(); }
  function selectPeriod(value: string) {
    if (value !== 'all' && value !== 'today') return;
    targetMode = false; targetOpen = false; refreshDay(); period = value; message = ''; reactionNotice = null; onTargetClose();
  }
  const posts = createInfiniteQuery(() => {
    const selectedTab = tab, selectedPeriod = period;
    return {
    queryKey: serverStateKeys.mindfulCommunity.posts(scope, selectedTab, selectedPeriod === 'today' ? today : undefined),
    queryFn: ({ pageParam, signal }) => fetchMindfulPosts({ kind: selectedTab === 'mine' ? undefined : selectedTab, mine: selectedTab === 'mine', period: selectedPeriod, after: pageParam }, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextCursor ?? undefined,
    enabled: browser && active && !targetMode && online && (tab !== 'mine' || Boolean(principalId)),
    ...MINDFUL_COMMUNITY_QUERY_POLICY,
  }; });
  const items = $derived(targetMode ? (targetPost ? [targetPost] : [])
    : [...(posts.data?.pages.flatMap(page => page.items) ?? [])]
      .filter(post => tab === 'mine' ? post.isOwn : isMindfulPostPublic(post))
      .sort((a, b) => Date.parse(tab === 'mine' ? b.createdAt : mindfulPostPublishedAt(b)) - Date.parse(tab === 'mine' ? a.createdAt : mindfulPostPublishedAt(a)) || b.id.localeCompare(a.id)));
  const dateFormat = $derived(new Intl.DateTimeFormat(locale.current === 'en' ? 'en-GB' : 'vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }));
  const templates = $derived(selected ? MINDFUL_REACTION_TEMPLATES[selected.kind].map(item => ({ value: item.id, label: item.text })) : []);
  const periodOptions = $derived([
    { value: 'all', label: t.all },
    { value: 'today', label: t.today }
  ]);
  const enabled = $derived(posts.data?.pages[0]?.enabled !== false);
  function updatePosts(update: (post: MindfulPost) => MindfulPost | null) {
    queryClient.setQueriesData<InfiniteData<MindfulPostPage>>({ queryKey: [...serverStateKeys.mindfulCommunity.principal(scope), 'posts'] }, data => data && ({
      ...data, pages: data.pages.map(page => ({ ...page, items: page.items.flatMap(item => { const next = update(item); return next ? [next] : []; }) })),
    }));
  }
  function chooseReaction(post: MindfulPost, button: EventTarget | null) {
    message = '';
    reactionNotice = null;
    if (post.viewerReacted || busy || !online || !isMindfulPostPublic(post)) return;
    if (!principalId) { reactionNotice = { postId: post.id, reason: 'guest' }; onSignIn(button); return; }
    if (!nickname.trim()) { reactionNotice = { postId: post.id, reason: 'nickname' }; return; }

    selected = post;
    templateId = MINDFUL_REACTION_TEMPLATES[post.kind][0].id;
  }
  function removalAction(post: MindfulPost): 'withdraw' | 'delete' | null {
    if (!principalId || !post.isOwn) return null;
    if (post.status === 'hidden') {
      if (post.reviewState === 'pending') return 'withdraw';
      if (post.reviewState === 'rejected') return 'delete';
    }
    return canModerate && isMindfulPostPublic(post) ? 'delete' : null;
  }
  function requestRemoval(post: MindfulPost) {
    if (busy || !online) return;
    if (!removalAction(post)) { message = t.removeUnavailable; return; }
    message = '';
    deleting = post;
  }
  async function mutate(remove = false) {
    if (!principalId || busy || !online) return;
    const post = remove ? items.find(item => item.id === deleting?.id) : selected;
    if (remove && (!post || removalAction(post) !== (withdrawing ? 'withdraw' : 'delete'))) {
      deleting = null;
      message = t.removeUnavailable;
      return;
    }
    if (!post || (!remove && !isMindfulPostPublic(post))) return;
    const captured = principalId;
    const revision = generation;
    const operation = new AbortController(); controller = operation; busy = true; message = '';
    try {
      if (remove) {
        await deleteMindfulPost(post.id, { signal: operation.signal });
        if (captured !== principalId || revision !== generation || operation.signal.aborted) return;
        await Promise.all([
          queryClient.cancelQueries({ queryKey: [...serverStateKeys.mindfulCommunity.principal(captured), 'posts'] }),
          queryClient.cancelQueries({ queryKey: serverStateKeys.mindfulCommunity.post(captured, post.id) }),
          queryClient.cancelQueries({ queryKey: serverStateKeys.mindfulCommunity.notifications(captured) }),
          queryClient.cancelQueries({ queryKey: serverStateKeys.mindfulCommunity.reactions(captured, post.id) }),
        ]);
        if (captured !== principalId || revision !== generation || operation.signal.aborted) return;
        updatePosts(item => item.id === post.id ? null : item);
        queryClient.setQueriesData<{ post: MindfulPost | null; notification?: MindfulNotification | null }>(
          { queryKey: serverStateKeys.mindfulCommunity.post(captured, post.id) }, () => ({ post: null, notification: null }));
        queryClient.setQueriesData<InfiniteData<MindfulNotificationPage & { principal: string }>>(
          { queryKey: serverStateKeys.mindfulCommunity.notifications(captured) }, data => data && ({
            ...data, pages: data.pages.map(page => ({ ...page, items: page.items.filter(item => item.postId !== post.id) })),
          }));
        queryClient.removeQueries({ queryKey: serverStateKeys.mindfulCommunity.reactions(captured, post.id) });
        if (targetPostId === post.id) { targetOpen = false; onTargetClose(); }
      } else {
        const result = await sendMindfulReaction(post.id, { templateId, nickname: nickname.trim() }, { signal: operation.signal });
        if (captured !== principalId || revision !== generation || operation.signal.aborted) return;
        await queryClient.cancelQueries({ queryKey: [...serverStateKeys.mindfulCommunity.principal(captured), 'posts'] });
        if (captured !== principalId || revision !== generation || operation.signal.aborted) return;
        updatePosts(item => item.id === result.postId ? { ...item, reactionCount: result.reactionCount, viewerReacted: true } : item);
        void queryClient.invalidateQueries({ queryKey: serverStateKeys.mindfulCommunity.reactions(scope, post.id), exact: true, refetchType: 'none' });
      }
      selected = null; deleting = null;
    } catch (error) {
      if (captured !== principalId || revision !== generation || operation.signal.aborted) return;
      if (remove && error instanceof MindfulCommunityError && [403, 404, 409].includes(error.status)) {
        deleting = null;
        message = t.removeUnavailable;
      } else message = t.failed;
    } finally { if (captured === principalId && revision === generation) busy = false; }
  }
  $effect(() => { scope; generation++; reactionNotice = null; selected = null; deleting = null; viewing = null; message = ''; busy = false; controller?.abort(); });
  onMount(() => {
    let previousScope = scope;
    const network = () => { online = navigator.onLine !== false; refreshDay(); };
    const visibility = () => { if (document.visibilityState === 'visible') { refreshDay(); scheduleMidnight(); } };
    const sessionChanged = () => {
      const current = getBrowserSessionSnapshot().user?.id ?? 'guest';
      if (current !== previousScope) { generation++; controller?.abort(); busy = false; message = ''; selected = null; deleting = null; viewing = null; void queryClient.cancelQueries({ queryKey: serverStateKeys.mindfulCommunity.principal(previousScope) }); queryClient.removeQueries({ queryKey: serverStateKeys.mindfulCommunity.principal(previousScope) }); previousScope = current; }
    };
    const blocksChanged = (event: Event) => {
      const detail = (event as CustomEvent<CommunityBlocksChangedDetail>).detail;
      if (!detail || detail.principalId !== principalId) return;
      generation++; controller?.abort(); busy = false; message = '';
      selected = null; deleting = null; viewing = null;
    };
    network(); scheduleMidnight(); document.addEventListener('visibilitychange', visibility); window.addEventListener('online', network); window.addEventListener('offline', network); window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    window.addEventListener(COMMUNITY_BLOCKS_CHANGED_EVENT, blocksChanged);
    return () => { clearTimeout(midnightTimer); controller?.abort(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('online', network); window.removeEventListener('offline', network); window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged); window.removeEventListener(COMMUNITY_BLOCKS_CHANGED_EVENT, blocksChanged); };
  });
</script>

<section class="mindful-community" aria-labelledby="mindful-community-title" hidden={targetOnly}>
  <div class="community-header">
    <div class="community-title-row">
      <div class="community-title-wrap">
        <h2 id="mindful-community-title">
          <span class="community-icon" aria-hidden="true">🪷</span>
          <span>{t.title}</span>
        </h2>
        <p class="community-subtitle">{t.privacy}</p>
      </div>
      <button
        type="button"
        class="policy-info-btn"
        onclick={() => showPolicy = !showPolicy}
        aria-expanded={showPolicy}
        aria-label={t.privacy}
      >
        <span aria-hidden="true">ℹ️</span>
        <span>{isEn ? 'Rules' : 'Quy chuẩn'}</span>
      </button>
    </div>
  </div>

  {#if showPolicy}
    <div class="policy-collapse">
      <MindfulReviewNotice />
    </div>
  {/if}

  <div class="community-controls">
    <nav class="category-tabs" aria-label={t.title}>
      <button
        type="button"
        class="category-tab category-tab--repentance"
        class:category-tab--active={tab === 'repentance'}
        aria-pressed={tab === 'repentance'}
        onclick={() => selectTab('repentance')}
      >{t.repentance}</button>
      <button
        type="button"
        class="category-tab category-tab--good-deed"
        class:category-tab--active={tab === 'good_deed'}
        aria-pressed={tab === 'good_deed'}
        onclick={() => selectTab('good_deed')}
      >{t.good}</button>
      <button
        type="button"
        class="category-tab category-tab--mine"
        class:category-tab--active={tab === 'mine'}
        aria-pressed={tab === 'mine'}
        onclick={() => selectTab('mine')}
      >{t.mine}</button>
    </nav>

    <div class="period-filter-row" role="group" aria-label={t.period}>
      <span class="period-label">{t.period}</span>
      <div class="period-pills">
        {#each periodOptions as opt (opt.value)}
          <button
            type="button"
            class="period-pill"
            class:period-pill--active={period === opt.value}
            aria-pressed={period === opt.value}
            onclick={() => selectPeriod(opt.value as 'all' | 'today')}
          >{opt.label}</button>
        {/each}
      </div>
    </div>
  </div>

  {#if !online}
    <div class="status-banner status-banner--offline" role="status">
      <span>📡 {t.offline}</span>
    </div>
  {/if}
  {#if !principalId}
    <div class="status-banner status-banner--guest">
      <span>🌸 {t.guest}</span>
    </div>
  {/if}
  {#if message && !deleting}
    <p class="error-banner" role="alert">{message}</p>
  {/if}
  {#if !enabled}
    <p class="empty-state">{t.disabled}</p>
  {:else if !targetMode && posts.isPending && (tab !== 'mine' || principalId) && online}
    <div class="loading-state" role="status">
      <span class="spinner" aria-hidden="true">⏳</span>
      <span>{t.loading}</span>
    </div>
  {:else if !targetMode && posts.isError}
    <div class="error-state">
      <p class="error-text" role="alert">
        {posts.error instanceof Error && posts.error.message === 'mindful_community_unavailable' ? t.unavailable : t.failed}
      </p>
      <button type="button" class="retry-btn" disabled={!online} onclick={() => void posts.refetch()}>{t.retry}</button>
    </div>
  {:else if !items.length && !posts.hasNextPage && (tab !== 'mine' || principalId)}
    <div class="empty-state">
      <span class="empty-icon" aria-hidden="true">🪷</span>
      <p>{t.empty}</p>
    </div>
  {/if}

  {#each items as post (post.id)}
    {@const publicPost = isMindfulPostPublic(post)}
    {@const action = removalAction(post)}
    <article class="post-card post-card--{post.kind}">
      <header class="post-header">
        <div class="author-info">
          <div class="author-avatar author-avatar--{post.kind}" aria-hidden="true">
            {post.kind === 'good_deed' ? '🌸' : '🌿'}
          </div>
          <div class="author-details">
            <strong class="author-name">{post.nickname}</strong>
            <span class="author-badge">{isEn ? 'Fellow practitioner' : 'Đồng tu'}</span>
          </div>
        </div>

        <div class="post-meta">
          <span class="post-kind-chip post-kind-chip--{post.kind}">
            {post.kind === 'good_deed' ? `🌸 ${t.good}` : `🌿 ${t.repentance}`}
          </span>
          <time class="post-time" datetime={tab === 'mine' ? post.createdAt : mindfulPostPublishedAt(post)}>
            {dateFormat.format(new Date(tab === 'mine' ? post.createdAt : mindfulPostPublishedAt(post)))}
          </time>
        </div>
      </header>

      <div class="post-body">
        {#if post.content.length <= 280 || expandedPosts[post.id]}
          <p class="content">{post.content}</p>
        {:else}
          <p class="content">{post.content.slice(0, 260)}…</p>
        {/if}
        {#if post.content.length > 280}
          <button
            type="button"
            class="expand-post-btn"
            onclick={() => (expandedPosts[post.id] = !expandedPosts[post.id])}
          >
            {expandedPosts[post.id]
              ? reflectionCopy.collapse
              : reflectionCopy.readMore.replace('{0}', String(countReflectionWords(post.content)))}
          </button>
        {/if}
      </div>

      {#if post.isOwn && post.reviewState && post.reviewState !== 'legacy'}
        <div class="post-review-slot">
          <MindfulReviewNotice receipt={post} compact />
        </div>
      {/if}

      {#if !publicPost && (!post.reviewState || post.reviewState === 'legacy')}
        <p class="hidden-notice">{t.hidden}</p>
      {/if}
      {#if publicPost || action}
        <footer class="post-footer actions">
          {#if publicPost}
            <div class="reaction-group">
              <button
                type="button"
                class="react-action-btn react"
                class:react-action-btn--reacted={post.viewerReacted}
                disabled={post.viewerReacted || busy || !online}
                onclick={event => chooseReaction(post, event.currentTarget)}
              >
                {#if post.viewerReacted}
                  <span class="btn-icon" aria-hidden="true">✓</span>
                  <span>{post.kind === 'good_deed' ? t.rejoiced : t.prayed}</span>
                {:else}
                  <span class="btn-icon" aria-hidden="true">{post.kind === 'good_deed' ? '🌸' : '🙏'}</span>
                  <span>{post.kind === 'good_deed' ? t.rejoice : t.pray}</span>
                {/if}
              </button>

              <button
                type="button"
                class="reaction-count-chip"
                disabled={!online}
                onclick={() => viewing = post}
                title={post.kind === 'good_deed' ? t.rejoices : t.prayers}
              >
                <span class="count-icon" aria-hidden="true">💬</span>
                <span>{post.reactionCount} {post.kind === 'good_deed' ? t.rejoices : t.prayers}</span>
              </button>
            </div>
          {/if}

          {#if action}
            <button
              class="remove-post-btn remove"
              type="button"
              disabled={busy || !online}
              onclick={() => requestRemoval(post)}
            >
              <span class="remove-icon" aria-hidden="true">🗑️</span>
              <span>{action === 'withdraw' ? t.withdraw : t.delete}</span>
            </button>
          {/if}
        </footer>
      {/if}

      {#if reactionNotice?.postId === post.id}
        <p class="error reaction-notice" role="alert">
          {reactionNotice.reason === 'guest' ? t.guest : t.noNickname}
        </p>
      {/if}
    </article>
  {/each}

  {#if !targetMode && posts.hasNextPage}
    <button class="more-btn more" type="button" disabled={posts.isFetchingNextPage || !online} onclick={() => void posts.fetchNextPage()}>
      {posts.isFetchingNextPage ? t.loading : t.more}
    </button>
  {/if}
</section>

<PracticeConfirmDialog open={Boolean(selected)} title={selected?.kind === 'good_deed' ? t.rejoice : t.pray} description={t.once} cancelLabel={t.cancel} confirmLabel={t.send} {busy} onCancel={() => { if (!busy) selected = null; }} onConfirm={() => void mutate()}>
  {#snippet children()}<RosarySelect label={t.select} accessibleLabel={t.select} value={templateId} options={templates} onChange={value => { templateId = value; }} />{#if message}<p class="error" role="alert">{message}</p>{/if}{/snippet}
</PracticeConfirmDialog>
<PracticeConfirmDialog open={Boolean(deleting)} title={withdrawing ? t.withdrawTitle : t.deleteTitle}
  description={withdrawing ? t.withdrawDescription : removingRejected ? t.deleteRejectedDescription : t.deleteDescription}
  cancelLabel={t.cancel} confirmLabel={withdrawing ? t.withdraw : t.delete}
  {busy} onCancel={() => { if (!busy) deleting = null; }} onConfirm={() => void mutate(true)}>
  {#snippet children()}{#if message}<p class="error" role="alert">{message}</p>{/if}{/snippet}
</PracticeConfirmDialog>
{#if viewing}<MindfulReactions post={viewing} principalId={scope} {online} onClose={() => viewing = null} />{/if}
{#if targetMode && targetOpen && targetPostId}
  <MindfulReactions post={targetPost} principalId={scope} requestedPostId={targetPostId} showPost={true} {online}
    focusedNotification={targetNotification} missingFocus={Boolean(targetPost && targetReactionId && !targetNotification)}
    detailState={!principalId ? 'guest' : targetQuery.isError || (targetQuery.isSuccess && !targetPost) ? 'unavailable' : targetPost ? null : 'loading'}
    onRetryDetail={() => void targetQuery.refetch()} onClose={closeTarget} />
{/if}

<style>
  .mindful-community {
    font-family: var(--font-app);
    color: var(--text);
    padding-bottom: var(--space-page);
    min-width: 0;
  }

  /* Header cộng đồng */
  .community-header {
    margin-bottom: var(--space-page);
  }
  .community-title-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .community-title-wrap {
    min-width: 0;
    flex: 1;
  }
  .community-title-wrap h2 {
    margin: 0;
    font-size: var(--font-size-section-title);
    font-weight: 800;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--brown, var(--text));
  }
  .community-icon {
    font-size: 1.15rem;
  }
  .community-subtitle {
    margin: 4px 0 0;
    color: var(--text2);
    font-size: var(--font-size-label);
    line-height: 1.5;
  }
  .policy-info-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 6px 12px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    color: var(--text2);
    font: 700 var(--font-size-label) var(--font-app);
    cursor: pointer;
    flex-shrink: 0;
    box-shadow: var(--shadow-sm);
    transition: background 0.15s ease, color 0.15s ease;
  }
  .policy-info-btn:hover {
    background: var(--gold-light);
    border-color: var(--gold);
    color: var(--brown);
  }
  .policy-collapse {
    margin-bottom: var(--space-page);
  }

  /* Bộ điều khiển & bộ lọc 2 tầng */
  .community-controls {
    display: flex;
    flex-direction: column;
    gap: calc(var(--space-page) * 0.4);
    margin-bottom: var(--space-page);
    background: var(--card);
    border: 1px solid var(--border2);
    border-radius: var(--radius-card);
    padding: calc(var(--space-page) * 0.5);
    box-shadow: var(--shadow-sm);
  }
  .category-tabs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .category-tab {
    min-height: 44px;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--bg);
    color: var(--text2);
    font: 700 var(--font-size-label)/1.3 var(--font-app);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    overflow-wrap: anywhere;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }
  .category-tab--active {
    background: var(--gold-light);
    border-color: var(--gold);
    color: var(--brown, var(--text));
    font-weight: 800;
    box-shadow: var(--shadow-sm);
  }
  .category-tab--repentance::before { content: '🌿 '; }
  .category-tab--good-deed::before { content: '🌸 '; }
  .category-tab--mine::before { content: '📿 '; }
  .tab-icon {
    font-size: 1.05rem;
    flex-shrink: 0;
  }
  .period-filter-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding-top: 10px;
    border-top: 1px dashed var(--border2);
  }
  .period-label {
    font-size: var(--font-size-meta);
    font-weight: 700;
    color: var(--text2);
  }
  .period-pills {
    display: inline-flex;
    gap: 6px;
    flex-shrink: 0;
  }
  .period-pill {
    min-height: 44px;
    min-width: 44px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg2);
    color: var(--text2);
    font: 700 var(--font-size-meta) var(--font-app);
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }
  .period-pill--active {
    background: var(--gold);
    border-color: var(--gold);
    color: var(--on-gold);
  }

  /* Status banners */
  .status-banner {
    padding: 10px 14px;
    border-radius: var(--radius-control);
    margin-bottom: var(--space-page);
    font-size: var(--font-size-label);
    line-height: 1.5;
  }
  .status-banner--offline {
    background: color-mix(in srgb, var(--danger-text, #c62828) 8%, var(--card));
    border: 1px solid color-mix(in srgb, var(--danger-text, #c62828) 25%, transparent);
    color: var(--danger-text, #c62828);
  }
  .status-banner--guest {
    background: var(--gold-light);
    border: 1px solid var(--gold);
    color: var(--brown, var(--text));
  }
  .error-banner {
    padding: 10px 14px;
    background: color-mix(in srgb, var(--danger-text, #c62828) 8%, var(--card));
    border: 1px solid color-mix(in srgb, var(--danger-text, #c62828) 25%, transparent);
    border-radius: var(--radius-control);
    color: var(--danger-text, #c62828);
    margin-bottom: var(--space-page);
    font-size: var(--font-size-label);
  }
  .loading-state,
  .empty-state {
    text-align: center;
    padding: calc(var(--space-page) * 2) var(--space-page);
    color: var(--text2);
    font-size: var(--font-size-body);
  }
  .empty-icon {
    font-size: 2.2rem;
    display: block;
    margin-bottom: 8px;
  }
  .error-state {
    text-align: center;
    padding: var(--space-page);
  }
  .error-text {
    color: var(--danger-text, #c62828);
    margin-bottom: 10px;
  }
  .retry-btn {
    min-height: 40px;
    padding: 6px 18px;
    border: 1px solid var(--gold);
    border-radius: 20px;
    background: var(--gold);
    color: var(--on-gold, #fff);
    font: 700 var(--font-size-label) var(--font-app);
    cursor: pointer;
  }

  /* Thẻ bài viết (Post Card) */
  .post-card {
    overflow: hidden;
    margin-bottom: var(--space-page);
    border: 1px solid var(--border2);
    border-radius: var(--radius-card);
    background: var(--dialog-glass-background, var(--card));
    box-shadow: var(--shadow-sm);
    display: flex;
    flex-direction: column;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .post-card--repentance {
    border-top: 3px solid var(--brown, #8b5e3c);
  }
  .post-card--good_deed {
    border-top: 3px solid var(--gold, #dfb75c);
  }

  /* Post Header */
  .post-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: calc(var(--space-page) * 0.6) calc(var(--space-page) * 0.75);
    background: var(--bg2, var(--card));
    border-bottom: 1px solid var(--border2);
  }
  .author-info {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .author-avatar {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 1.15rem;
    background: var(--card);
    border: 1px solid var(--border);
    flex-shrink: 0;
  }
  .author-avatar--repentance {
    background: color-mix(in srgb, var(--brown, #8b5e3c) 12%, var(--card));
    border-color: color-mix(in srgb, var(--brown, #8b5e3c) 30%, transparent);
  }
  .author-avatar--good_deed {
    background: color-mix(in srgb, var(--gold, #dfb75c) 16%, var(--card));
    border-color: color-mix(in srgb, var(--gold, #dfb75c) 40%, transparent);
  }
  .author-details {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .author-name {
    font-size: var(--font-size-card-title);
    font-weight: 700;
    color: var(--brown, var(--text));
    overflow-wrap: anywhere;
    line-height: 1.3;
  }
  .author-badge {
    font-size: var(--font-size-meta);
    color: var(--text2);
    line-height: 1.2;
  }
  .post-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .post-kind-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: var(--font-size-meta);
    font-weight: 700;
  }
  .post-kind-chip--repentance {
    background: color-mix(in srgb, var(--brown, #8b5e3c) 12%, var(--card));
    color: var(--brown, #8b5e3c);
    border: 1px solid color-mix(in srgb, var(--brown, #8b5e3c) 25%, transparent);
  }
  .post-kind-chip--good_deed {
    background: var(--gold-light);
    color: var(--brown, #8b5e3c);
    border: 1px solid var(--gold);
  }
  .post-time {
    font-size: var(--font-size-meta);
    color: var(--text2);
    white-space: nowrap;
  }

  /* Post Body */
  .post-body {
    padding: calc(var(--space-page) * 0.75);
  }
  .content {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: var(--font-reader);
    font-size: var(--font-size-input);
    font-weight: 400;
    line-height: 1.75;
    text-align: justify;
    text-align-last: left;
    color: var(--text);
  }
  .expand-post-btn {
    margin-top: 8px;
    min-height: var(--touch-target-size);
    padding: 4px 0;
    background: transparent;
    border: none;
    color: var(--brown, var(--gold));
    font-weight: 700;
    font-size: var(--font-size-label);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
  }
  .post-review-slot {
    margin: 0 calc(var(--space-page) * 0.75) calc(var(--space-page) * 0.5);
  }

  /* Post Footer & Reactions */
  .post-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 0 calc(var(--space-page) * 0.75) calc(var(--space-page) * 0.75);
    margin-top: auto;
  }
  .reaction-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .react-action-btn {
    min-height: 44px;
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: 22px;
    background: var(--card);
    color: var(--text);
    font: 700 var(--font-size-label) var(--font-app);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    box-shadow: var(--shadow-sm);
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }
  .react-action-btn:hover:not(:disabled) {
    background: var(--gold-light);
    border-color: var(--gold);
    color: var(--brown);
  }
  .react-action-btn--reacted {
    background: var(--gold-light);
    border-color: var(--gold);
    color: var(--brown, var(--text));
    font-weight: 800;
    cursor: default;
  }
  .react-action-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .btn-icon {
    font-size: 1rem;
    flex-shrink: 0;
  }
  .reaction-count-chip {
    min-height: 44px;
    padding: 6px 12px;
    border: 1px solid var(--border2);
    border-radius: 22px;
    background: var(--bg);
    color: var(--text2);
    font: 600 var(--font-size-label) var(--font-app);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }
  .reaction-count-chip:hover:not(:disabled) {
    background: var(--card);
    color: var(--text);
    border-color: var(--border);
  }
  .count-icon {
    font-size: 0.95rem;
  }
  .remove-post-btn {
    min-height: 44px;
    margin-inline-start: auto;
    padding: 6px 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-control);
    color: var(--danger-text, #c62828);
    font: 600 var(--font-size-meta) var(--font-app);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .remove-post-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--danger-text, #c62828) 8%, transparent);
    border-color: color-mix(in srgb, var(--danger-text, #c62828) 20%, transparent);
  }
  .remove-icon {
    font-size: 0.95rem;
  }
  .hidden-notice {
    padding: 8px var(--space-page);
    color: var(--text2);
    font-size: var(--font-size-label);
  }
  .reaction-notice {
    margin: 0 calc(var(--space-page) * 0.75) calc(var(--space-page) * 0.75);
    color: var(--danger-text, #c62828);
    font-size: var(--font-size-label);
  }
  .more-btn {
    width: 100%;
    min-height: 48px;
    margin-top: var(--space-page);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--card);
    color: var(--text);
    font: 700 var(--font-size-label) var(--font-app);
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .more-btn:hover:not(:disabled) {
    background: var(--gold-light);
    border-color: var(--gold);
    color: var(--brown);
  }
  button:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }
</style>
