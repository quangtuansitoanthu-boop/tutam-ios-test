<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount, untrack } from 'svelte';
  import { COMMUNITY_BLOCKS_CHANGED_EVENT, type CommunityBlocksChangedDetail } from '$lib/contracts/community-moderation';
  import { LockKeyhole } from '@lucide/svelte';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import {
    fetchPracticeCampaigns,
    fetchPracticeLeaderboard,
    joinPracticeCampaign,
    leavePracticeCampaign,
    withCampaignMembership,
    PRACTICE_COMMUNITY_QUERY_POLICY,
    type PracticeCampaign,
    type PracticeCampaignListData,
    type PracticeLeaderboardData,
  } from '$lib/browser/practice-community';
  import { serverStateKeys } from '$lib/browser/server-state';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getSessionContext } from '$lib/stores/session.svelte';
  import PracticeCampaigns from './PracticeCampaigns.svelte';
  import PracticeLeaderboard from './PracticeLeaderboard.svelte';

  interface Props {
    initialCampaigns: PracticeCampaignListData;
    initialLeaderboard: PracticeLeaderboardData;
  }

  let { initialCampaigns, initialLeaderboard }: Props = $props();
  const localeStore = getLocaleContext();
  const sessionStore = getSessionContext();
  const queryClient = useQueryClient();
  const principal = $derived(sessionStore.value.authenticated ? sessionStore.value.user?.id ?? 'anonymous' : 'anonymous');
  const initialPrincipal = untrack(() => principal);
  let initialProjectionValid = $state(true);
  let previousPrincipal = initialPrincipal;
  let blockedAuthors = $state<string[]>([]);
  let blockedPrincipal = $state(initialPrincipal);
  const activeBlocks = $derived(blockedPrincipal === principal ? blockedAuthors : []);
  const isEn = $derived(localeStore.current === 'en');
  const isUserAuthenticated = $derived(Boolean(sessionStore.value.authenticated && sessionStore.value.user));

  const leaderboardQuery = createQuery(() => ({
    ...PRACTICE_COMMUNITY_QUERY_POLICY,
    queryKey: serverStateKeys.practiceCommunity.leaderboardForPrincipal(principal),
    queryFn: ({ signal }) => fetchPracticeLeaderboard(fetch, signal),
    initialData: initialProjectionValid && principal === initialPrincipal ? initialLeaderboard : undefined,
    initialDataUpdatedAt: 0,
    enabled: browser && sessionStore.initialResolutionComplete !== false,
  }));
  const campaignsQuery = createQuery(() => ({
    ...PRACTICE_COMMUNITY_QUERY_POLICY,
    queryKey: serverStateKeys.practiceCommunity.campaigns(principal),
    queryFn: ({ signal }) => fetchPracticeCampaigns(fetch, { signal }),
    initialData: initialProjectionValid && principal === initialPrincipal ? initialCampaigns : undefined,
    initialDataUpdatedAt: 0,
    enabled: browser && sessionStore.initialResolutionComplete !== false,
  }));
  const leaderboardData = $derived(leaderboardQuery.data ?? (initialProjectionValid && principal === initialPrincipal ? initialLeaderboard : { ...initialLeaderboard, ranking: [] }));
  const leaderboard = $derived({ ...leaderboardData, ranking: leaderboardData.ranking.filter(member => !member.authorId || !activeBlocks.includes(member.authorId)) });
  const campaigns = $derived(campaignsQuery.data?.campaigns ?? (initialProjectionValid && principal === initialPrincipal ? initialCampaigns.campaigns : []));
  const communityEnabled = $derived(
    leaderboard.enabled !== false && (campaignsQuery.data ?? initialCampaigns).enabled !== false,
  );
  const refreshError = $derived(leaderboardQuery.error || campaignsQuery.error
    ? (isEn ? 'Community data could not be refreshed. Showing last cached data.' : 'Dữ liệu cộng đồng chưa thể làm mới. Bản gần nhất vẫn được giữ lại.')
    : '');

  let busyCampaignId = $state<string | null>(null);
  let actionError = $state('');
  let errorCampaignId = $state<string | null>(null);

  $effect(() => {
    if (previousPrincipal === principal) return;
    const old = previousPrincipal;
    previousPrincipal = principal;
    initialProjectionValid = false;
    void queryClient.cancelQueries({ queryKey: serverStateKeys.practiceCommunity.leaderboardForPrincipal(old), exact: true });
    queryClient.removeQueries({ queryKey: serverStateKeys.practiceCommunity.leaderboardForPrincipal(old), exact: true });
    void queryClient.cancelQueries({ queryKey: serverStateKeys.practiceCommunity.campaigns(old), exact: true });
    queryClient.removeQueries({ queryKey: serverStateKeys.practiceCommunity.campaigns(old), exact: true });
    blockedAuthors = []; blockedPrincipal = principal;
    actionError = ''; errorCampaignId = null;
  });
  onMount(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<CommunityBlocksChangedDetail>).detail;
      if (!detail?.blocked || detail.principalId !== principal) return;
      blockedPrincipal = principal;
      blockedAuthors = [...new Set([...blockedAuthors, detail.authorId])];
      const queryKey = serverStateKeys.practiceCommunity.leaderboardForPrincipal(principal);
      void queryClient.cancelQueries({ queryKey, exact: true });
      queryClient.setQueryData<PracticeLeaderboardData>(queryKey, current => current ? { ...current, ranking: current.ranking.filter(member => member.authorId !== detail.authorId) } : undefined);
      void queryClient.invalidateQueries({ queryKey, exact: true, refetchType: 'none' });
    };
    window.addEventListener(COMMUNITY_BLOCKS_CHANGED_EVENT, changed);
    return () => window.removeEventListener(COMMUNITY_BLOCKS_CHANGED_EVENT, changed);
  });

  function requestLogin(): void {
    if (!isUserAuthenticated) {
      window.dispatchEvent(new CustomEvent('quangtu:login-required'));
    }
  }

  async function handleMembership(campaign: PracticeCampaign): Promise<void> {
    if (busyCampaignId) return;
    if (!isUserAuthenticated) {
      window.dispatchEvent(new CustomEvent('quangtu:login-required'));
      return;
    }
    busyCampaignId = campaign.id;
    errorCampaignId = campaign.id;
    actionError = '';
    const owner = principal;
    try {
      if (campaign.joined) {
        await leavePracticeCampaign(campaign.id);
      } else {
        await joinPracticeCampaign(campaign.id);
      }
      if (principal !== owner) return;
      queryClient.setQueryData<PracticeCampaignListData>(
        serverStateKeys.practiceCommunity.campaigns(owner),
        (current) => withCampaignMembership(current ?? initialCampaigns, campaign.id, !campaign.joined),
      );
    } catch (e) {
      if (principal === owner) actionError = e instanceof Error ? e.message : (isEn ? 'Could not join. Please try again.' : 'Không thể tham gia. Vui lòng thử lại.');
    } finally {
      busyCampaignId = null;
    }
  }
