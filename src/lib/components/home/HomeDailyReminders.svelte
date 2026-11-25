<script lang="ts">
  import { onMount } from 'svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getSessionContext } from '$lib/stores/session.svelte';
  import { formatVietnameseFullName } from '$lib/utils/vietnamese-name';
  import {
    solarToLunar,
  } from '$lib/components/lunar/lunar-calendar';
  import { getLunarEvent } from '$lib/components/lunar/lunar-events';
  import {
    loadPersonalLunarEvents,
    getPersonalEventsForDate,
    getPersonalEventTypeIcon,
    getPersonalEventTypeName,
    formatPersonalEventDateText,
    type PersonalLunarEvent,
  } from '$lib/browser/personal-lunar-events';
  import ThapTraiBannerMessage from '$lib/components/lunar/ThapTraiBannerMessage.svelte';
  import PersonalEventsModal from '$lib/components/practice/reminder/PersonalEventsModal.svelte';
  import { triggerHaptic } from '$lib/utils/haptics';
  import { getVietnamNow } from '$lib/components/lunar/lunar-week';
  import { sameCalendarDay } from '$lib/browser/calendar-day-rollover';

  interface Props {
    selectedDate?: Date;
  }

  let { selectedDate = new Date() }: Props = $props();

  const localeStore = getLocaleContext();
  const sessionStore = (() => {
    try { return getSessionContext(); }
    catch { return null; }
  })();
  const isEn = $derived(localeStore.current === 'en');
  const ownerDisplayName = $derived.by(() => {
    const state = sessionStore?.value;
    if (!state?.authenticated || !state.user) return null;
    const dn = state.user.displayName?.trim();
    if (dn && !dn.includes('@')) return formatVietnameseFullName(dn) || dn;
    const email = state.user.email?.trim() || '';
    if (email.includes('@')) {
      const formatted = email
        .split('@')[0]
        .replace(/[._-]+/g, ' ')
        .trim();
      if (formatted) return formatVietnameseFullName(formatted) || formatted;
    }
    return null;
  });
  const selectedIsToday = $derived(sameCalendarDay(selectedDate, getVietnamNow()));

  let personalModalOpen = $state(false);
  let allPersonalEvents = $state<PersonalLunarEvent[]>(loadPersonalLunarEvents());

  onMount(() => {
    const handleEventsChanged = () => {
      allPersonalEvents = loadPersonalLunarEvents();
    };
    window.addEventListener('quangtu:personal-events-changed', handleEventsChanged);
    return () => {
      window.removeEventListener('quangtu:personal-events-changed', handleEventsChanged);
    };
  });

  const lunar = $derived(
    solarToLunar(selectedDate.getDate(), selectedDate.getMonth() + 1, selectedDate.getFullYear())
  );
  const eventInfo = $derived(getLunarEvent(selectedDate, localeStore.current));
  const isSpecialDay = $derived(Boolean(eventInfo?.isThapTrai || eventInfo?.viaName));
  const todayPersonalEvents = $derived(
    getPersonalEventsForDate(selectedDate, allPersonalEvents)
  );

  function openModal(): void {
    triggerHaptic('light');
    personalModalOpen = true;
  }
</script>

