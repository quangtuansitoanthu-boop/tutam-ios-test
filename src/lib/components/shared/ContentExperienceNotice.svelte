<script lang="ts">
  import { contentExperienceNotice, formatNoticeTimeout } from '$lib/i18n/content-experience-notice';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  let {
    contentId,
    class: className = '',
    durationSeconds = 10,
  }: { contentId: string; class?: string; durationSeconds?: number } = $props();
  const locale = getLocaleContext();
  const notice = $derived(contentExperienceNotice(contentId, locale.current));
  let remainingSeconds = $state(10);
  let dismissed = $state(false);

  $effect(() => {
    void contentId;
    const total = Math.max(1, Math.round(durationSeconds));
    remainingSeconds = total;
    dismissed = false;
    if (!notice) return;
    const interval = setInterval(() => {
      if (remainingSeconds <= 1) {
        remainingSeconds = 0;
        clearInterval(interval);
        return;
      }
      remainingSeconds -= 1;
    }, 1000);
    return () => clearInterval(interval);
  });
</script>

{#if notice && remainingSeconds > 0 && !dismissed}
  <aside class={`content-experience-notice ${className}`} aria-label={notice.title}>
    <div class="cen-head">
      <span class="cen-icon" aria-hidden="true">📖</span>
      <strong>{notice.title}:</strong>
      <div class="cen-actions">
        <small class="cen-timer">{formatNoticeTimeout(remainingSeconds, locale.current)}</small>
        <button
          type="button"
          class="cen-close"
          aria-label={locale.current === 'en' ? 'Close notice' : 'Đóng thông báo'}
          title={locale.current === 'en' ? 'Close' : 'Đóng'}
          onclick={() => { dismissed = true; }}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
    <p><em>{notice.message}</em></p>
  </aside>
{/if}

<style>
  .content-experience-notice{
    position:relative;
    margin:calc(var(--space-page) * 0.6) var(--space-page);
    padding:12px 14px;
    background:
      linear-gradient(180deg,rgba(255,255,255,.65) 0%,rgba(255,255,255,.04) 48%),
      linear-gradient(150deg,color-mix(in srgb,var(--gold-light) 92%,var(--card)) 0%,color-mix(in srgb,var(--gold-muted) 42%,var(--card)) 100%);
    border:1px solid color-mix(in srgb,var(--gold) 28%,rgba(255,255,255,.85));
    border-left:4px solid var(--gold);
    border-radius:var(--radius-card);
    box-shadow:
      inset 0 1.5px 0 rgba(255,255,255,.92),
      inset 0 -3px 0 rgba(120,84,28,.14),
      0 8px 18px -6px rgba(107,76,42,.18);
    color:var(--text2);
    font-family:var(--font-app);
    flex-shrink:0;
  }
  :global([data-theme='dark']) .content-experience-notice,
  :global(.reader-modal.bg-dark) .content-experience-notice{
    border-color:rgba(255,255,255,.14);
    border-left:4px solid var(--gold);
    background:
      linear-gradient(180deg,rgba(255,255,255,.08) 0%,rgba(255,255,255,0) 48%),
      linear-gradient(150deg,var(--bg2) 0%,var(--card) 100%);
    box-shadow:
      inset 0 1.5px 0 rgba(255,255,255,.16),
      inset 0 -3px 0 rgba(0,0,0,.48),
      0 10px 20px -6px rgba(0,0,0,.5);
  }
  .cen-head{display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:nowrap}
  .cen-icon{font-size:14px;line-height:1;flex-shrink:0}
  strong{color:var(--brown);font-size:var(--font-size-label);font-weight:700;min-width:0}
  :global([data-theme='dark']) strong,
  :global(.reader-modal.bg-dark) strong{color:var(--gold2)}
  .cen-actions{margin-inline-start:auto;display:inline-flex;align-items:center;gap:6px;flex-shrink:0}
  .cen-timer{
    padding:3px 9px;
    border-radius:999px;
    background:linear-gradient(180deg,rgba(255,255,255,.92) 0%,var(--bg2) 100%);
    border:1px solid rgba(255,255,255,.85);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.95),0 2px 5px rgba(60,40,10,.08);
    color:var(--text2);
    font-size:var(--font-size-meta);
    font-weight:600;
    line-height:1.4;
    font-variant-numeric:tabular-nums;
    white-space:nowrap;
  }
  :global([data-theme='dark']) .cen-timer,
  :global(.reader-modal.bg-dark) .cen-timer{
    border-color:rgba(255,255,255,.16);
    background:rgba(255,255,255,.09);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.14);
    color:var(--text2);
  }
  .cen-close{
    position:relative;
    display:inline-grid;
    place-items:center;
    width:28px;
    height:28px;
    padding:0;
    border-radius:999px;
    border:1px solid rgba(255,255,255,.86);
    background:linear-gradient(180deg,rgba(255,255,255,.95) 0%,var(--gold-muted) 100%);
    box-shadow:inset 0 1px 0 #fff,inset 0 -1.5px 0 rgba(107,76,42,.16),0 2px 6px rgba(60,40,10,.12);
    color:var(--brown);
    font:700 12px/1 var(--font-app);
    cursor:pointer;
    transition:transform var(--motion-press) var(--ease-standard),filter var(--motion-press) var(--ease-standard);
  }
  .cen-close::after{content:'';position:absolute;inset:-8px}
  .cen-close:hover{filter:brightness(1.03)}
  .cen-close:active{transform:scale(.94)}
  .cen-close:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  :global([data-theme='dark']) .cen-close,
  :global(.reader-modal.bg-dark) .cen-close{
    border-color:rgba(255,255,255,.2);
    background:linear-gradient(180deg,rgba(255,255,255,.16) 0%,rgba(255,255,255,.06) 100%);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.2),0 2px 6px rgba(0,0,0,.45);
    color:var(--text);
  }
  p{margin:0;font-family:var(--font-reader);font-size:var(--font-size-body);line-height:1.6;color:var(--text2);text-align:justify;overflow-wrap:anywhere}
</style>
