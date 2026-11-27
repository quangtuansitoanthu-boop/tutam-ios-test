<script lang="ts">
  import type { createPersonalPracticeStorage } from '$lib/browser/personal-practice-storage';
  import PersonalJournal from './PersonalJournal.svelte';
  import type { Snippet } from 'svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { personalPracticeCopy } from '$lib/i18n/personal-practice-copy';
  import type { MindfulPostReceipt } from '$lib/contracts/mindful-community';
  interface Props {
    storage: ReturnType<typeof createPersonalPracticeStorage>;
    onShare?: (kind: 'repentance' | 'good_deed', content: string, nickname: string) => Promise<MindfulPostReceipt | void>;
    onSignIn?: () => void;
    community?: Snippet;
    initialCommunity?: boolean;
  }
  let { storage, onShare, onSignIn, community, initialCommunity = false }: Props = $props();
  const locale = getLocaleContext();
  const copy = $derived(personalPracticeCopy[locale.current === 'en' ? 'en' : 'vi']);
  let active = $state<'journal' | 'community'>('journal');
  $effect(() => { active = initialCommunity ? 'community' : 'journal'; });
  let journal = $state<{ preserveDraft: () => boolean }>();
  export function preserveDraft(): boolean {
    return journal?.preserveDraft() ?? true;
  }
</script>

<section class="personal-practice">
  {#if community}
    <nav class="personal-practice-nav" aria-label={copy.reflectionTab}>
      <button
        type="button"
        class="nav-tab"
        class:nav-tab--active={active === 'journal'}
        aria-pressed={active === 'journal'}
        onclick={() => active = 'journal'}
      >
        <span class="nav-tab-icon" aria-hidden="true">📖</span>
        <span>{copy.journal}</span>
      </button>
      <button
        type="button"
        class="nav-tab"
        class:nav-tab--active={active === 'community'}
        aria-pressed={active === 'community'}
        onclick={() => active = 'community'}
      >
        <span class="nav-tab-icon" aria-hidden="true">🪷</span>
        <span>{copy.communityTab}</span>
      </button>
    </nav>
  {/if}
  <div hidden={active !== 'journal'}><PersonalJournal bind:this={journal} {storage} {onShare} {onSignIn} /></div>
  {#if active === 'community' && community}{@render community()}{/if}
</section>

<style>
  .personal-practice {
    box-sizing: border-box;
    width: 100%;
    max-width: var(--practice-dialog-width, 960px);
    margin-inline: auto;
    padding-inline: max(16px, calc(var(--space-page) * 0.75));
    padding-bottom: calc(var(--space-page) * 2 + env(safe-area-inset-bottom, 0px));
    min-width: 0;
  }
  .personal-practice-nav {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: calc(var(--space-page) * 0.4);
    margin-bottom: var(--space-page);
  }
  .nav-tab {
    min-width: 0;
    min-height: 48px;
    padding: calc(var(--space-page) * 0.4) calc(var(--space-page) * 0.5);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--card);
    color: var(--text2);
    font: 700 var(--font-size-label)/1.4 var(--font-app);
    cursor: pointer;
    overflow-wrap: anywhere;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    box-shadow: var(--shadow-sm);
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
  }
  .nav-tab-icon {
    font-size: 1.1rem;
    flex-shrink: 0;
  }
  .nav-tab--active,
  .nav-tab[aria-pressed=true] {
    background: var(--gold-light);
    border-color: var(--gold);
    color: var(--brown, var(--text));
    box-shadow: var(--shadow-sm);
  }
  .nav-tab:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }
</style>
