<script lang="ts">
  import { onMount } from 'svelte';
  import { Bird } from '@lucide/svelte';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { refugeReleaseBlocks, refugeReleaseCopy } from '$lib/i18n/refuge-release';
  import '$lib/styles/home-action-banner.css';

  const STORAGE_KEY = 'tutam_refuge_release_fontsize';
  const MIN_FONT_SIZE = 14;
  const MAX_FONT_SIZE = 32;
  const DEFAULT_FONT_SIZE = 18;

  const localeStore = getLocaleContext();
  const copy = $derived(refugeReleaseCopy[localeStore.current === 'en' ? 'en' : 'vi']);
  let open = $state(false);
  let fontSize = $state(DEFAULT_FONT_SIZE);

  onMount(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('tutam_read_fontsize');
      if (saved) {
        const val = Number(saved);
        if (!Number.isNaN(val) && val >= MIN_FONT_SIZE && val <= MAX_FONT_SIZE) {
          fontSize = val;
        }
      }
    } catch {}
  });

  function changeFontSize(delta: number) {
    fontSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, fontSize + delta));
    try {
      localStorage.setItem(STORAGE_KEY, String(fontSize));
    } catch {}
  }
</script>

<button
  class="pbb-compact refuge-release-banner"
  type="button"
  aria-haspopup="dialog"
  aria-expanded={open}
  onclick={() => open = true}
>
  <span class="pbb-compact-icon" aria-hidden="true"><Bird size={22} /></span>
  <span class="pbb-compact-title">{copy.title}</span>
  <span class="pbb-compact-arrow" aria-hidden="true">→</span>
</button>