</script>

<main class="practice-community-public practice-theme" data-practice="community" aria-busy={leaderboardQuery.isFetching || campaignsQuery.isFetching}>
  <header>
    <div class="practice-community-public__intro">
      <span>{isEn ? 'VOLUNTARY SANGHA COMMUNITY' : 'CỘNG ĐỒNG TỰ NGUYỆN'}</span>
      <h1>{isEn ? 'Diligent Practice Together' : 'Cùng nhau tinh tấn'}</h1>
      <p>{isEn ? 'Only members who voluntarily opt into public sharing appear here. Personal logs and individual progress remain private.' : 'Chỉ những thành viên chủ động bật chia sẻ mới xuất hiện. Nhật ký và tiến độ riêng không được hiển thị ở đây.'}</p>
    </div>
    {#if !isUserAuthenticated}
      <aside>
        <LockKeyhole aria-hidden="true" size={22} strokeWidth={1.8} />
        <div><strong>{isEn ? 'Your progress is always private' : 'Tiến độ của bạn luôn riêng tư'}</strong><small>{isEn ? 'Log in to view your calendar, streak days, and verified milestones.' : 'Đăng nhập để xem nhật lịch, chuỗi ngày và thành tựu đã xác minh.'}</small></div>
        <button type="button" onclick={requestLogin}>{isEn ? 'Log in to view progress' : 'Đăng nhập để xem tiến độ'}</button>
      </aside>
    {/if}
  </header>

  {#if refreshError}<p class="practice-community-public__notice" role="status">{refreshError}</p>{/if}

  {#if communityEnabled}
    <PracticeLeaderboard {leaderboard} principalId={principal} />
    <PracticeCampaigns {campaigns} {busyCampaignId} {errorCampaignId} errorMessage={actionError} authenticated={isUserAuthenticated} onMembership={handleMembership} />
  {:else}
    <p class="practice-community-public__notice" role="status">{isEn ? 'Practice community features are temporarily paused.' : 'Tính năng cộng đồng tu tập đang tạm dừng.'}</p>
  {/if}
</main>

<style>
  .practice-community-public{--pc-space-1:4px;--pc-space-2:8px;--pc-space-3:12px;--pc-space-4:16px;--pc-space-5:20px;--pc-space-6:28px;--pc-space-7:36px;--pc-space-8:48px;--pc-radius-xs:4px;--pc-radius:10px;--pc-radius-lg:16px;--pc-radius-pill:999px;--pc-type-0:var(--font-size-meta);--pc-type-1:var(--font-size-body);--pc-type-2:var(--font-size-body);--pc-type-3:var(--font-size-card-title);--pc-type-4:calc(20px * var(--ui-font-scale, 1));--pc-type-5:var(--font-size-section-title);--pc-ease:cubic-bezier(.25,1,.5,1);display:grid;width:min(1080px,calc(100% - 32px));margin:0 auto;padding:var(--pc-space-4) 0 var(--pc-space-5);gap:var(--pc-space-5);color:var(--text);font-family:var(--font-app)}
  .practice-community-public>header{display:grid;align-items:center;padding-bottom:var(--pc-space-4);border-bottom:1px solid var(--border);grid-template-columns:1fr;gap:var(--pc-space-4);text-align:center}
  header>div>span{display:block;color:var(--brown);font-size:var(--font-size-meta);font-weight:800;letter-spacing:.12em}h1{margin:var(--pc-space-1) 0 0;color:var(--brown-dark);font-size:var(--pc-type-5);font-weight:800;line-height:1.3;letter-spacing:-.01em;text-wrap:balance}:global([data-theme="dark"]) h1{color:var(--text)}header>div>p{max-width:60ch;overflow-wrap:anywhere;margin:var(--pc-space-2) auto 0;color:var(--text2);font-size:var(--pc-type-2);line-height:1.55;text-wrap:pretty}
  aside{display:grid;padding:var(--pc-space-5);border:1px solid var(--border);border-radius:var(--radius-card);background:linear-gradient(155deg,var(--card),var(--bg2));box-shadow:inset 0 1.5px 0 color-mix(in srgb,var(--card) 88%,transparent),inset 0 -3px 0 rgba(60,40,10,.08),var(--shadow-sm);gap:var(--pc-space-3);text-align:left}aside>:global(svg){color:var(--gold)}aside>div{display:grid;gap:var(--pc-space-1)}aside strong{font-size:var(--font-size-label)}aside small{color:var(--text2);font-size:var(--font-size-meta);line-height:1.55}button{min-height:44px;padding:0 var(--pc-space-4);border:1px solid color-mix(in srgb,var(--card) 45%,var(--gold));border-radius:999px;background:linear-gradient(145deg,var(--gold2),var(--gold));color:var(--on-gold);cursor:pointer;font:800 var(--pc-type-1) var(--font-app);box-shadow:inset 0 1.5px 0 rgba(255,255,255,.55),inset 0 -2.5px 0 rgba(90,56,8,.22),0 5px 12px -3px color-mix(in srgb,var(--gold) 40%,transparent);transition:transform .12s var(--pc-ease),filter .15s ease}button:hover{filter:brightness(1.04);transform:translateY(-1.5px)}button:active{transform:translateY(1.5px) scale(.98)}
  .practice-community-public__notice{margin:calc(var(--pc-space-5) * -1 + var(--pc-space-2)) 0 0;padding:var(--pc-space-3) var(--pc-space-4);border-radius:var(--pc-radius);background:var(--gold-light);color:var(--brown);font-size:var(--pc-type-1)}
  @media(max-width:760px){.practice-community-public{width:min(100% - 32px,1080px);padding-top:var(--pc-space-4)}}
  @media(max-width:420px){.practice-community-public{width:min(100% - 24px,1080px);padding-top:var(--pc-space-3);gap:var(--pc-space-4)}}
  @media(prefers-reduced-motion:reduce){.practice-community-public button{transition:none}.practice-community-public button:hover,.practice-community-public button:active{transform:none}}
</style>
