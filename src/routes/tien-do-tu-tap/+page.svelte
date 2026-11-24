<script lang="ts">
  import '$lib/styles/practice-theme.css';
  import PracticeProgressDashboard from '$lib/components/practice/community/PracticeProgressDashboard.svelte';
  import PracticeCommunityPublic from '$lib/components/practice/community/PracticeCommunityPublic.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getSessionContext } from '$lib/stores/session.svelte';
  import type { PracticeProgressData } from '$lib/browser/practice-community';
  import { getVietnamIsoDate } from '$lib/domain/practice/stats';

  let { data } = $props();
  const sessionStore = getSessionContext();
  const localeStore = getLocaleContext();
  const isEn = $derived(localeStore.current === 'en');

  const currentUser = $derived(sessionStore.value.authenticated ? sessionStore.value.user : null);
  const isAuthenticated = $derived(Boolean(currentUser));

  const fallbackProgress: PracticeProgressData = {
    profile: {
      leaderboardOptIn: false,
      presenceOptIn: false,
      selectedBadge: null,
      timeZone: 'Asia/Ho_Chi_Minh',
    },
    heatmap: [],
    streaks: { current: 0, longest: 0 },
    badges: [],
    totals: { acceptedCount: 0, acceptedDurationSeconds: 0, sessions: 0 },
    breakdown: [],
    today: getVietnamIsoDate(),
  };
</script>

<svelte:head>
  <title>{isEn ? 'Practice Progress — Tu Tập Phật Pháp' : 'Tiến độ tu tập — Tu Tập Phật Pháp'}</title>
  <meta name="description" content={isEn ? 'Your personal practice calendar, achievements and verified goals.' : 'Nhật lịch, thành tựu và mục tiêu tu tập riêng tư của bạn.'} />
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

{#if currentUser && isAuthenticated}
  <PracticeProgressDashboard
    initialProgress={data.progress || fallbackProgress}
    initialLeaderboard={data.leaderboard}
    initialCampaigns={data.campaigns}
    user={currentUser}
  />
{:else}
  <PracticeCommunityPublic initialLeaderboard={data.leaderboard} initialCampaigns={data.campaigns} />
{/if}
