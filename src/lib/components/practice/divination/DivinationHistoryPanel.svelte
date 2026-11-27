<script lang="ts">
  import type { DivinationHistoryEntry } from '$lib/domain/practice/divination';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getDivinationCopy } from '$lib/i18n/divination-ui';

  interface Props {
    title: string;
    entries: DivinationHistoryEntry[];
    onSelectEntry?: (entry: DivinationHistoryEntry) => void;
    onClear: () => void;
  }

  let { title, entries, onSelectEntry, onClear }: Props = $props();
  const locale = getLocaleContext();
  const copy = $derived(getDivinationCopy(locale.current === 'en'));

  function formatTime(iso: string): string {
    try {
      return new Date(iso).toLocaleString(locale.current === 'en' ? 'en-GB' : 'vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }
</script>

<details class="div-history-panel">
  <summary class="div-history-summary">
    <span class="div-history-title">{title}</span>
    <span class="div-history-count">{entries.length}</span>
  </summary>

  <div class="div-history-body">
    <p class="div-history-local-note">{copy.historyLocalNote}</p>
    {#if entries.length === 0}
      <p class="div-history-empty">{copy.historyEmpty}</p>
    {:else}
      <ul class="div-history-list">
        {#each entries as entry (entry.id)}
          <li class="div-history-item">
            {#if onSelectEntry}
              <button type="button" class="div-history-row div-history-row--btn" onclick={() => onSelectEntry(entry)}>
                <div class="div-history-row-main">
                  <strong class="div-history-item-title">{entry.title}</strong>
                  <span class="div-history-item-meta">{entry.topicLabel} · {formatTime(entry.createdAt)}</span>
                  <span class="div-history-item-summary">{entry.summary}</span>
                </div>
                <span class="div-history-row-arrow" aria-hidden="true">→</span>
              </button>
            {:else}
              <div class="div-history-row">
                <div class="div-history-row-main">
                  <strong class="div-history-item-title">{entry.title}</strong>
                  <span class="div-history-item-meta">{entry.topicLabel} · {formatTime(entry.createdAt)}</span>
                  <span class="div-history-item-summary">{entry.summary}</span>
                </div>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
      <div class="div-history-actions">
        <button type="button" class="div-history-clear" onclick={onClear}>
          {copy.clearHistoryBtn}
        </button>
      </div>
    {/if}
  </div>
</details>

<style>
  .div-history-panel {
    margin-top: 16px;
    border-radius: var(--radius-card);
    border: 1px solid var(--border);
    background: var(--card);
    overflow: hidden;
  }
  .div-history-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 48px;
    padding: 10px 16px;
    cursor: pointer;
    list-style: none;
    font-family: var(--font-app);
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
  }
  .div-history-summary::-webkit-details-marker {
    display: none;
  }
  .div-history-count {
    min-width: 28px;
    height: 24px;
    padding: 0 8px;
    border-radius: 999px;
    background: var(--bg2);
    border: 1px solid var(--border2);
    font-size: 12px;
    font-weight: 700;
    color: var(--brown);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .div-history-body {
    padding: 0 16px 14px;
    border-top: 1px solid var(--border2);
  }
  .div-history-empty {
    margin: 12px 0 0;
    font-size: 13px;
    color: var(--muted);
    text-align: center;
  }
  .div-history-local-note {
    margin: 12px 0 0;
    font-size: var(--font-size-label, 13px);
    line-height: 1.5;
    color: var(--muted);
  }
  .div-history-list {
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .div-history-row {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--radius-control);
    border: 1px solid var(--border2);
    background: var(--bg2);
    text-align: left;
    font-family: var(--font-app);
    color: var(--text);
  }
  .div-history-row--btn {
    min-height: 48px;
    cursor: pointer;
    transition: border-color 0.15s ease, background-color 0.15s ease;
  }
  .div-history-row--btn:hover {
    border-color: var(--gold);
    background: var(--gold-light);
  }
  .div-history-row-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }
  .div-history-item-title {
    font-size: 13.5px;
    color: var(--text);
  }
  .div-history-item-meta {
    font-size: 11.5px;
    color: var(--muted);
  }
  .div-history-item-summary {
    font-size: 12.5px;
    color: var(--text2);
  }
  .div-history-row-arrow {
    font-size: 14px;
    font-weight: 700;
    color: var(--brown);
  }
  .div-history-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 10px;
  }
  .div-history-clear {
    min-height: 44px;
    padding: 8px 14px;
    border-radius: var(--radius-control);
    border: 1px solid var(--border);
    background: transparent;
    color: var(--danger-text);
    font-family: var(--font-app);
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }
  :global([data-theme='dark']) .div-history-count {
    color: var(--gold2);
  }
</style>
