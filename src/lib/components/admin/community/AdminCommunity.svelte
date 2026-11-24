<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { page as routePage } from '$app/state';
  import { fetchWithSessionRefresh } from '$lib/browser/session-csrf';
  import { ADMIN_REFRESH_INTERVAL_MS, startVisibleInterval } from '$lib/browser/visible-interval';
  import { SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import type { PageSessionDTO } from '$lib/server/auth/types';
  import type { AdminCommunityData, CommunityPeriod } from '$lib/server/services/admin-community';
  import type { ThanhTinhParticipantAdminRow } from '$lib/server/services/thanh-tinh';
  import type { ParticipationRow } from '$lib/contracts/practice-participation';
  import AdminRefreshControl from '../shared/AdminRefreshControl.svelte';
  import AdminModerationQueue from './AdminModerationQueue.svelte';
  import ThanhTinhParticipantsTable from './ThanhTinhParticipantsTable.svelte';
  import FivePreceptsParticipantsTable from './FivePreceptsParticipantsTable.svelte';
  import EightPreceptsParticipantsTable from './EightPreceptsParticipantsTable.svelte';

  interface Props {
    initialData: AdminCommunityData;
    initialThanhTinhParticipants?: ThanhTinhParticipantAdminRow[];
  }

  let {
    initialData,
    initialThanhTinhParticipants = []
  }: Props = $props();

  function sectionFromUrl(url: URL): 'moderation' | 'ranking' | 'practice' {
    const s = url.searchParams.get('section');
    if (s === 'ranking' || s === 'practice') return s;
    if (url.searchParams.has('period')) return 'ranking';
    return 'moderation';
  }

  let activeSection = $state<'moderation' | 'ranking' | 'practice'>(sectionFromUrl(routePage.url));
  let community = $state(untrack(() => initialData));
  let thanhTinhParticipants = $state<ThanhTinhParticipantAdminRow[]>(untrack(() => initialThanhTinhParticipants));
  let fivePreceptsParticipants = $state<ParticipationRow[]>([]);
  let eightPreceptsParticipants = $state<ParticipationRow[]>([]);
  let practiceTab = $state<'thanh-tinh' | 'five-precepts' | 'eight-precepts'>('thanh-tinh');

  // Lazy loading flags: chỉ nạp D1 khi người dùng thật sự bấm xem tab đó
  let thanhLoaded = $state(false);
  let fiveLoaded = $state(false);
  let eightLoaded = $state(false);
  let loadingTab = $state(false);

  let busy = $state(false);
  let refreshError = $state('');
  let moderationReady = $state(false);
  let controller: AbortController | null = null;
  let disposed = false;
  const numberFormat = new Intl.NumberFormat('vi-VN');
  const periods: Array<{ label: string; value: CommunityPeriod }> = [
    { label: 'Tuần này', value: 'week' }, { label: 'Tháng này', value: 'month' }, { label: 'Năm nay', value: 'year' },
  ];

  $effect(() => {
    const nextInitialData = initialData;
    const nextThanhTinh = initialThanhTinhParticipants;
    untrack(() => {
      controller?.abort();
      controller = null;
      community = nextInitialData;
      thanhTinhParticipants = nextThanhTinh;
      busy = false;
      refreshError = '';
    });
  });

  // Tối ưu D1: Chuyển tab chỉ nạp D1 đúng 1 lần (Lazy Load), các lần sau lấy từ cache in-memory
  async function ensureTabData(tab: 'thanh-tinh' | 'five-precepts' | 'eight-precepts'): Promise<void> {
    practiceTab = tab;
    if (tab === 'thanh-tinh' && !thanhLoaded && thanhTinhParticipants.length === 0) {
      await refreshThanhTinh();
    } else if (tab === 'five-precepts' && !fiveLoaded) {
      await refreshFivePrecepts();
    } else if (tab === 'eight-precepts' && !eightLoaded) {
      await refreshEightPrecepts();
    }
  }

  async function refreshThanhTinh(): Promise<void> {
    if (loadingTab) return;
    loadingTab = true;
    try {
      const res = await fetchWithSessionRefresh('/api/admin/thanh-tinh/participants', {
        headers: { accept: 'application/json' },
      });
      if (res.ok) {
        thanhTinhParticipants = (await res.json().catch(() => [])) as ThanhTinhParticipantAdminRow[];
        thanhLoaded = true;
      }
    } catch {
      // Giữ nguyên dữ liệu cũ
    } finally {
      loadingTab = false;
    }
  }

  async function refreshFivePrecepts(): Promise<void> {
    if (loadingTab) return;
    loadingTab = true;
    try {
      const res = await fetchWithSessionRefresh('/api/admin/practice-participation?module=five&period=all&limit=50', {
        headers: { accept: 'application/json' },
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({ rows: [] })) as { rows?: ParticipationRow[] };
        fivePreceptsParticipants = data.rows ?? [];
        fiveLoaded = true;
      }
    } catch {
      // Giữ nguyên dữ liệu cũ
    } finally {
      loadingTab = false;
    }
  }

  async function refreshEightPrecepts(): Promise<void> {
    if (loadingTab) return;
    loadingTab = true;
    try {
      const res = await fetchWithSessionRefresh('/api/admin/practice-participation?module=eight&period=all&limit=50', {
        headers: { accept: 'application/json' },
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({ rows: [] })) as { rows?: ParticipationRow[] };
        eightPreceptsParticipants = data.rows ?? [];
        eightLoaded = true;
      }
    } catch {
      // Giữ nguyên dữ liệu cũ
    } finally {
      loadingTab = false;
    }
  }

  // Tối ưu D1: Nút làm mới tổng thể ở đầu trang chỉ làm mới cộng đồng và tab đang mở
  async function refresh(): Promise<void> {
    if (busy) return;
    busy = true;
    refreshError = '';
    const nextController = new AbortController();
    controller = nextController;
    try {
      const [communityResponse] = await Promise.all([
        fetchWithSessionRefresh(`/api/admin/community?period=${community.period}`, { headers: { accept: 'application/json' }, signal: nextController.signal }),
        activeSection === 'practice'
          ? (practiceTab === 'thanh-tinh' ? refreshThanhTinh() : practiceTab === 'five-precepts' ? refreshFivePrecepts() : refreshEightPrecepts())
          : Promise.resolve(),
      ]);
      if (communityResponse.status === 401 || communityResponse.status === 403) {
        leaveAdmin();
        return;
      }
      if (!communityResponse.ok) throw new Error(`community_refresh_${communityResponse.status}`);
      const nextCommunity = await communityResponse.json() as AdminCommunityData;

      if (!disposed && !nextController.signal.aborted) {
        community = nextCommunity;
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) refreshError = 'Không thể làm mới. Dữ liệu gần nhất vẫn được giữ lại.';
    } finally {
      if (controller === nextController) controller = null;
      if (!disposed) busy = false;
    }
  }

  // Tối ưu D1: Bộ định thời chạy nền định kỳ (5 phút) CHỈ làm mới dữ liệu cộng đồng chung, KHÔNG quét các bảng danh sách
  async function refreshBackground(): Promise<void> {
    if (busy) return;
    try {
      const response = await fetchWithSessionRefresh(`/api/admin/community?period=${community.period}`, { headers: { accept: 'application/json' } });
      if (response.status === 401 || response.status === 403) {
        leaveAdmin();
        return;
      }
      if (response.ok && !disposed) {
        community = await response.json() as AdminCommunityData;
      }
    } catch {
      // Giữ nguyên dữ liệu cũ
    }
  }

  onMount(() => {
    disposed = false;
    moderationReady = true;
    if (activeSection === 'practice') void ensureTabData(practiceTab);
    const stopPolling = startVisibleInterval(() => void refreshBackground(), ADMIN_REFRESH_INTERVAL_MS);
    const sessionChanged = (event: Event) => {
      const session = (event as CustomEvent<PageSessionDTO>).detail;
      if (!session?.authenticated || session.user?.role !== 'admin') leaveAdmin();
    };
    window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    return () => { disposed = true; stopPolling(); controller?.abort(); window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged); };
  });

  function leaveAdmin(): void {
    if (disposed) return;
    controller?.abort();
    community = {
      ...community,
      online: { members: 0, guests: 0, internal: 0, total: 0, visitors: [] },
      ranking: [],
    };
    thanhTinhParticipants = [];
    fivePreceptsParticipants = [];
    eightPreceptsParticipants = [];
    refreshError = 'Phiên quản trị đã hết hạn hoặc không đủ quyền.';
  }
