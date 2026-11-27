<script lang="ts">
  import { onMount, setContext, tick, untrack } from 'svelte';
  import { setQueryClientContext, type QueryClient } from '@tanstack/svelte-query';
  import { SESSION_CONTEXT } from '$lib/stores/session.svelte';
  import SiteHeader from '$lib/components/layout/SiteHeader.svelte';
  import PracticePreview from '$lib/components/practice/reader/PracticePreview.svelte';
  import type { PracticeArticleDetail } from '$lib/domain/practice/state';

  let { client, article }: { client: QueryClient; article: PracticeArticleDetail } = $props();
  let presenceMounted = $state(false);
  let screen = $state<'catalog' | 'preview'>('catalog');
  let currentSection = $state<'KINH PHẬT' | null>('KINH PHẬT');
  let currentArticle = $state<PracticeArticleDetail | null>(null);
  let currentChapterIndex = $state<number | null>(null);

  setQueryClientContext(untrack(() => client));
  setContext(SESSION_CONTEXT, { get initialResolutionComplete() { return true; } });

  onMount(() => {
    presenceMounted = true;
  });

  // Mirrors src/routes/tu-tap/+page.svelte catalog header ownership effect.
  $effect(() => {
    if (!presenceMounted || screen !== 'catalog' || !currentSection) return;
    let disposed = false;
    let published = false;
    void (async () => {
      await tick();
      if (disposed) return;
      document.dispatchEvent(new CustomEvent('qts:practice-header', {
        detail: {
          active: true,
          owner: 'practice-catalog',
          title: 'Tu tập',
          onBack: () => { currentSection = null; }
        }
      }));
      published = true;
    })();
    return () => {
      disposed = true;
      if (published) document.dispatchEvent(new CustomEvent('qts:practice-header', { detail: { active: false, owner: 'practice-catalog' } }));
    };
  });

  export function openPreview() {
    currentArticle = article;
    currentChapterIndex = null;
    screen = 'preview';
  }

  export function backToCatalog() {
    currentArticle = null;
    currentChapterIndex = null;
    screen = 'catalog';
  }
</script>

<SiteHeader currentPath="/tu-tap" theme="light" session={{ authenticated: false, user: null }} />

{#if screen === 'preview' && currentArticle}
  <PracticePreview
    article={currentArticle}
    chapterContent={null}
    chapters={[{ index: 0, title: 'Quyển 1', summary: '' }]}
    currentChapterIndex={currentChapterIndex}
    onBack={backToCatalog}
    onChapterOpen={(idx) => { currentChapterIndex = idx; }}
    onChapterClose={() => { currentChapterIndex = null; }}
    onStartPractice={() => {}}
  />
{/if}
