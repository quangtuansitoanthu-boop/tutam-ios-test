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

  $effect(() => {
    void contentId;
    const total = Math.max(1, Math.round(durationSeconds));
    remainingSeconds = total;
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

{#if notice && remainingSeconds > 0}
  <aside class={`content-experience-notice ${className}`} aria-label={notice.title}>
    <div class="cen-head">
      <span class="cen-icon" aria-hidden="true">📖</span>
      <strong>{notice.title}:</strong>
      <small class="cen-timer">{formatNoticeTimeout(remainingSeconds, locale.current)}</small>
    </div>
    <p><em>{notice.message}</em></p>
  </aside>
{/if}

<style>
  .content-experience-notice{position:relative;margin:calc(var(--space-page) * 0.6) var(--space-page);padding:12px 14px;background:color-mix(in srgb,var(--gold-light) 82%,var(--card));border:1px solid var(--border);border-left:3px solid var(--gold);border-radius:var(--radius-control);box-shadow:var(--shadow-sm);color:var(--text2);font-family:var(--font-app);flex-shrink:0}
  .cen-head{display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap}
  .cen-icon{font-size:14px;line-height:1}
  strong{color:var(--brown);font-size:var(--font-size-label);font-weight:700}
  :global([data-theme='dark']) strong{color:var(--gold2)}
  .cen-timer{margin-inline-start:auto;padding:2px 8px;border-radius:999px;background:var(--card);border:1px solid var(--border2);color:var(--muted);font-size:var(--font-size-meta);font-weight:600;line-height:1.4;font-variant-numeric:tabular-nums}
  p{margin:0;font-family:var(--font-reader);font-size:var(--font-size-body);line-height:1.6;color:var(--text2);text-align:justify;overflow-wrap:anywhere}
</style>
