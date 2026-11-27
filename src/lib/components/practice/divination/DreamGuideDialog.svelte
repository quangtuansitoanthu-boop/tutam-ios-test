<script lang="ts">
  import { modalDialog } from '$lib/browser/modal-dialog';
  import type { DreamCopy } from '$lib/i18n/dream-ui';
  let { copy, onClose }: { copy: DreamCopy; onClose: () => void } = $props();
</script>

<dialog
  class="dream-guide-dialog"
  use:modalDialog
  aria-labelledby="dream-guide-title"
  oncancel={(event) => {
    event.preventDefault();
    onClose();
  }}
  onclick={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}
>
  <header>
    <h2 id="dream-guide-title">{copy.guide} · {copy.title}</h2>
    <button
      type="button"
      class="dream-circle-button"
      aria-label={copy.close}
      onclick={onClose}
      data-modal-focus
    >
      ✕
    </button>
  </header>
  <div class="dream-guide-body">
    <p>{copy.guideIntro}</p>
    <p>{copy.guideSource}</p>
    <p>{copy.guideFaith}</p>
    <p>{copy.guideJournal}</p>
    <p>
      <em>{copy.disclaimer}</em>
    </p>
    {#if copy.vietnameseContent}
      <p>{copy.vietnameseContent}</p>
    {/if}
  </div>
  <footer>
    <button type="button" class="div-btn div-btn--primary" onclick={onClose}>{copy.close}</button>
  </footer>
</dialog>
