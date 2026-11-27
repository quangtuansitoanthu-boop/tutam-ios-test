<script lang="ts">
  import type { DreamEntry } from '$lib/domain/practice/dream-interpretation';
  import type { DreamCopy } from '$lib/i18n/dream-ui';
  import ItalicParensText from './ItalicParensText.svelte';

  interface Props {
    entry: DreamEntry;
    copy: DreamCopy;
    note: string;
    pending: boolean;
    status: string;
    canSave: boolean;
    storageError: boolean;
    onNote: (value: string) => void;
    onSave: () => void;
    onRetry: () => void;
  }
  let { entry, copy, note, pending, status, canSave, storageError, onNote, onSave, onRetry }: Props = $props();
  let readingPercent = $state(100);

  function changeReadingSize(delta: number): void {
    readingPercent = Math.max(100, Math.min(160, readingPercent + delta));
  }
</script>

<article class="dream-article div-card" aria-labelledby="dream-article-title" lang="vi" style:--dream-reading-scale={readingPercent / 100}>
  <header class="dream-sheet-hero">
    <span class="dream-reference">{copy.reference}</span>
    <h2 id="dream-article-title" class="dream-sheet-title" tabindex="-1">
      <ItalicParensText text={entry.title} />
    </h2>
    <p>
      <ItalicParensText text={entry.short} />
    </p>
  </header>
  <div class="dream-reading-controls" role="group" aria-label={copy.fontSize}>
    <span>{copy.fontSize}</span>
    <div class="dream-reading-buttons">
      <button
        type="button"
        class="div-btn"
        aria-label={copy.decreaseFontSize}
        disabled={readingPercent === 100}
        onclick={() => changeReadingSize(-10)}
      >A−</button>
      <output aria-label={copy.currentFontSize} aria-live="polite">{readingPercent}%</output>
      <button
        type="button"
        class="div-btn"
        aria-label={copy.increaseFontSize}
        disabled={readingPercent === 160}
        onclick={() => changeReadingSize(10)}
      >A+</button>
    </div>
  </div>
  <section class="dream-detail-section">
    <h3 class="div-section-accent-heading">{copy.overview}</h3>
    {#each entry.overview as paragraph, index (index)}
      <p>
        <ItalicParensText text={paragraph} />
      </p>
    {/each}
  </section>
  <section class="dream-detail-section">
    <h3 class="div-section-accent-heading">{copy.scenarios}</h3>
    {#each entry.scenarioGroups as group, groupIndex (groupIndex)}
      <div class="dream-scenarios-group">
        <h4>
          <ItalicParensText text={group.title} />
        </h4>
        {#each group.items as scenario, scenarioIndex (scenarioIndex)}
          <div class="dream-scenario-item">
            <h5>
              <ItalicParensText text={scenario.title} />
            </h5>
            {#each scenario.paragraphs as paragraph, index (index)}
              <p>
                <ItalicParensText text={paragraph} />
              </p>
            {/each}
          </div>
        {/each}
      </div>
    {/each}
  </section>
  <section class="dream-detail-section">
    <h3 class="div-section-accent-heading">{copy.buddhist}</h3>
    {#each entry.buddhist as paragraph, index (index)}
      <p>
        <ItalicParensText text={paragraph} />
      </p>
    {/each}
    {#each entry.scripture ?? [] as scripture, scriptureIndex (scriptureIndex)}
      <div class="dream-sutra-ref">
        <span class="dream-sutra-ref-label">{scripture.quotation ? copy.scriptureQuote : copy.scriptureParaphrase}</span>
        <h4>
          <ItalicParensText text={scripture.title} />
        </h4>
        {#each scripture.paragraphs as paragraph, index (index)}
          {#if scripture.quotation}
            <blockquote>
              <ItalicParensText text={paragraph} />
            </blockquote>
          {:else}
            <p>
              <ItalicParensText text={paragraph} />
            </p>
          {/if}
        {/each}
        <small>
          <ItalicParensText text={scripture.source} />
        </small>
      </div>
    {/each}
  </section>
  <section class="dream-detail-section">
    <h3 class="div-section-accent-heading">{copy.advice}</h3>
    {#each entry.advice as paragraph, index (index)}
      <p>
        <ItalicParensText text={paragraph} />
      </p>
    {/each}
    <p class="dream-disclaimer">
      <em>{copy.disclaimer}</em>
    </p>
  </section>
  <div class="dream-detail-section dream-note-form">
    <label for="dream-note-input">{copy.note}</label>
    <textarea
      id="dream-note-input"
      rows="3"
      maxlength="5000"
      value={note}
      placeholder={copy.notePlaceholder}
      oninput={(event) => onNote(event.currentTarget.value)}
    ></textarea>
    <button
      type="button"
      class="div-btn div-btn--primary div-btn--full"
      disabled={pending || !canSave}
      onclick={onSave}
    >
      {pending ? copy.saving : copy.save}
    </button>
    {#if storageError}
      <p role="alert">{copy.storageError}</p>
      <button type="button" class="div-btn" onclick={onRetry}>{copy.retry}</button>
    {/if}
    {#if status}
      <p class="div-toast" role="status">{status}</p>
    {/if}
  </div>
</article>
