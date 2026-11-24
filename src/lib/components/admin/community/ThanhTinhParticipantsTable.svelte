<script lang="ts">
  import { createInterfaceTranslator } from '$lib/i18n/interface';
  const localizeUi = createInterfaceTranslator();

  import type { ThanhTinhParticipantAdminRow } from '$lib/server/services/thanh-tinh';

  interface Props {
    participants: ThanhTinhParticipantAdminRow[];
    onRefresh?: () => void;
    busy?: boolean;
  }

  let { participants = [], onRefresh, busy = false }: Props = $props();

  let searchQuery = $state('');
  let sortBy = $state<'lastActive' | 'streak' | 'resisted' | 'joined'>('lastActive');

  const numberFormat = new Intl.NumberFormat(localizeUi.locale());

  const filteredParticipants = $derived.by(() => {
    let list = participants;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((p) =>
        p.displayName.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        p.anonIdHash.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'streak') return b.streakDays - a.streakDays;
      if (sortBy === 'resisted') return b.urgesResisted - a.urgesResisted;
      if (sortBy === 'joined') return Date.parse(b.joinedAt) - Date.parse(a.joinedAt);
      return Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt);
    });
  });

  const totalResisted = $derived(participants.reduce((acc, p) => acc + p.urgesResisted, 0));
  const activeStreakCount = $derived(participants.filter((p) => p.streakDays > 0).length);

  function formatDate(iso: string): string {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(localizeUi.locale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return iso;
    }
  }

  function formatDateTime(iso: string): string {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString(localizeUi.locale(), {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return iso;
    }
  }
</script>

<section class="admin-thanh-tinh" aria-labelledby="thanh-tinh-title">
  <header class="admin-thanh-tinh__header">
    <div>
      <span class="admin-thanh-tinh__badge">{localizeUi("Tu Tập Thanh Tịnh")}</span>
      <h2 id="thanh-tinh-title">{localizeUi("Cai Nghiện Thủ Dâm & Đoạn Trừ Dục Hỏa (Tiết Dục Bảo Thân)")}</h2>
      <p class="admin-thanh-tinh__desc">
        {localizeUi("Danh sách thành viên và khách phát nguyện thanh lọc thân tâm. Phía giao diện người dùng công khai hoàn toàn ẩn danh, chỉ Quản trị viên mới xem được bảng này để theo dõi chuyển biến đạo tâm.")}
      </p>
    </div>
    {#if onRefresh}
      <button type="button" class="admin-thanh-tinh__refresh-btn" onclick={onRefresh} disabled={busy}>
        {#if busy}
          <span class="spinner" aria-hidden="true"></span> {localizeUi("Đang tải...")}
        {:else}
          {localizeUi("🔄 Làm mới danh sách")}
        {/if}
      </button>
    {/if}
  </header>

  <div class="admin-thanh-tinh__summary">
    <div class="summary-card">
      <span class="summary-label">{localizeUi("Đã phát nguyện")}</span>
      <span class="summary-value">{numberFormat.format(participants.length)}</span>
      <small>{localizeUi("người tham gia")}</small>
    </div>
    <div class="summary-card">
      <span class="summary-label">{localizeUi("Đang giữ chuỗi")}</span>
      <span class="summary-value">{numberFormat.format(activeStreakCount)}</span>
      <small>{localizeUi("thành viên (> 0 ngày)")}</small>
    </div>
    <div class="summary-card">
      <span class="summary-label">{localizeUi("Tổng lần dập lửa dục")}</span>
      <span class="summary-value">{numberFormat.format(totalResisted)}</span>
      <small>{localizeUi("cơn dâm dục vượt qua")}</small>
    </div>
  </div>

  <div class="admin-thanh-tinh__controls">
    <div class="admin-thanh-tinh__search">
      <input
        type="search"
        placeholder={localizeUi("Tìm theo tên, email, mã ẩn danh...")}
        bind:value={searchQuery}
        aria-label={localizeUi("Tìm kiếm người tham gia")}
      />
    </div>
    <div class="admin-thanh-tinh__sort">
      <label for="thanh-tinh-sort">{localizeUi("Sắp xếp:")}</label>
      <select id="thanh-tinh-sort" bind:value={sortBy}>
        <option value="lastActive">{localizeUi("Hoạt động gần nhất")}</option>
        <option value="streak">{localizeUi("Chuỗi ngày dài nhất")}</option>
        <option value="resisted">{localizeUi("Số lần dập dục nhiều nhất")}</option>
        <option value="joined">{localizeUi("Ngày phát nguyện mới nhất")}</option>
      </select>
    </div>
  </div>

  {#if filteredParticipants.length > 0}
    <div class="admin-thanh-tinh__table-wrap">
      <table>
        <caption class="visually-hidden">{localizeUi("Danh sách người tham gia Thanh Tịnh Tâm")}</caption>
        <thead>
          <tr>
            <th scope="col">{localizeUi("Thành viên")}</th>
            <th scope="col">{localizeUi("Tài khoản")}</th>
            <th scope="col">{localizeUi("Chuỗi sạch")}</th>
            <th scope="col">{localizeUi("Số lần dập dục")}</th>
            <th scope="col">{localizeUi("Ngày phát nguyện")}</th>
            <th scope="col">{localizeUi("Hoạt động cuối")}</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredParticipants as item (item.anonIdHash)}
            <tr>
              <td data-label={localizeUi("Thành viên")}>
                <div class="member-cell">
                  <span class="member-avatar" aria-hidden="true">
                    {item.displayName ? item.displayName.charAt(0).toUpperCase() : '?'}
                  </span>
                  <div class="member-info">
                    <strong>{item.displayName || localizeUi("Ẩn danh")}</strong>
                    {#if item.userId}
                      <span class="tag-member">{localizeUi("Đã đăng nhập")}</span>
                    {:else}
                      <span class="tag-anon">{localizeUi("Khách vãng lai")}</span>
                    {/if}
                  </div>
                </div>
              </td>
              <td data-label={localizeUi("Tài khoản")}>
                {#if item.email}
                  <span class="member-email">{item.email}</span>
                {:else}
                  <code class="member-hash" title={item.anonIdHash}>ID: {item.anonIdHash.slice(0, 10)}...</code>
                {/if}
              </td>
              <td data-label={localizeUi("Chuỗi sạch")}>
                <span class="streak-badge" class:has-streak={item.streakDays > 0}>
                  🔥 {numberFormat.format(item.streakDays)} {localizeUi("ngày")}
                </span>
              </td>
              <td data-label={localizeUi("Số lần dập dục")}>
                <span class="resisted-pill">
                  🛡️ <strong>{numberFormat.format(item.urgesResisted)}</strong> {localizeUi("lần")}
                </span>
              </td>
              <td data-label={localizeUi("Ngày phát nguyện")}>
                <time datetime={item.joinedAt}>{formatDate(item.joinedAt)}</time>
              </td>
              <td data-label={localizeUi("Hoạt động cuối")}>
                <time datetime={item.lastActiveAt}>{formatDateTime(item.lastActiveAt)}</time>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <div class="admin-thanh-tinh__empty">
      {#if searchQuery}
        <p>{localizeUi("Không tìm thấy thành viên nào khớp với \"")}{searchQuery}".</p>
      {:else}
        <p>{localizeUi("Chưa có thành viên nào phát nguyện Thanh Tịnh Tâm trong cơ sở dữ liệu.")}</p>
      {/if}
    </div>
  {/if}
</section>

<style>
  .admin-thanh-tinh {
    overflow: hidden;
    margin-top: 16px;
    border: 1px solid var(--border2);
    border-radius: 14px;
    background: var(--card);
    box-shadow: var(--shadow);
  }

  .admin-thanh-tinh__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    padding: 20px 22px;
    border-bottom: 1px solid var(--border2);
  }

  .admin-thanh-tinh__badge {
    color: var(--admin-accent-text, var(--gold));
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1.2px;
    text-transform: uppercase;
  }

  .admin-thanh-tinh__header h2 {
    margin: 4px 0 6px;
    color: var(--text);
    font-size: 18px;
    font-weight: 600;
  }

  .admin-thanh-tinh__desc {
    margin: 0;
    color: var(--text2);
    font-size: 12px;
    line-height: 1.6;
    max-width: 720px;
  }

  .admin-thanh-tinh__refresh-btn {
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

  .admin-thanh-tinh__refresh-btn:hover:not(:disabled) {
    background: var(--card);
    border-color: var(--gold);
    color: var(--admin-accent-text, var(--gold));
  }

  .admin-thanh-tinh__refresh-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .admin-thanh-tinh__summary {
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

  .summary-card small {
    color: var(--text2);
    font-size: 11px;
  }

  .admin-thanh-tinh__controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 20px;
    border-bottom: 1px solid var(--border2);
    background: var(--bg2);
  }

  .admin-thanh-tinh__search input {
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

  .admin-thanh-tinh__search input:focus {
    outline: none;
    border-color: var(--gold);
  }

  .admin-thanh-tinh__sort {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .admin-thanh-tinh__sort label {
    color: var(--text2);
    font-size: 12px;
    font-weight: 500;
  }

  .admin-thanh-tinh__sort select {
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

  .admin-thanh-tinh__table-wrap {
    overflow-x: auto;
  }

  .admin-thanh-tinh__table-wrap table {
    width: 100%;
    border-collapse: collapse;
  }

  .admin-thanh-tinh__table-wrap th {
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

  .admin-thanh-tinh__table-wrap td {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border2);
    color: var(--text2);
    font-size: 12px;
    vertical-align: middle;
  }

  .admin-thanh-tinh__table-wrap tbody tr:last-child td {
    border-bottom: 0;
  }

  .admin-thanh-tinh__table-wrap tbody tr:hover {
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

  .tag-anon {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--text2) 15%, transparent);
    color: var(--text2);
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

  .streak-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 12px;
    background: var(--bg2);
    color: var(--text2);
    font-weight: 500;
  }

  .streak-badge.has-streak {
    background: color-mix(in srgb, #f59e0b 15%, transparent);
    color: #d97706;
    font-weight: 600;
  }

  .resisted-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--text);
  }

  .resisted-pill strong {
    color: #059669;
  }

  .admin-thanh-tinh__empty {
    display: grid;
    place-items: center;
    min-height: 140px;
    padding: 24px;
    color: var(--text2);
    font-size: 12px;
    text-align: center;
  }

  @media (max-width: 768px) {
    .admin-thanh-tinh__header {
      flex-direction: column;
      align-items: flex-start;
    }

    .admin-thanh-tinh__summary {
      grid-template-columns: 1fr;
    }

    .summary-card {
      border-right: 0;
      border-bottom: 1px solid var(--border2);
    }

    .summary-card:last-child {
      border-bottom: 0;
    }

    .admin-thanh-tinh__controls {
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
    }

    .admin-thanh-tinh__search input {
      width: 100%;
    }

    .admin-thanh-tinh__sort {
      justify-content: space-between;
    }

    .admin-thanh-tinh__sort select {
      flex: 1;
    }

    .admin-thanh-tinh__table-wrap thead {
      display: none;
    }

    .admin-thanh-tinh__table-wrap :is(tbody, tr, td) {
      display: block;
      width: 100%;
      box-sizing: border-box;
    }

    .admin-thanh-tinh__table-wrap tr {
      display: grid;
      gap: 8px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--border2);
    }

    .admin-thanh-tinh__table-wrap tr:last-child {
      border-bottom: 0;
    }

    .admin-thanh-tinh__table-wrap td {
      display: grid;
      grid-template-columns: 110px minmax(0, 1fr);
      padding: 0;
      border: 0;
      align-items: center;
    }

    .admin-thanh-tinh__table-wrap td::before {
      color: var(--text2);
      content: attr(data-label);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.4px;
      text-transform: uppercase;
    }
  }
</style>
