<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import type { PageSessionDTO } from '$lib/server/auth/types';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  interface Props {
    session: PageSessionDTO;
    currentPath: string;
    blocked?: boolean;
  }

  const LEGACY_STORAGE_KEY = 'tutam_guest_notice_dismissed_date';

  let { session, currentPath, blocked = false }: Props = $props();
  let dismissedManually = $state(false);

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t.notifications);

  const isTargetPage = $derived(
    currentPath === '/' ||
    currentPath.startsWith('/phap-thoai')
  );

  const shouldShow = $derived(
    browser &&
    !blocked &&
    !session.authenticated &&
    isTargetPage &&
    !dismissedManually
  );

  function keepLastWordsTogether(value: string): string {
    return value.replace(/\s+(\S+\s*)$/u, '\u00a0$1');
  }

  function handleLogin(): void {
    dismissedManually = true;
    void goto('/ca-nhan?tab=account');
  }

  function handleDismiss(): void {
    dismissedManually = true;
  }

  onMount(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // Ignore localStorage errors
    }
  });
</script>

{#if shouldShow}
  <aside
    class="guest-notice-banner"
    role="region"
    aria-label={t.guestAria}
    aria-live="polite"
    data-guest-notice-banner
  >
    <div class="icon-wrap" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M7 18a5 5 0 0 1-1-9.9A6.5 6.5 0 0 1 18.5 7 5.5 5.5 0 0 1 18 18" />
        <path d="m9 17 2 2 4-4" />
      </svg>
    </div>
    <div class="content-text">
      <strong class="title">{keepLastWordsTogether(t.guestTitle || 'Đăng nhập để lưu tiến độ')}</strong>
      <p class="description">
        {keepLastWordsTogether(t.guestDesc || 'Đồng bộ tiến độ đọc sách, nghe pháp và tu tập với tài khoản của bạn.')}
      </p>
    </div>

    <button
      type="button"
      class="btn-close"
      aria-label={t.guestDismiss}
      title={t.guestDismiss}
      onclick={handleDismiss}
    >
      ×
    </button>
    <div class="actions">
      <button
        type="button"
        class="btn-login"
        onclick={handleLogin}
      >
        {t.guestLogin || 'Đăng nhập ngay'}
      </button>
      <button
        type="button"
        class="btn-later"
        onclick={handleDismiss}
      >
        {t.guestLater || 'Để sau'}
      </button>
    </div>
  </aside>
{/if}

<style>
  .guest-notice-banner {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) auto 44px;
    grid-template-areas: 'icon copy actions close';
    align-items: center;
    gap: calc(var(--notice-gap) * .75) var(--notice-gap);
    width: 100%;
    box-sizing: border-box;
    padding: var(--notice-gap) var(--notice-padding);
    border: 1px solid var(--notice-edge);
    border-radius: var(--radius-card);
    background: linear-gradient(145deg, var(--notice-chip), transparent 65%), var(--notice-glass);
    -webkit-backdrop-filter: var(--notice-filter);
    backdrop-filter: var(--notice-filter);
    box-shadow: var(--notice-shadow), inset 0 1px var(--notice-edge);
    color: var(--notice-ink);
    font-family: var(--font-app);
  }
  .icon-wrap, .btn-close {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: var(--radius-control);
  }
  .icon-wrap { grid-area: icon; background: var(--notice-chip); border: 1px solid var(--notice-edge); }
  .content-text { grid-area: copy; min-width: 0; }
  .title { display: block; font-size: var(--font-size-card-title); line-height: 1.3; text-wrap: balance; }
  .description { margin: calc(var(--notice-gap) * .25) 0 0; font-size: var(--font-size-body); line-height: 1.4; color: var(--notice-copy); text-wrap: balance; }
  .actions { grid-area: actions; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--notice-gap); }
  .btn-login, .btn-later {
    min-height: 44px;
    padding: 8px;
    border: 1px solid var(--notice-line);
    border-radius: var(--radius-control);
    background: var(--notice-chip);
    color: inherit;
    font: 700 var(--font-size-body)/1.35 var(--font-app);
    text-wrap: balance;
    cursor: pointer;
  }
  .btn-login { background: var(--notice-primary); color: var(--notice-on-primary); border-color: transparent; }
  .btn-close { grid-area: close; padding: 0; border: 0; background: transparent; color: inherit; font-size: 23px; cursor: pointer; }
  button:focus-visible { outline: 2px solid var(--notice-ink); outline-offset: 2px; }
  @media (max-width: 719px) {
    .guest-notice-banner {
      grid-template-columns: 44px minmax(0, 1fr) 44px;
      grid-template-areas: '. icon close' 'copy copy copy' 'actions actions actions';
    }
    .icon-wrap { justify-self: center; }
    .content-text { text-align: center; }
    .description { max-inline-size: 32ch; margin-inline: auto; }
  }
</style>