{#if open}
  <dialog class="refuge-release-dialog" use:modalDialog aria-labelledby="refuge-release-title" oncancel={() => open = false} onclose={() => open = false}>
    <div class="ritual-shell">
      <header class="ritual-header">
        <h1 id="refuge-release-title" tabindex="-1" data-modal-focus>{copy.heading}</h1>
        <div class="ritual-header-actions">
          <div class="ritual-font-group" role="group" aria-label={copy.fontSize}>
            <button
              type="button"
              class="ritual-font-btn"
              aria-label={copy.decreaseFont}
              disabled={fontSize <= MIN_FONT_SIZE}
              onclick={() => changeFontSize(-2)}
            >A−</button>
            <span class="ritual-font-val" aria-live="polite" title={`${copy.fontSize}: ${fontSize}px`}>
              {fontSize}px
            </span>
            <button
              type="button"
              class="ritual-font-btn"
              aria-label={copy.increaseFont}
              disabled={fontSize >= MAX_FONT_SIZE}
              onclick={() => changeFontSize(2)}
            >A+</button>
          </div>
          <button type="button" class="ritual-close-btn" aria-label={copy.close} onclick={() => open = false}>×</button>
        </div>
      </header>
      <article class="ritual-content" lang="vi" style:--ritual-font-size="{fontSize}px">
        {#each refugeReleaseBlocks as block, index (index)}
          <svelte:element
            this={block.kind === 'heading' ? 'h2' : block.kind === 'step' ? 'h3' : 'p'}
            class="ritual-block"
            class:ritual-heading={block.kind === 'heading' || block.kind === 'step'}
            class:ritual-verse={block.kind === 'verse'}
          >
            {#each block.text.split(/(\([^)]*\))/u) as part, partIndex (partIndex)}
              {#if part.startsWith('(') && part.endsWith(')')}<em>{part}</em>{:else}{part}{/if}
            {/each}
          </svelte:element>
        {/each}
      </article>
    </div>
  </dialog>
{/if}

<style>
  .refuge-release-banner {
    margin-block-start: calc(var(--notice-padding) - var(--home-section-gap));
    background: linear-gradient(110deg, color-mix(in srgb, var(--practice-card-blue-start) 80%, var(--practice-card-blue-ink)), color-mix(in srgb, var(--practice-card-blue-end) 80%, var(--practice-card-blue-ink)));
    color: color-mix(in srgb, var(--practice-card-blue-ink) 50%, var(--on-gold));
    border-color: var(--practice-card-blue-start);
    box-shadow: var(--shadow);
  }
  .refuge-release-banner:hover { box-shadow: var(--shadow); }
  .refuge-release-banner .pbb-compact-title { white-space: normal; overflow: visible; }
  .refuge-release-banner .pbb-compact-arrow { color: inherit; }
  .refuge-release-dialog {
    margin: auto;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    background: var(--card);
    color: var(--text);
    width: min(var(--practice-dialog-width), calc(100% - var(--space-page) * 2));
    height: var(--practice-dialog-height);
    max-height: calc(100dvh - var(--space-page) * 2);
    overflow: hidden;
    box-shadow: var(--shadow-xl);
  }
  .refuge-release-dialog::backdrop { background: var(--practice-dialog-backdrop); }
  .ritual-shell { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .ritual-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: var(--notice-padding) var(--space-page);
    border-bottom: 1px solid var(--border);
    flex: none;
    min-height: 52px;
    box-sizing: border-box;
  }
  .ritual-header h1 {
    flex: 1;
    font-size: var(--font-size-card-title);
    text-align: left;
    line-height: 1.4;
    margin: 0;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ritual-header-actions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .ritual-font-group {
    display: inline-flex;
    align-items: center;
    height: 32px;
    box-sizing: border-box;
    padding: 0 2px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--bg2);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }
  .ritual-font-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: 13px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font: 700 11px var(--font-app);
    line-height: 1;
    transition: background 0.15s, color 0.15s, transform 0.12s;
  }
  .ritual-font-btn::after {
    content: '';
    position: absolute;
    inset: -6px;
  }
  .ritual-font-btn:hover:not(:disabled) {
    background: var(--gold-light);
    color: var(--gold);
  }
  .ritual-font-btn:active:not(:disabled) {
    transform: scale(0.92);
  }
  .ritual-font-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .ritual-font-btn:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 1px;
  }
  .ritual-font-val {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 30px;
    height: 16px;
    line-height: 16px;
    padding: 0 3px;
    border-left: 1px solid var(--border2);
    border-right: 1px solid var(--border2);
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    color: var(--gold);
    font-variant-numeric: tabular-nums;
    user-select: none;
  }
  .ritual-close-btn {
    position: relative;
    width: 32px;
    height: 32px;
    flex: none;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--bg2);
    color: var(--text);
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, color 0.15s;
  }
  .ritual-close-btn::after {
    content: '';
    position: absolute;
    inset: -6px;
  }
  .ritual-close-btn:hover {
    background: var(--gold-light);
    color: var(--gold);
  }
  .ritual-close-btn:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }
  .ritual-content {
    padding: var(--space-page);
    padding-bottom: calc(var(--space-page) + env(safe-area-inset-bottom));
    overflow-y: auto;
    min-height: 0;
    font-family: var(--font-reader);
    font-size: var(--ritual-font-size, var(--font-size-ritual-reading));
    font-weight: 400;
    line-height: 1.9;
    overflow-wrap: anywhere;
    overscroll-behavior: contain;
    transition: font-size 0.15s ease-out;
  }
  .ritual-block { text-align: justify; margin: 0 0 var(--space-page); }
  .ritual-heading { text-align: center; font-weight: 700; font-size: calc(var(--ritual-font-size, 18px) * 1.15); margin: var(--space-page) 0; }
  .ritual-heading:first-child { margin-top: 0; }
  .ritual-verse { text-align: center; white-space: pre-line; }
  em { font-style: italic; }
  @media (max-width: 600px) {
    .refuge-release-dialog { inset: 0; margin: 0; width: 100%; height: 100dvh; max-height: 100dvh; max-width: none; border-radius: 0; }
    .ritual-header {
      padding-top: calc(var(--notice-padding) + var(--app-safe-top));
      padding-inline: calc(var(--space-page) * 0.75);
      gap: 6px;
    }
    .ritual-header h1 {
      font-size: 13px;
    }
  }
</style>