<section class="home-daily-reminders" aria-label={selectedIsToday ? (isEn ? 'Daily Practice Reminders' : 'Nhắc nhở hành trì hôm nay') : localeStore.t.calendar.selectedRemindersAria}>
  <!-- Section Header Cân Đối 1 Hàng -->
  <div class="reminders-header">
    <div class="reminders-title-box">
      <span class="reminders-icon" aria-hidden="true">📅</span>
      <h2 class="reminders-heading">
        {isEn ? 'Daily Reminders' : 'Lịch Nhắc Nhở Trong Ngày'}
      </h2>
    </div>
  </div>

  <div class="reminders-content">
    <!-- 1. Thập Trai / Vía Phật / Lời dạy Thọ Khang Bảo Giám -->
    <div class="thaptrai-card" class:thaptrai-card--special={isSpecialDay}>
      <div class="thaptrai-lunar-pill" aria-hidden="true">
        <span class="thaptrai-lunar-pill__day">{lunar.day}/{lunar.month}</span>
        <span class="thaptrai-lunar-pill__sub">{isEn ? 'Lunar' : 'Âm lịch'}</span>
      </div>
      <div class="thaptrai-body">
        <ThapTraiBannerMessage {eventInfo} {lunar} {selectedDate} />
      </div>
    </div>

    <!-- 2. Khung Hiển Thị Toàn Bộ Danh Sách Ngày Lễ Cá Nhân Dưới Thập Trai -->
    <div class="personal-reminder-card" class:has-event={todayPersonalEvents.length > 0}>
      <div class="personal-card-header">
        <div class="personal-card-title-wrap">
          <span class="personal-card-icon" aria-hidden="true">🕯️</span>
          <h3 class="personal-card-heading">
            {#if isEn}
              {ownerDisplayName ? `${ownerDisplayName}’s` : 'Your'}{' '}
              <span class="personal-title-end">Holidays
              {#if allPersonalEvents.length > 0}
                <span class="personal-count-pill" class:is-today={todayPersonalEvents.length > 0}>{allPersonalEvents.length}</span>
              {/if}
              </span>
            {:else}
              Ngày Lễ của{' '}
              <span class="personal-title-end">{ownerDisplayName ?? 'bạn'}
              {#if allPersonalEvents.length > 0}
                <span class="personal-count-pill" class:is-today={todayPersonalEvents.length > 0}>{allPersonalEvents.length}</span>
              {/if}
              </span>
            {/if}
          </h3>
        </div>
        {#if allPersonalEvents.length > 0}
          <button
            type="button"
            class="personal-add-more-btn"
            onclick={openModal}
            aria-label={isEn ? 'Add Personal Anniversary' : 'Thêm ngày lễ cá nhân'}
          >
            <span aria-hidden="true">+</span>
            <span>{isEn ? 'Add' : 'Thêm'}</span>
          </button>
        {/if}
      </div>

      {#if allPersonalEvents.length > 0}
        <ul class="personal-full-list" role="list">
          {#each allPersonalEvents as item (item.id)}
            {@const isToday = todayPersonalEvents.some((t) => t.id === item.id)}
            <li class="personal-list-item" class:personal-item--today={isToday}>
              <div class="personal-item-left">
                <span class="personal-item-badge-icon" aria-hidden="true" title={getPersonalEventTypeName(item.type, isEn)}>
                  {getPersonalEventTypeIcon(item.type)}
                </span>
                <div class="personal-item-info">
                  <div class="personal-item-title-row">
                    <strong class="personal-item-title">{item.title.trim() || getPersonalEventTypeName(item.type, isEn)}</strong>
                    {#if isToday}
                      <span class="personal-today-tag">
                        {selectedIsToday ? (isEn ? 'Today ✨' : 'Hôm nay ✨') : localeStore.t.calendar.selectedDateTag}
                      </span>
                    {/if}
                    {#if item.frequency === 'monthly'}
                      <span class="personal-freq-tag">
                        {isEn ? 'Monthly' : 'Hàng tháng'}
                      </span>
                    {/if}
                  </div>
                  <div class="personal-item-date">
                    {formatPersonalEventDateText(item, isEn).replace(/^🗓️\s*/u, '')}
                  </div>
                  {#if item.note}
                    <p class="personal-item-note">{item.note}</p>
                  {/if}
                </div>
              </div>
            </li>
          {/each}
        </ul>
      {:else}
        <div class="personal-card-empty">
          <p class="personal-empty-text">
            {isEn
              ? 'No personal anniversaries added yet. Add family memorials, refuge or practice vows to be reminded automatically!'
              : 'Chưa có ngày kỷ niệm cá nhân nào. Hãy thêm ngày giỗ gia tiên, ngày quy y, phát nguyện... để được nhắc nhở chu đáo!'}
          </p>
          <button type="button" class="personal-add-first-btn" onclick={openModal}>
            <span aria-hidden="true">+</span> {isEn ? 'Add Personal Anniversary' : 'Thêm ngày lễ cá nhân'}
          </button>
        </div>
      {/if}
    </div>
  </div>
</section>

<!-- Modal Quản Lý Ngày Lễ Cá Nhân -->
<PersonalEventsModal
  open={personalModalOpen}
  onClose={() => personalModalOpen = false}
/>

<style>
  .home-daily-reminders {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
  }

  .reminders-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 4px;
  }

  .reminders-title-box {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .reminders-icon {
    font-size: 16px;
    line-height: 1;
    flex-shrink: 0;
  }

  .reminders-heading {
    margin: 0;
    font-size: var(--font-size-section-title);
    font-weight: 800;
    color: var(--text);
    letter-spacing: -0.01em;
    white-space: normal;
    line-height: 1.4;
  }

  .reminders-content {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
  }

  /* Khung Hiển Thị Ngày Lễ Cá Nhân Dưới Thập Trai */
  .personal-reminder-card {
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-card);
    background: var(--card);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-sm);
    overflow: hidden;
    transition: border-color var(--motion-fast) var(--ease-standard), box-shadow var(--motion-fast) var(--ease-standard), background var(--motion-fast) var(--ease-standard);
  }

  .personal-reminder-card.has-event {
    background: color-mix(in srgb, var(--gold) 6%, var(--card));
    border-color: color-mix(in srgb, var(--gold) 50%, var(--border));
    box-shadow: var(--shadow);
  }

  .personal-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 12px 10px 14px;
    border-bottom: 1px solid var(--border2);
  }

  .personal-card-title-wrap {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }

  .personal-card-icon {
    font-size: 16px;
    line-height: 1;
    flex-shrink: 0;
  }

  .personal-card-heading {
    margin: 0;
    font-size: var(--font-size-card-title);
    font-weight: 700;
    color: var(--text);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }

  .personal-title-end {
    white-space: nowrap;
  }

  .personal-count-pill {
    display: inline-grid;
    place-items: center;
    min-width: 20px;
    height: 20px;
    margin-left: 6px;
    padding: 0 6px;
    border: 1.5px solid var(--card);
    border-radius: 999px;
    background: #ff3b30;
    color: #fff;
    font-size: var(--font-size-meta);
    font-weight: 700;
    line-height: 1;
    vertical-align: middle;
    font-variant-numeric: tabular-nums;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.22);
    flex: 0 0 auto;
  }

  :global([data-theme='dark']) .personal-count-pill,
  :global(.dark) .personal-count-pill {
    background: #ff453a;
  }

  .personal-count-pill.is-today {
    background: #ff3b30;
    border-color: var(--card);
    color: #fff;
  }

  :global([data-theme='dark']) .personal-count-pill.is-today,
  :global(.dark) .personal-count-pill.is-today {
    background: #ff453a;
  }

  .personal-full-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }

  .personal-list-item {
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr);
    align-items: start;
    gap: 10px;
    padding: 13px 14px;
    background: transparent;
    border-bottom: 1px solid var(--border2);
  }

  .personal-list-item:last-child {
    border-bottom: 0;
  }

  .personal-item--today {
    background: color-mix(in srgb, var(--gold) 9%, transparent);
  }

  .personal-item-left {
    display: contents;
  }

  .personal-item-badge-icon {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    margin-top: 1px;
    border-radius: 12px;
    background: var(--gold-light);
    border: 1px solid var(--gold-muted);
    font-size: 19px;
    line-height: 1;
    flex-shrink: 0;
  }

  .personal-item--today .personal-item-badge-icon {
    border-color: var(--gold);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--gold) 24%, transparent);
  }

  .personal-item-info {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .personal-item-title-row {
    min-width: 0;
    display: flex;
    align-items: center;
    flex-direction: row;
    gap: 6px;
    flex-wrap: wrap;
  }

  .personal-item-title {
    font-size: var(--font-size-card-title);
    line-height: 1.4;
    overflow-wrap: anywhere;
    font-weight: 700;
    color: var(--text);
  }

  .personal-freq-tag {
    display: inline-flex;
    align-items: center;
    font-size: var(--font-size-meta);
    font-weight: 700;
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--practice-meditation-tint);
    color: var(--practice-meditation-ink);
    line-height: 1.45;
  }

  .personal-today-tag {
    display: inline-flex;
    align-items: center;
    font-size: var(--font-size-meta);
    font-weight: 700;
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--gold);
    color: var(--on-gold);
    line-height: 1.45;
  }

  .personal-item-date {
    font-size: var(--font-size-meta);
    color: var(--text2);
    line-height: 1.5;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .personal-item-note {
    margin: 2px 0 0;
    padding: 2px 0 2px 9px;
    border-left: 2px solid var(--gold);
    font-size: var(--font-size-body);
    line-height: 1.55;
    font-style: italic;
    overflow-wrap: anywhere;
    color: var(--text2);
  }

  .personal-add-more-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-width: 44px;
    min-height: 44px;
    padding: 0 16px;
    border-radius: 12px;
    background: var(--gold);
    border: 0;
    color: var(--on-gold);
    font-size: var(--font-size-body);
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    transition: opacity var(--motion-press) var(--ease-standard), transform var(--motion-press) var(--ease-standard);
  }

  .personal-add-more-btn:hover {
    opacity: 0.92;
  }

  .personal-add-more-btn:active {
    transform: scale(0.96);
  }

  .personal-add-more-btn:focus-visible,
  .personal-add-first-btn:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }

  .personal-card-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 10px;
    padding: 18px 16px 20px;
  }

  .personal-empty-text {
    margin: 0;
    max-width: 340px;
    font-size: var(--font-size-body);
    color: var(--muted);
    line-height: 1.65;
  }

  .personal-add-first-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 18px;
    min-height: 44px;
    border-radius: 12px;
    background: var(--gold);
    color: var(--on-gold);
    font-size: var(--font-size-label);
    font-weight: 700;
    border: none;
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    transition: opacity var(--motion-press) var(--ease-standard), transform var(--motion-press) var(--ease-standard);
  }

  .personal-add-first-btn:active {
    transform: scale(0.96);
  }

  /* Thập Trai Banner Card */
  .thaptrai-card {
    display: grid;
    grid-template-columns: 60px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    padding: 13px 14px;
    border-radius: var(--radius-card);
    background: var(--card);
    border: 1px solid var(--border);
    border-left: 3.5px solid var(--gold);
    box-shadow: var(--shadow-sm);
  }

  .thaptrai-card--special {
    background: color-mix(in srgb, var(--gold) 8%, var(--card));
    border-color: color-mix(in srgb, var(--gold) 40%, var(--border));
    border-left-color: var(--gold);
  }

  .thaptrai-lunar-pill {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 54px;
    padding: 6px 4px;
    border-radius: 13px;
    background: var(--gold-light);
    border: 1px solid var(--gold-muted);
    text-align: center;
  }

  .thaptrai-lunar-pill__day {
    font-size: 15px;
    font-weight: 800;
    color: var(--brown);
    line-height: 1.15;
    font-variant-numeric: tabular-nums;
  }

  .thaptrai-lunar-pill__sub {
    margin-top: 2px;
    font-size: var(--font-size-meta);
    font-weight: 700;
    color: var(--muted);
    letter-spacing: 0.02em;
  }

  .thaptrai-body {
    min-width: 0;
    color: var(--text);
  }

  @media (prefers-reduced-motion: reduce) {
    .personal-reminder-card,
    .personal-add-more-btn,
    .personal-add-first-btn {
      transition: none;
    }
  }

  @media (max-width: 480px) {
    .reminders-heading {
      font-size: var(--font-size-section-title);
    }
  }
</style>
