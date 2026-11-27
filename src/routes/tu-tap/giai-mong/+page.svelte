<script lang="ts">
  import DreamInterpretationScreen from '$lib/components/practice/divination/DreamInterpretationScreen.svelte';
  import { getSessionContext } from '$lib/stores/session.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getDreamCopy } from '$lib/i18n/dream-ui';

  const session = getSessionContext();
  const locale = getLocaleContext();
  const copy = $derived(getDreamCopy(locale.current === 'en'));
  const principal = $derived(session.value.authenticated ? session.value.user?.id ?? null : null);
</script>

<svelte:head>
  <title>{copy.title} · Tu Tập Phật Pháp</title>
</svelte:head>

{#key principal}
  <DreamInterpretationScreen />
{/key}
