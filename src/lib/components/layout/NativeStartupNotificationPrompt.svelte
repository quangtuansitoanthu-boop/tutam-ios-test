<script lang="ts">
  import { onMount } from 'svelte';
  import { appDialogState } from '$lib/browser/app-dialog';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import {
    dismissStartupNotificationPrompt,
    requestStartupNotificationPermission,
    shouldShowStartupNotificationPrompt,
  } from '$lib/browser/startup-notification-prompt';
  import { startupNotificationPromptText } from '$lib/i18n/startup-notification-prompt';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  let { home, blocked = false }: { home: boolean; blocked?: boolean } = $props();

  const locale = getLocaleContext();
  const text = $derived(startupNotificationPromptText[locale.current] ?? startupNotificationPromptText.vi);

  let visible = $state(false);
  let requesting = $state(false);

  function handleLater() {
    dismissStartupNotificationPrompt();
    visible = false;
  }

  async function handleAllow() {
    if (requesting) return;
    requesting = true;
    try {
      await requestStartupNotificationPermission(undefined, locale.current);
    } finally {
      requesting = false;
      visible = false;
    }
  }

  onMount(() => {
    // Trì hoãn nhẹ 1.8s sau khi mount trang chủ để người dùng thấy giao diện trước
    const timer = setTimeout(async () => {
      if (await shouldShowStartupNotificationPrompt()) {
        visible = true;
      }
    }, 1800);
    return () => clearTimeout(timer);
  });
</script>

{#if home && visible && !blocked && !$appDialogState}
  <dialog
    use:modalDialog
    data-native-notification-prompt
    data-dialog-glass
    aria-labelledby="native-notification-title"
    aria-describedby="native-notification-message"
    oncancel={(event) => { event.preventDefault(); handleLater(); }}
    onkeydown={(event) => event.stopPropagation()}
  >
    <div class="prompt-header">
      <span class="prompt-bell-icon" aria-hidden="true">🔔</span>
      <h2 id="native-notification-title">{text.title}</h2>
    </div>
    <p id="native-notification-message" class="prompt-message">{text.message}</p>
    <div class="prompt-hint-box">
      <span class="prompt-hint-icon" aria-hidden="true">ℹ️</span>
      <p class="prompt-hint-text">{text.hint}</p>
    </div>
    <div class="actions">
      <button type="button" class="btn-later" data-modal-focus onclick={handleLater}>{text.later}</button>
      <button type="button" class="btn-allow" disabled={requesting} onclick={handleAllow}>
        {requesting ? text.enabling : text.enable}
      </button>
    </div>
  </dialog>
{/if}

<style>
  dialog {
    box-sizing: border-box;
    width: min(calc(var(--dialog-compact-width, 400px) * 0.88), calc(100% - var(--space-page, 20px) * 2));
    max-height: calc(100dvh - var(--space-page, 20px) * 2 - env(safe-area-inset-top) - env(safe-area-inset-bottom));
    inset-block-start: env(safe-area-inset-top);
    inset-block-end: env(safe-area-inset-bottom);
    margin: auto;
    padding: calc(var(--dialog-action-space, 16px) * 1.25);
    overflow: auto;
    border: 1px solid color-mix(in srgb, var(--gold, #c8963e) 45%, var(--border, rgba(0, 0, 0, 0.12)));
    border-radius: 20px;
    background: color-mix(in srgb, var(--card, #fff) 82%, transparent);
    backdrop-filter: blur(24px) saturate(140%);
    -webkit-backdrop-filter: blur(24px) saturate(140%);
    color: var(--text);
    box-shadow:
      0 20px 48px rgba(36, 24, 12, 0.22),
      0 0 0 1px color-mix(in srgb, var(--gold, #c8963e) 20%, transparent);
    font: inherit;
  }
  dialog::backdrop {
    background: rgba(18, 12, 6, 0.52);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }
  .prompt-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  .prompt-bell-icon {
    font-size: 22px;
    line-height: 1;
    flex-shrink: 0;
  }
  h2 {
    margin: 0;
    font-size: var(--font-size-card-title, 16px);
    font-weight: 700;
    color: var(--text);
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  .prompt-message {
    margin: 0 0 12px 0;
    color: var(--text);
    font-size: var(--font-size-body, 14px);
    line-height: 1.55;
    text-align: justify;
    text-align-last: start;
    overflow-wrap: anywhere;
  }
  .prompt-hint-box {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 0 0 18px 0;
    padding: 10px 12px;
    border-radius: var(--radius-control, 12px);
    background: color-mix(in srgb, var(--gold, #c8963e) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--gold, #c8963e) 30%, transparent);
  }
  .prompt-hint-icon {
    font-size: 14px;
    line-height: 1.4;
    flex-shrink: 0;
  }
  .prompt-hint-text {
    margin: 0;
    font-size: var(--font-size-meta, 12px);
    line-height: 1.45;
    color: var(--text2, #555);
    overflow-wrap: anywhere;
  }
  .actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  button {
    box-sizing: border-box;
    min-height: 44px;
    padding: 10px 12px;
    border-radius: var(--radius-control, 12px);
    font: inherit;
    font-size: var(--font-size-body, 14px);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    overflow-wrap: anywhere;
    transition: transform 0.15s ease, background 0.15s ease, opacity 0.15s ease;
  }
  .btn-later {
    border: 1px solid var(--border);
    background: color-mix(in srgb, var(--bg2, #f5f2eb) 80%, transparent);
    color: var(--text);
    font-weight: 550;
  }
  .btn-later:active {
    transform: scale(0.98);
    background: color-mix(in srgb, var(--bg2, #f5f2eb) 95%, transparent);
  }
  .btn-allow {
    border: 1px solid var(--gold2, #e0ad5a);
    background: var(--gold, #c8963e);
    color: var(--on-gold, #24180c);
    font-weight: 700;
    box-shadow: 0 2px 10px color-mix(in srgb, var(--gold, #c8963e) 40%, transparent);
  }
  .btn-allow:active {
    transform: scale(0.98);
    opacity: 0.92;
  }
  button:disabled {
    cursor: wait;
    opacity: 0.7;
  }
</style>
