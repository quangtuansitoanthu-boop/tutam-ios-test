<script lang="ts">
  import AppArtwork from '$lib/components/icons/AppArtwork.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { personalPracticeCopy } from '$lib/i18n/personal-practice-copy';

  let { onOpen }: { onOpen: () => void } = $props();
  const locale = getLocaleContext();
  const copy = $derived(personalPracticeCopy[locale.current === 'en' ? 'en' : 'vi']);
</script>

<button type="button" class="tt-mode-card tt-mode-card--rec" onclick={onOpen}>
  <div class="tt-mode-icon-wrap" aria-hidden="true"><AppArtwork name="practice" size={48} /></div>
  <div class="tt-mode-body"><span class="tt-mode-title">{copy.myRoutines}</span></div>
  <span class="tt-mode-arrow" aria-hidden="true">→</span>
</button>
