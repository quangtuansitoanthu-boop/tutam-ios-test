<script lang="ts">
  import BiorhythmScreen from '$lib/components/practice/divination/BiorhythmScreen.svelte';
  import { getSessionContext } from '$lib/stores/session.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getBiorhythmCopy } from '$lib/i18n/biorhythm-ui';

  const session = getSessionContext();
  const locale = getLocaleContext();
  const principal = $derived(session.value.authenticated ? session.value.user?.id ?? null : null);
  const title = $derived(getBiorhythmCopy(locale.current === 'en').title);
</script>

<svelte:head>
  <title>{title} · Tu Tập Phật Pháp</title>
</svelte:head>

{#key principal}
  <BiorhythmScreen />
{/key}
