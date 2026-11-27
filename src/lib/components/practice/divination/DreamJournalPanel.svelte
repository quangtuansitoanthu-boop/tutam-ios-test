<script lang="ts">
  import type { DreamJournalEntry } from '$lib/browser/spiritual-tools-storage';
  import type { DreamCopy } from '$lib/i18n/dream-ui';

  interface Props {
    entries: DreamJournalEntry[];
    copy: DreamCopy;
    isEnglish: boolean;
    loading: boolean;
    error: boolean;
    pending: boolean;
    onOpen: (entry: DreamJournalEntry) => void;
    onDelete: (id: string) => void;
    onClear: () => void;
    onRetry: () => void;
  }
  let { entries, copy, isEnglish, loading, error, pending, onOpen, onDelete, onClear, onRetry }: Props = $props();
  function formatTime(value: string): string {
    return new Intl.DateTimeFormat(isEnglish ? 'en-GB' : 'vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }
</script>

<details class="dream-history">
  <summary>
    <span>{copy.history}</span>
    <span>{entries.length}</span>
  </summary>
  <div class="dream-history-body">
    {#if loading}
      <p role="status">{copy.loading}</p>
    {:else if error}
      <p role="alert">{copy.storageError}</p>
      <button type="button" class="div-btn" onclick={onRetry}>{copy.retry}</button>
    {:else if entries.length === 0}
      <p>{copy.historyEmpty}</p>
    {:else}
      <p>{copy.historyHint}</p>
      <ul>
        {#each entries as entry (entry.id)}
          <li>
            <button type="button" class="dream-history-open" onclick={() => onOpen(entry)}>
              <strong>{entry.title}</strong>
              <time datetime={entry.createdAt}>{formatTime(entry.createdAt)}</time>
              {#if entry.note}
                <span class="dream-history-note">{entry.note}</span>
              {/if}
            </button>
            <button
              type="button"
              class="dream-history-delete"
              aria-label={`${copy.deleteEntry} · ${entry.title}`}
              disabled={pending}
              onclick={() => onDelete(entry.id)}
            >
              ✕
            </button>
          </li>
        {/each}
      </ul>
      <button type="button" class="div-btn" disabled={pending} onclick={onClear}>{copy.clearHistory}</button>
    {/if}
  </div>
</details>
