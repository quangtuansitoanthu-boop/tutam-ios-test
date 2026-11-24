<script lang="ts">
  import { createInterfaceTranslator } from '$lib/i18n/interface';
  const localizeUi = createInterfaceTranslator();

  import type { ParticipationRow } from '$lib/contracts/practice-participation';
  import { participationEvents } from '$lib/i18n/participation';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  interface Props {
    moduleKey?: 'five' | 'eight';
    badge?: string;
    title?: string;
    description?: string;
    participants: ParticipationRow[];
    onRefresh?: () => void;
    busy?: boolean;
  }

  let {
    moduleKey = 'five',
    badge,
    title,
    description,
    participants = [],
    onRefresh,
    busy = false
  }: Props = $props();

  const locale = getLocaleContext();
  const events = $derived(participationEvents[locale.current === 'en' ? 'en' : 'vi']);

  const defaultBadge = $derived(
    badge ?? (moduleKey === 'eight' ? localizeUi("Tập Tu Xuất Thế Gian") : localizeUi("Thọ Trì Giới Luật"))
  );
  const defaultTitle = $derived(
    title ?? (moduleKey === 'eight' ? localizeUi("Người Thọ Bát Quan Trai Giới") : localizeUi("Người Tham Gia Giữ Ngũ Giới"))
  );
  const defaultDesc = $derived(
    description ?? (moduleKey === 'eight'
      ? localizeUi("Danh sách thành viên phát tâm thọ trì 8 giới Bát quan trai trong một ngày một đêm (tập sống thanh tịnh như người xuất gia, dứt trừ dâm dục, không ăn phi thời, không nằm giường cao đẹp...) được ghi nhận từ ứng dụng.")
      : localizeUi("Danh sách thành viên thực hành gìn giữ năm giới (không sát sinh, không trộm cắp, không tà dâm, không nói dối, không uống rượu/chất say) được ghi nhận và đồng bộ từ ứng dụng."))
  );

  let searchQuery = $state('');
  let sortBy = $state<'lastActive' | 'name' | 'event'>('lastActive');

  const numberFormat = new Intl.NumberFormat(localizeUi.locale());

  const filteredParticipants = $derived.by(() => {
    let list = participants;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.email && p.email.toLowerCase().includes(q)) ||
        p.ownerId.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name, localizeUi.locale());
      if (sortBy === 'event') {
        const score = (ev: string) => ev === 'completed' ? 2 : ev === 'recorded' ? 1 : 0;
        return score(b.event) - score(a.event);
      }
      return Date.parse(b.at) - Date.parse(a.at);
    });
  });

  const completedCount = $derived(participants.filter((p) => p.event === 'completed').length);
  const practicingCount = $derived(participants.filter((p) => p.event === 'recorded' || p.event === 'started').length);

  function formatDateTime(iso: string): string {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString(localizeUi.locale(), {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return iso;
    }
  }
</script>

<section class="admin-precepts-table" aria-labelledby={`precepts-title-${moduleKey}`}>
  <header class="admin-precepts-table__header">
    <div>
      <span class="admin-precepts-table__badge">{defaultBadge}</span>
      <h2 id={`precepts-title-${moduleKey}`}>{defaultTitle}</h2>
      <p class="admin-precepts-table__desc">{defaultDesc}</p>
    </div>
    {#if onRefresh}
      <button type="button" class="admin-precepts-table__refresh-btn" onclick={onRefresh} disabled={busy}>
        {#if busy}
          <span class="spinner" aria-hidden="true"></span> {localizeUi("Đang tải...")}
        {:else}
          {localizeUi("🔄 Làm mới danh sách")}
        {/if}
      </button>
    {/if}
  </header>

  <div class="admin-precepts-table__summary">
    <div class="summary-card">
      <span class="summary-label">{moduleKey === 'eight' ? localizeUi("Người thọ giới") : localizeUi("Người tham gia")}</span>
      <span class="summary-value">{numberFormat.format(participants.length)}</span>
      <small>{moduleKey === 'eight' ? localizeUi("hành giả ghi nhận") : localizeUi("thành viên ghi nhận")}</small>
    </div>
    <div class="summary-card">
      <span class="summary-label">{moduleKey === 'eight' ? localizeUi("Hoàn tất trọn vẹn") : localizeUi("Hoàn tất phiên")}</span>
      <span class="summary-value text-success">{numberFormat.format(completedCount)}</span>
      <small>{moduleKey === 'eight' ? localizeUi("phiên 24 giờ trọn vẹn") : localizeUi("phiên trọn vẹn")}</small>
    </div>
    <div class="summary-card">
      <span class="summary-label">{moduleKey === 'eight' ? localizeUi("Đang giữ giới") : localizeUi("Đang thực hành")}</span>
      <span class="summary-value text-accent">{numberFormat.format(practicingCount)}</span>
      <small>{moduleKey === 'eight' ? localizeUi("đang thọ trì") : localizeUi("đang giữ giới")}</small>
    </div>
  </div>

  <div class="admin-precepts-table__controls">
    <div class="admin-precepts-table__search">
      <input
        type="search"
        placeholder={localizeUi("Tìm theo tên, email, mã tài khoản...")}
        bind:value={searchQuery}
        aria-label={localizeUi("Tìm kiếm người tham gia giữ giới")}
      />
    </div>
    <div class="admin-precepts-table__sort">
      <label for={`sort-${moduleKey}`}>{localizeUi("Sắp xếp:")}</label>
      <select id={`sort-${moduleKey}`} bind:value={sortBy}>
        <option value="lastActive">{localizeUi("Hoạt động gần nhất")}</option>
        <option value="name">{localizeUi("Tên thành viên (A-Z)")}</option>
        <option value="event">{localizeUi("Mức độ hoàn tất")}</option>
      </select>
    </div>
  </div>

  {#if filteredParticipants.length > 0}
    <div class="admin-precepts-table__table-wrap">
      <table>
        <caption class="visually-hidden">{defaultTitle}</caption>
        <thead>
          <tr>
            <th scope="col">{localizeUi("Thành viên")}</th>
            <th scope="col">{localizeUi("Tài khoản")}</th>
            <th scope="col">{localizeUi("Trạng thái giữ giới")}</th>
            <th scope="col">{localizeUi("Thời điểm ghi nhận")}</th>
            <th scope="col">{localizeUi("Đồng bộ lúc")}</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredParticipants as item (`${item.ownerId}:${item.module}`)}
            <tr>
              <td data-label={localizeUi("Thành viên")}>
                <div class="member-cell">
                  <span class="member-avatar" aria-hidden="true">
                    {item.name ? item.name.charAt(0).toUpperCase() : '?'}
                  </span>
                  <div class="member-info">
                    <strong>{item.name}</strong>
                    <span class="tag-member">{localizeUi("Đã đồng bộ")}</span>
                  </div>
                </div>
              </td>
              <td data-label={localizeUi("Tài khoản")}>
                {#if item.email}
                  <span class="member-email">{item.email}</span>
                {:else}
                  <code class="member-hash" title={item.ownerId}>{item.ownerId.slice(0, 12)}...</code>
                {/if}
              </td>
              <td data-label={localizeUi("Trạng thái giữ giới")}>
                <span class="event-pill" class:completed={item.event === 'completed'} class:recorded={item.event === 'recorded'} class:started={item.event === 'started'}>
                  {#if item.event === 'completed'}
                    ✅ {events.completed}
                  {:else if item.event === 'recorded'}
                    📝 {events.recorded}
                  {:else}
                    ⏳ {events.started}
                  {/if}
                </span>
              </td>
              <td data-label={localizeUi("Thời điểm ghi nhận")}>
                <time datetime={item.at}>{formatDateTime(item.at)}</time>
              </td>
              <td data-label={localizeUi("Đồng bộ lúc")}>
                <time datetime={item.syncedAt}>{formatDateTime(item.syncedAt)}</time>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <div class="admin-precepts-table__empty">
      {#if searchQuery}
        <p>{localizeUi("Không tìm thấy thành viên nào khớp với \"")}{searchQuery}".</p>
      {:else}
        <p>{localizeUi("Chưa có thành viên nào ghi nhận trong cơ sở dữ liệu.")}</p>
      {/if}
    </div>
  {/if}
</section>

<style>
  .admin-precepts-table {
    overflow: hidden;
    margin-top: 16px;
    border: 1px solid var(--border2);
    border-radius: 14px;
    background: var(--card);
    box-shadow: var(--shadow);
  }

  .admin-precepts-table__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    padding: 20px 22px;
    border-bottom: 1px solid var(--border2);
  }

  .admin-precepts-table__badge {
    color: var(--admin-accent-text, var(--gold));
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1.2px;
    text-transform: uppercase;
  }

  .admin-precepts-table__header h2 {
    margin: 4px 0 6px;
    color: var(--text);
    font-size: 18px;
    font-weight: 600;
  }

  .admin-precepts-table__desc {
    margin: 0;
    color: var(--text2);
    font-size: 12px;
    line-height: 1.6;
    max-width: 720px;
  }

  .admin-precepts-table__refresh-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 8px 14px;
    border: 1px solid var(--border2);
    border-radius: 8px;
    background: var(--bg2);
    color: var(--text);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s;
  }

  .admin-precepts-table__refresh-btn:hover:not(:disabled) {
    background: var(--card);
    border-color: var(--gold);
    color: var(--admin-accent-text, var(--gold));
  }

  .admin-precepts-table__refresh-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .admin-precepts-table__summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border-bottom: 1px solid var(--border2);
    background: color-mix(in srgb, var(--card) 95%, var(--bg2));
  }

  .summary-card {
    padding: 16px 20px;
    border-right: 1px solid var(--border2);
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .summary-card:last-child {
    border-right: 0;
  }

  .summary-label {
    color: var(--text2);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .summary-value {
    color: var(--text);
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.5px;
  }

  .summary-value.text-success {
    color: #16a34a;
  }

  .summary-value.text-accent {
    color: var(--admin-accent-text, #d97706);
  }

  .summary-card small {
    color: var(--text2);
    font-size: 11px;
  }

  .admin-precepts-table__controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 20px;
    border-bottom: 1px solid var(--border2);
    background: var(--bg2);
  }

  .admin-precepts-table__search input {
    width: 280px;
    max-width: 100%;
    min-height: 44px;
    padding: 8px 12px;
    border: 1px solid var(--border2);
    border-radius: 8px;
    background: var(--card);
    color: var(--text);
    font-size: 12px;
    box-sizing: border-box;
  }

  .admin-precepts-table__search input:focus {
    outline: none;
    border-color: var(--gold);
  }

  .admin-precepts-table__sort {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .admin-precepts-table__sort label {
    color: var(--text2);
    font-size: 12px;
    font-weight: 500;
  }

  .admin-precepts-table__sort select {
    min-height: 44px;
    padding: 8px 12px;
    border: 1px solid var(--border2);
    border-radius: 8px;
    background: var(--card);
    color: var(--text);
    font-size: 12px;
    cursor: pointer;
    box-sizing: border-box;
  }

  .admin-precepts-table__table-wrap {
    overflow-x: auto;
  }

  .admin-precepts-table__table-wrap table {
    width: 100%;
    border-collapse: collapse;
  }

  .admin-precepts-table__table-wrap th {
    padding: 11px 16px;
    border-bottom: 1px solid var(--border2);
    background: var(--bg2);
    color: var(--text2);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.55px;
    text-align: left;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .admin-precepts-table__table-wrap td {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border2);
    color: var(--text2);
    font-size: 12px;
    vertical-align: middle;
  }

  .admin-precepts-table__table-wrap tbody tr:last-child td {
    border-bottom: 0;
  }

  .admin-precepts-table__table-wrap tbody tr:hover {
    background: color-mix(in srgb, var(--gold-light) 30%, var(--card));
  }

  .member-cell {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .member-avatar {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--gold-light);
    color: var(--admin-accent-text, var(--gold));
    font-weight: 700;
    font-size: 13px;
  }

  .member-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .member-info strong {
    color: var(--text);
    font-weight: 600;
  }

  .tag-member {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 4px;
    background: color-mix(in srgb, #22c55e 15%, transparent);
    color: #16a34a;
    font-size: 9px;
    font-weight: 600;
    width: fit-content;
  }

  .member-email {
    color: var(--text);
    font-weight: 500;
  }

  .member-hash {
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--bg2);
    color: var(--text2);
    font-family: monospace;
    font-size: 11px;
  }

  .event-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
  }

  .event-pill.completed {
    background: color-mix(in srgb, #22c55e 15%, transparent);
    color: #16a34a;
  }

  .event-pill.recorded {
    background: color-mix(in srgb, var(--gold) 15%, transparent);
    color: var(--admin-accent-text, #d97706);
  }

  .event-pill.started {
    background: color-mix(in srgb, var(--text2) 15%, transparent);
    color: var(--text2);
  }

  .admin-precepts-table__empty {
    display: grid;
    place-items: center;
    min-height: 140px;
    padding: 24px;
    color: var(--text2);
    font-size: 12px;
    text-align: center;
  }

  @media (max-width: 768px) {
    .admin-precepts-table__header {
      flex-direction: column;
      align-items: flex-start;
    }

    .admin-precepts-table__summary {
      grid-template-columns: 1fr;
    }

    .summary-card {
      border-right: 0;
      border-bottom: 1px solid var(--border2);
    }

    .summary-card:last-child {
      border-bottom: 0;
    }

    .admin-precepts-table__controls {
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
    }

    .admin-precepts-table__search input {
      width: 100%;
    }

    .admin-precepts-table__sort {
      justify-content: space-between;
    }

    .admin-precepts-table__sort select {
      flex: 1;
    }

    .admin-precepts-table__table-wrap thead {
      display: none;
    }

    .admin-precepts-table__table-wrap :is(tbody, tr, td) {
      display: block;
      width: 100%;
      box-sizing: border-box;
    }

    .admin-precepts-table__table-wrap tr {
      display: grid;
      gap: 8px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--border2);
    }

    .admin-precepts-table__table-wrap tr:last-child {
      border-bottom: 0;
    }

    .admin-precepts-table__table-wrap td {
      display: grid;
      grid-template-columns: 110px minmax(0, 1fr);
      padding: 0;
      border: 0;
      align-items: center;
    }

    .admin-precepts-table__table-wrap td::before {
      color: var(--text2);
      content: attr(data-label);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.4px;
      text-transform: uppercase;
    }
  }
</style>
