<script lang="ts">
  import type { MindfulPostReceipt } from '$lib/contracts/mindful-community';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { personalPracticeCopy } from '$lib/i18n/personal-practice-copy';

  let { receipt = null, compact = false, journal = false }: {
    receipt?: MindfulPostReceipt | null;
    compact?: boolean;
    journal?: boolean;
  } = $props();
  const detailsId = $props.id();
  const locale = getLocaleContext();
  const isEn = $derived(locale.current === 'en');
  const copy = $derived(personalPracticeCopy[isEn ? 'en' : 'vi']);
  const reviewState = $derived(receipt?.reviewState ?? 'legacy');
  const locked = $derived(receipt?.accountLocked === true);
  const negative = $derived(locked || reviewState === 'rejected' || reviewState === 'removed');
  const journalPending = $derived(journal && !negative && reviewState === 'pending' && receipt?.status !== 'removed');
  let expanded = $state(false);
  let detailsButton = $state<HTMLButtonElement>();

  export function focusDetails(): void {
    detailsButton?.focus();
  }

  const showDetails = $derived(negative || expanded);
  const title = $derived(locked ? copy.shareLocked : reviewState === 'pending' ? copy.sharePending
    : reviewState === 'rejected' ? copy.shareRejected : reviewState === 'removed' ? copy.shareRemoved
    : reviewState === 'auto_approved' ? copy.shareAutoApproved : reviewState === 'approved' ? copy.shareApproved
    : copy.shareReviewTitle);
  const automatedReason = $derived(reviewState === 'removed' && receipt?.policyCode
    && Object.prototype.hasOwnProperty.call(copy.sharePolicyReasons, receipt.policyCode)
    ? copy.sharePolicyReasons[receipt.policyCode] : null);
  const reason = $derived(automatedReason ?? (locked ? receipt?.accountLockReason ?? receipt?.reviewReason : receipt?.reviewReason));
  const due = $derived(reviewState === 'pending' && receipt?.reviewDueAt && Number.isFinite(Date.parse(receipt.reviewDueAt)) ? receipt.reviewDueAt : null);
  const submitted = $derived(receipt?.createdAt && Number.isFinite(Date.parse(receipt.createdAt)) ? receipt.createdAt : null);
  const dateFormat = $derived(new Intl.DateTimeFormat(locale.current === 'en' ? 'en-GB' : 'vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }));
</script>

<aside class="reflection-review-notice" class:compact class:negative class:journal-pending={journalPending} data-review-state={reviewState} aria-label={copy.shareReviewStatus}>
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    {#if locked}<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>
    {:else if reviewState === 'pending'}<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
    {:else}<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>{/if}
  </svg>
  <div class="notice-content">
    <div class="notice-head">
      <strong>{journalPending ? copy.sharePendingShort : title}</strong>
      {#if !negative}
        <button bind:this={detailsButton} type="button" class="notice-toggle" aria-expanded={expanded} aria-controls={detailsId} onclick={() => expanded = !expanded}>
          {expanded ? (isEn ? 'Hide' : 'Thu gọn') : (isEn ? 'Details' : 'Chi tiết')}
          {#if journalPending}
            <svg class="chevron" aria-hidden="true" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m4 6.5 5 5 5-5"/></svg>
          {/if}
        </button>
      {/if}
    </div>
    {#if !showDetails && !journalPending}
      <p class="notice-summary">{isEn ? 'Reviewed within 48h · Follow community guidelines.' : 'Duyệt trong 48 giờ · Tuân thủ quy định cộng đồng.'}</p>
    {/if}
    <div class="notice-details" id={detailsId} hidden={journalPending && !expanded}>
      {#if showDetails}
        {#if !compact || reviewState === 'pending'}<p>{copy.shareReviewDescription}</p>{/if}
        {#if reason}<p class="reason"><b>{copy.shareReason}:</b> {reason}</p>{/if}
        {#if locked}<p>{copy.shareLockedHint}</p>{/if}
        {#if (!compact && !journalPending) || locked}<p>{copy.sharePolicyWarning}</p>{/if}
      {/if}
      {#if receipt && (!journalPending || expanded)}
        {#if reviewState === 'pending'}<p>{copy.shareOwnPendingHint}</p>{/if}
        {#if negative}<p>{copy.sharePrivateKept}</p>{/if}
        {#if submitted || due}
          <dl>
            {#if submitted}<div><dt>{copy.shareSubmittedAt}</dt><dd><time datetime={submitted}>{dateFormat.format(new Date(submitted))}</time></dd></div>{/if}
            {#if due}<div><dt>{copy.shareDueAt}</dt><dd><time datetime={due}>{dateFormat.format(new Date(due))}</time></dd></div>{/if}
          </dl>
        {/if}
      {/if}
    </div>
  </div>
</aside>

<style>
  .reflection-review-notice{display:flex;align-items:flex-start;gap:calc(var(--space-page)*.6);padding:calc(var(--space-page)*.75) var(--space-page);margin-bottom:var(--space-page);border:1px solid var(--border);border-radius:var(--radius-card);background:var(--gold-light);color:var(--text);font-family:var(--font-app)}
  svg{width:20px;height:20px;flex:0 0 auto;margin-top:calc(var(--space-page)*.25);color:var(--brown)}
  .reflection-review-notice>div{min-width:0;flex:1}
  .notice-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
  strong{display:block;font-size:var(--font-size-label);line-height:1.4;overflow-wrap:anywhere}
  .notice-toggle{min-height:44px;min-width:44px;padding:0 10px;border:1px solid var(--border);border-radius:999px;background:var(--card);color:var(--brown);font-family:inherit;font-size:var(--font-size-meta);font-weight:700;cursor:pointer;flex-shrink:0}
  :global([data-theme='dark']) .notice-toggle{color:var(--gold2)}
  .notice-summary{margin:2px 0 0;font-size:var(--font-size-meta);color:var(--text2);line-height:1.4;text-align:left}
  p{margin:calc(var(--space-page)*.4) 0 0;color:var(--text2);font-size:var(--font-size-label);line-height:1.7;text-align:justify;overflow-wrap:anywhere}
  dl{display:grid;gap:calc(var(--space-page)*.25);margin:calc(var(--space-page)*.6) 0 0;font-size:var(--font-size-label);line-height:1.6}dl>div{display:flex;flex-wrap:wrap;gap:calc(var(--space-page)*.25) calc(var(--space-page)*.5)}dt{color:var(--text2)}dd{margin:0;font-weight:600;color:var(--brown);overflow-wrap:anywhere}
  .negative{border-color:color-mix(in srgb,var(--danger-text) 40%,var(--border));background:color-mix(in srgb,var(--danger-text) 5%,var(--card))}.negative svg,.negative strong{color:var(--danger-text)}
  .compact{margin:0 var(--space-page) var(--space-page)}.compact strong{font-size:var(--font-size-label)}

  .journal-pending {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0 calc(var(--space-page) * .4);
    padding: calc(var(--space-page) * .1) calc(var(--space-page) * .6);
    margin: 0 0 var(--dialog-action-space);
  }
  .journal-pending > svg { width: calc(var(--space-page) * .9); height: calc(var(--space-page) * .9); margin: 0; }
  :global([data-theme='dark']) .journal-pending > svg { color: var(--gold2); }
  .journal-pending .notice-content { display: contents; }
  .journal-pending strong { font-size: var(--font-size-body); }
  .journal-pending .notice-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: calc(var(--space-page) * .2);
    padding: 0 calc(var(--space-page) * .2);
    background: transparent;
    border: 0;
    color: var(--text2);
    font-size: var(--font-size-label);
    font-weight: 600;
  }
  .journal-pending .chevron { width: calc(var(--space-page) * .7); height: calc(var(--space-page) * .7); margin: 0; color: inherit; }
  .notice-toggle[aria-expanded='true'] .chevron { transform: rotate(180deg); }
  .journal-pending .notice-details {
    grid-column: 1 / -1;
    border-top: 1px solid var(--border);
    padding: calc(var(--space-page) * .4) 0 calc(var(--space-page) * .6);
  }
  .journal-pending p { margin: 0 0 calc(var(--space-page) * .4); font-size: var(--font-size-body); line-height: 1.55; }
  .journal-pending dl { margin: 0; font-size: var(--font-size-body); }
  .journal-pending dd { color: var(--text); }
</style>
