<script lang="ts">
  import { onMount } from 'svelte';
  import { appDialogState } from '$lib/browser/app-dialog';
  import { openNativeAppStore } from '$lib/browser/external-links';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { watchNativeAppUpdates } from '$lib/browser/native-app-update';
  import { shouldPresentNativeUpdateDialog } from '$lib/browser/startup-notification-prompt';
  import { STORE_URLS, type StoreRelease } from '$lib/contracts/native-app-update';
  import { nativeAppUpdateText } from '$lib/i18n/native-app-update';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  let {
    home,
    startupReady = true,
    blocked = false,
    onPermissionBlockChange,
  }: {
    home: boolean;
    startupReady?: boolean;
    blocked?: boolean;
    onPermissionBlockChange?: (blocked: boolean) => void;
  } = $props();
  const locale = getLocaleContext();
  const text = $derived(nativeAppUpdateText[locale.current]);
  let release = $state.raw<StoreRelease | null>(null);
  let checking = $state(false);
  let openingStore = $state(false);
  let storeFailed = $state(false);
  let dismissedInOpening = $state(false);
  const dialogVisible = $derived(
    shouldPresentNativeUpdateDialog({
      home,
      hasRelease: Boolean(release),
      appDialogOpen: Boolean($appDialogState),
      dismissedInOpening,
      blocked: blocked || !startupReady,
    }),
  );

  $effect(() => {
    onPermissionBlockChange?.((home && checking) || dialogVisible);
  });

  function dismissCurrentOpening() {
    dismissedInOpening = true;
    openingStore = false;
    storeFailed = false;
  }

  function setRelease(value: StoreRelease | null) {
    release = value;
    openingStore = false;
    storeFailed = false;
    dismissedInOpening = false;
  }

  onMount(() => {
    const stop = watchNativeAppUpdates(setRelease, value => {
      checking = value;
      if (value && home) onPermissionBlockChange?.(true);
    });
    return () => {
      stop();
      onPermissionBlockChange?.(false);
    };
  });

  async function update(current: StoreRelease) {
    if (openingStore) return;
    openingStore = true;
    storeFailed = false;
    try {
      await openNativeAppStore(current.storeUrl);
      if (release === current) dismissCurrentOpening();
    } catch {
      if (release === current) {
        openingStore = false;
        storeFailed = true;
      }
    }
  }
</script>

{#if dialogVisible && release}
  {@const available = release}
  <dialog
    use:modalDialog
    class="native-update-dialog"
    data-native-update-prompt
    aria-labelledby="native-update-title"
    aria-describedby="native-update-message"
    oncancel={(event) => { event.preventDefault(); dismissCurrentOpening(); }}
    onclick={(event) => { if (event.currentTarget === event.target) dismissCurrentOpening(); }}
    onkeydown={(event) => event.stopPropagation()}
  >
    <div class="update-header">
      <div class="icon-bubble" aria-hidden="true">🪷</div>
      <div class="header-text">
        <h2 id="native-update-title">{text.title(available.version)}</h2>
        <span class="subtitle">{text.subtitle}</span>
      </div>
      <button
        type="button"
        class="btn-close"
        aria-label={locale.current === 'en' ? 'Close' : 'Đóng'}
        onclick={dismissCurrentOpening}
      >×</button>
    </div>
    <p id="native-update-message" class="body-text">{text.message}</p>
    {#if storeFailed}
      <p role="alert" class="error-text">{text.storeFailed(available.storeUrl === STORE_URLS.ios ? 'App Store' : 'Google Play')}</p>
    {/if}
    <div class="actions dialog-actions-balanced">
      <button type="button" class="primary" disabled={openingStore} onclick={() => update(available)}>{text.update}</button>
      <button type="button" class="secondary" data-modal-focus onclick={dismissCurrentOpening}>{text.later}</button>
    </div>
  </dialog>
{/if}

<style>
  .native-update-dialog {
    position: fixed;
    inset: 0;
    margin: auto;
    box-sizing: border-box;
    width: min(var(--dialog-compact-width, 400px), calc(100vw - var(--space-page, 20px) * 2));
    max-height: calc(100dvh - var(--space-page, 20px) * 2 - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
    overflow: auto;
    padding: var(--space-page, 20px);
    border: 1px solid var(--border);
    border-radius: var(--radius-card, 18px);
    background: color-mix(in srgb, var(--card) 96%, transparent);
    color: var(--text);
    box-shadow: var(--shadow-xl);
    font-family: var(--font-app);
    animation: updateSlideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .native-update-dialog::backdrop {
    background: rgba(18, 12, 6, 0.56);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }
  @keyframes updateSlideUp {
    from { opacity: 0; transform: translateY(20px) scale(0.96); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .update-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
  }
  .icon-bubble {
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    background: color-mix(in srgb, var(--gold, #c8963e) 22%, transparent);
    font-size: 20px;
    flex-shrink: 0;
  }
  .header-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  h2 {
    margin: 0;
    font-size: calc(var(--font-size-card-title) * 1.06);
    font-weight: 800;
    color: var(--text);
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .subtitle {
    font-size: var(--font-size-meta);
    color: var(--brown);
    font-weight: 700;
  }
  :global([data-theme='dark']) .subtitle {
    color: var(--gold2);
  }
  .btn-close {
    background: transparent;
    border: none;
    font-size: 20px;
    line-height: 1;
    color: var(--muted);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    transition: background 0.15s ease, color 0.15s ease;
  }
  .btn-close:hover {
    background: var(--hover);
    color: var(--text);
  }
  .body-text {
    margin: 0 0 16px 0;
    color: var(--text);
    font-size: var(--font-size-body);
    font-weight: 500;
    line-height: 1.55;
    overflow-wrap: anywhere;
  }
  .error-text {
    margin: 0 0 12px 0;
    color: var(--danger-text);
    font-size: var(--font-size-meta);
    font-weight: 600;
    line-height: 1.45;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .actions button {
    min-width: var(--touch-target-size);
    min-height: var(--touch-target-size);
    padding: 0 14px;
    border-radius: var(--radius-control);
    font-family: inherit;
    font-size: var(--font-size-label);
    cursor: pointer;
    overflow-wrap: anywhere;
  }
  .secondary {
    border: 1px solid var(--border);
    background: var(--bg2);
    color: var(--text2);
    font-weight: 600;
  }
  .primary {
    flex: 1;
    border: none;
    background: var(--gold);
    color: var(--on-gold);
    font-weight: 700;
    box-shadow: var(--shadow-sm);
  }
  .primary:disabled { opacity: 0.7; cursor: not-allowed; }
  .actions button:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
  .primary:focus-visible { outline-color: var(--on-gold); }
  @media (prefers-reduced-motion: reduce) {
    .native-update-dialog { animation: none; }
  }
</style>
