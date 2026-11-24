<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { isNativeApp } from '$lib/browser/native-platform';
  import {
    evaluateNotificationPromptRequirement,
    shouldPresentNotificationPromptDialog,
    type NotificationPermissionMissing,
  } from '$lib/browser/startup-notification-prompt';
  import type { PageSessionDTO } from '$lib/server/auth/types';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  interface Props {
    session?: PageSessionDTO | { authenticated: boolean };
    blocked?: boolean;
    onActiveChange?: (active: boolean) => void;
  }

  let { session, blocked = false, onActiveChange }: Props = $props();

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t.notifications);

  let visible = $state(false);
  let status = $state<'prompt' | 'success' | 'denied'>('prompt');
  let loading = $state(false);
  let dismissedInSession = $state(false);
  let missingPermission = $state<NotificationPermissionMissing>('none');
  let wasBlocked = false;
  let readyToPrompt = false;

  const isAuthenticated = $derived(Boolean(session?.authenticated));

  function setVisible(next: boolean): void {
    visible = next;
    onActiveChange?.(next);
  }

  async function checkAndPrompt(): Promise<void> {
    if (!browser || blocked || dismissedInSession || visible) return;
    if (window.location.pathname.startsWith('/admin')) {
      onActiveChange?.(false);
      return;
    }
    const { getUnifiedNotificationPermission, getExactReminderPermission } = await import(
      '$lib/browser/native-notifications'
    );
    const permission = await getUnifiedNotificationPermission();
    const exactPermission = permission === 'granted' ? await getExactReminderPermission() : 'unsupported';
    if (visible) return;
    const evaluation = evaluateNotificationPromptRequirement(permission, exactPermission);
    missingPermission = evaluation.missing;

    const hasBlockingOverlay = Boolean(document.querySelector(
      'dialog[open], .reader-modal, .tt-preview, .tt-practice, .pdf-shell, .notification-popover',
    ));
    if (
      !shouldPresentNotificationPromptDialog({
        blocked,
        dismissedInSession,
        isAdminRoute: window.location.pathname.startsWith('/admin'),
        hasBlockingOverlay,
        missing: evaluation.missing,
      })
    ) {
      onActiveChange?.(false);
      return;
    }
    status = 'prompt';
    setVisible(true);
  }

  $effect(() => {
    if (wasBlocked && !blocked && browser && readyToPrompt) {
      void checkAndPrompt();
    }
    wasBlocked = blocked;
  });

  async function requestPermission(): Promise<void> {
    if (!browser) return;

    loading = true;
    try {
      const {
        getExactReminderPermission,
        requestExactReminderPermission,
        showUnifiedNotification,
      } = await import('$lib/browser/native-notifications');

      if (missingPermission === 'exact_alarm') {
        await requestExactReminderPermission();
        const updatedExact = await getExactReminderPermission();
        if (updatedExact !== 'denied') {
          status = 'success';
          setTimeout(() => {
            setVisible(false);
          }, 2000);
        } else {
          status = 'denied';
        }
        return;
      }

      // Xin cả 2 mức quyền: quyền thông báo hệ thống + quyền nhắc nhở đúng giờ (exact alarm) trong 1 lần bấm
      const { requestStartupNotificationPermission } = await import(
        '$lib/browser/startup-notification-prompt'
      );
      const result = await requestStartupNotificationPermission();
      if (result === 'granted') {
        status = 'success';

        const title = 'Tu Tập Phật Pháp';
        await showUnifiedNotification(title, t.promptSuccessDesc).catch(() => {
          // Notification is best-effort
        });

        setTimeout(() => {
          setVisible(false);
        }, 2000);
      } else {
        // Denied or dismissed
        status = 'denied';
      }
    } catch {
      status = 'denied';
    } finally {
      loading = false;
    }
  }

  function handleDismiss(): void {
    dismissedInSession = true;
    setVisible(false);
  }

  onMount(() => {
    if (!browser) return;

    let disposed = false;
    let appListenerHandle: { remove: () => Promise<void> } | null = null;

    // Gentle delay after page mount (1.8s) so user sees the page first
    const timer = setTimeout(() => {
      readyToPrompt = true;
      void checkAndPrompt();
    }, 1800);

    const handleResumeCheck = () => {
      if (disposed || !isNativeApp()) return;
      readyToPrompt = true;
      dismissedInSession = false;
      void checkAndPrompt();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleResumeCheck();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    if (isNativeApp()) {
      void import('@capacitor/app')
        .then(async ({ App }) => {
          const listener = await App.addListener('appStateChange', ({ isActive }) => {
            if (isActive) handleResumeCheck();
          });
          if (disposed) {
            await listener.remove();
          } else {
            appListenerHandle = listener;
          }
        })
        .catch(() => {
          // Fallback vẫn có visibilitychange ở trên
        });
    }

    return () => {
      disposed = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (appListenerHandle) {
        void appListenerHandle.remove().catch(() => {});
      }
    };
  });
</script>

{#if visible}
  <dialog
    use:modalDialog
    class="notification-modal-card"
    data-dialog-glass
    aria-label={t.promptAria}
    oncancel={(event) => { event.preventDefault(); handleDismiss(); }}
    onclick={(event) => { if (event.currentTarget === event.target) handleDismiss(); }}
  >
    {#if status === 'prompt'}
      <div class="card-header">
        <div class="icon-bubble" aria-hidden="true">🔔</div>
        <div class="header-text">
          <strong class="title">{t.promptTitle}</strong>
          <span class="subtitle">{t.promptSubtitle}</span>
        </div>
        <button
          type="button"
          class="btn-close"
          aria-label={localeStore.current === 'en' ? 'Close' : 'Đóng'}
          onclick={handleDismiss}
        >×</button>
      </div>

      <p class="body-text">
        {t.promptDesc}
      </p>
      <p class="settings-note">
        {localeStore.current === 'en'
          ? '(You can always change this in App Settings)'
          : '(Bạn luôn có thể thay đổi trong phần Cài đặt ứng dụng)'}
      </p>

      <div class="actions dialog-actions-balanced">
        <button
          type="button"
          class="btn-primary"
          disabled={loading}
          onclick={requestPermission}
        >
          {loading ? t.promptEnabling : t.promptAllow}
        </button>
        <button
          type="button"
          class="btn-secondary"
          disabled={loading}
          onclick={handleDismiss}
        >
          {t.promptLater}
        </button>
      </div>
    {:else if status === 'success'}
      <div class="feedback-card success">
        <div class="feedback-icon">🙏</div>
        <div class="feedback-content">
          <strong>{t.promptSuccessTitle}</strong>
          <p>{t.promptSuccessDesc}</p>
        </div>
      </div>
    {:else}
      <div class="feedback-card denied">
        <div class="feedback-icon">⚠️</div>
        <div class="feedback-content">
          <strong>{t.promptDeniedTitle}</strong>
          <p>
            {t.promptDeniedDesc}
          </p>
          <button type="button" class="btn-ack" onclick={handleDismiss}>{t.promptUnderstood}</button>
        </div>
      </div>
    {/if}
  </dialog>
{/if}

<style>
  .notification-modal-card {
    position: fixed;
    inset: 0;
    margin: auto;
    width: min(var(--dialog-compact-width, 400px), calc(100vw - var(--space-page, 20px) * 2));
    max-height: calc(100dvh - var(--space-page, 20px) * 2 - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
    overflow: auto;
    padding: var(--space-page, 20px);
    box-sizing: border-box;
    border-radius: var(--radius-card, 18px);
    border: 1px solid var(--border);
    background: color-mix(in srgb, var(--card) 96%, transparent);
    box-shadow: var(--shadow-xl);
    color: var(--text);
    font-family: var(--font-app);
    animation: slideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .notification-modal-card::backdrop {
    background: rgba(18, 12, 6, 0.56);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(24px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
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

  .title {
    font-size: calc(var(--font-size-card-title) * 1.06);
    font-weight: 800;
    color: var(--text);
    line-height: 1.3;
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
    font-size: var(--font-size-body);
    font-weight: 500;
    line-height: 1.55;
    color: var(--text);
    margin: 0 0 8px 0;
  }

  .settings-note {
    font-size: var(--font-size-meta);
    line-height: 1.45;
    color: var(--text2);
    font-style: italic;
    margin: 0 0 16px 0;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .btn-primary {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 44px;
    padding: 10px 14px;
    border: none;
    border-radius: var(--radius-control);
    background: var(--gold);
    color: var(--on-gold);
    font-family: inherit;
    font-size: var(--font-size-label);
    font-weight: 700;
    line-height: 1.3;
    text-align: center;
    cursor: pointer;
    box-shadow: var(--shadow-sm);
    transition: transform 0.15s ease, opacity 0.15s ease;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .btn-primary:active:not(:disabled) {
    transform: translateY(0);
  }

  .btn-primary:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .btn-secondary {
    flex: 0 1 auto;
    min-height: 44px;
    padding: 10px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--bg2);
    color: var(--text2);
    font-family: inherit;
    font-size: var(--font-size-label);
    font-weight: 600;
    line-height: 1.3;
    text-align: center;
    cursor: pointer;
    transition: background 0.15s ease;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--hover);
  }

  .feedback-card {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .feedback-icon {
    font-size: 24px;
    line-height: 1;
    flex-shrink: 0;
  }

  .feedback-content {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    line-height: 1.45;
  }

  .feedback-content strong {
    display: block;
    font-size: var(--font-size-body);
    color: var(--text);
    margin-bottom: 4px;
  }

  .feedback-content p {
    margin: 0;
    color: var(--text2);
  }

  .btn-ack {
    margin-top: 10px;
    min-height: 44px;
    padding: 0 16px;
    border: none;
    border-radius: var(--radius-control);
    background: var(--gold);
    color: var(--on-gold);
    font-family: inherit;
    font-size: var(--font-size-label);
    font-weight: 700;
    cursor: pointer;
  }

  @media (prefers-reduced-motion: reduce) {
    .notification-modal-card {
      animation: none;
    }
  }
</style>