</script>

<main class="admin-community" aria-busy={busy}>
  <header class="admin-overview-header">
    <div>
      <span>Cộng đồng</span>
      <h1>Hoạt động cộng đồng</h1>
      <p>Quản lý kiểm duyệt, xếp hạng tu tập và thọ trì giới luật.</p>
    </div>
    <AdminRefreshControl busy={busy} generatedAt={community.generatedAt} onRefresh={refresh} />
  </header>
  {#if refreshError}<p class="admin-overview-notice" role="status">{refreshError}</p>{/if}

  <!-- Bố cục thanh điều hướng chuyên mục khoa học, chống cuộn dài, dễ quản lý trên Mobile -->
  <div class="admin-community__section-nav" role="tablist" aria-label="Khu vực quản trị cộng đồng">
    <button
      type="button"
      role="tab"
      class="section-nav-btn"
      class:active={activeSection === 'moderation'}
      aria-selected={activeSection === 'moderation'}
      onclick={() => activeSection = 'moderation'}
    >
      <span>📋 Kiểm duyệt</span>
      <small>Quán chiếu & Bình luận</small>
    </button>
    <button
      type="button"
      role="tab"
      class="section-nav-btn"
      class:active={activeSection === 'ranking'}
      aria-selected={activeSection === 'ranking'}
      onclick={() => activeSection = 'ranking'}
    >
      <span>🏆 Xếp hạng</span>
      <small>Công phu tu tập</small>
    </button>
    <button
      type="button"
      role="tab"
      class="section-nav-btn"
      class:active={activeSection === 'practice'}
      aria-selected={activeSection === 'practice'}
      onclick={() => { activeSection = 'practice'; void ensureTabData(practiceTab); }}
    >
      <span>📿 Giới luật</span>
      <small>Tiết dục & Thọ giới</small>
    </button>
  </div>

  <!-- Khu vực 1: Kiểm duyệt nội dung -->
  {#if activeSection === 'moderation'}
    {#if moderationReady}<AdminModerationQueue />{/if}

  <!-- Khu vực 2: Bảng xếp hạng tu tập -->
  {:else if activeSection === 'ranking'}
    <section class="admin-community__ranking" aria-labelledby="community-ranking-title">
      <header>
        <div>
          <span>Tu tập đều đặn</span>
          <h2 id="community-ranking-title">Bảng xếp hạng tu tập</h2>
          <p>Ưu tiên số ngày thực hành, sau đó là chuỗi ngày và số lần ghi nhận. Không cộng chéo các loại công phu.</p>
        </div>
        <nav class="admin-community__periods" aria-label="Khoảng thời gian xếp hạng">
          {#each periods as period}
            <a href={`?section=ranking&period=${period.value}`} aria-current={community.period === period.value ? 'page' : undefined}>
              {period.label}
            </a>
          {/each}
        </nav>
      </header>
      {#if community.ranking.length}
        <div class="admin-community__ranking-table"><table>
          <caption class="visually-hidden">Xếp hạng thành viên tu tập đều đặn</caption>
          <thead><tr><th scope="col">Hạng</th><th scope="col">Thành viên</th><th scope="col">Ngày tu tập</th><th scope="col">Chuỗi ngày</th><th scope="col">Ghi nhận</th><th scope="col">Theo loại</th></tr></thead>
          <tbody>{#each community.ranking as member}
            <tr class:top-three={member.rank <= 3}>
              <td data-label="Hạng"><strong>#{member.rank}</strong></td>
              <td data-label="Thành viên"><span class="admin-community__member">{#if member.avatarUrl}<img src={member.avatarUrl} alt="" width="34" height="34" referrerpolicy="no-referrer" />{:else}<i aria-hidden="true">{member.displayName.slice(0, 1).toUpperCase()}</i>{/if}<b>{member.displayName}</b></span></td>
              <td data-label="Ngày tu tập">{numberFormat.format(member.activeDays)}</td>
              <td data-label="Chuỗi ngày">{numberFormat.format(member.streak)} ngày</td>
              <td data-label="Ghi nhận">{numberFormat.format(member.logCount)} lần</td>
              <td data-label="Theo loại"><ul>{#each member.totalsByType as total}<li>{total.type}: <strong>{numberFormat.format(total.count)}</strong></li>{/each}</ul></td>
            </tr>
          {/each}</tbody>
        </table></div>
      {:else}
        <div class="admin-community__empty"><p>Chưa có thành viên ghi nhận công phu trong khoảng thời gian này.</p></div>
      {/if}
    </section>

  <!-- Khu vực 3: Giới luật & Tiết dục bảo thân -->
  {:else if activeSection === 'practice'}
    <section class="admin-community__practice-section" aria-labelledby="community-practice-title">
      <div class="admin-community__practice-tabs" role="tablist" aria-label="Thống kê người tham gia giữ giới và tiết dục">
        <button
          type="button"
          role="tab"
          class="practice-tab-btn"
          class:active={practiceTab === 'thanh-tinh'}
          aria-selected={practiceTab === 'thanh-tinh'}
          onclick={() => void ensureTabData('thanh-tinh')}
        >
          <span>🛡️ Tiết dục bảo thân</span>
          <small>({numberFormat.format(thanhTinhParticipants.length)})</small>
        </button>
        <button
          type="button"
          role="tab"
          class="practice-tab-btn"
          class:active={practiceTab === 'five-precepts'}
          aria-selected={practiceTab === 'five-precepts'}
          onclick={() => void ensureTabData('five-precepts')}
        >
          <span>📿 Giữ Ngũ giới</span>
          {#if fiveLoaded}
            <small>({numberFormat.format(fivePreceptsParticipants.length)})</small>
          {:else}
            <small>(Xem)</small>
          {/if}
        </button>
        <button
          type="button"
          role="tab"
          class="practice-tab-btn"
          class:active={practiceTab === 'eight-precepts'}
          aria-selected={practiceTab === 'eight-precepts'}
          onclick={() => void ensureTabData('eight-precepts')}
        >
          <span>🌸 Bát quan trai</span>
          {#if eightLoaded}
            <small>({numberFormat.format(eightPreceptsParticipants.length)})</small>
          {:else}
            <small>(Xem)</small>
          {/if}
        </button>
      </div>

      {#if practiceTab === 'thanh-tinh'}
        <ThanhTinhParticipantsTable
          participants={thanhTinhParticipants}
          onRefresh={refreshThanhTinh}
          busy={loadingTab}
        />
      {:else if practiceTab === 'five-precepts'}
        <FivePreceptsParticipantsTable
          participants={fivePreceptsParticipants}
          onRefresh={refreshFivePrecepts}
          busy={loadingTab}
        />
      {:else}
        <EightPreceptsParticipantsTable
          participants={eightPreceptsParticipants}
          onRefresh={refreshEightPrecepts}
          busy={loadingTab}
        />
      {/if}
    </section>
  {/if}
</main>
