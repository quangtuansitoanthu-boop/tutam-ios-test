<script lang="ts">
  import MocLuanDivinationScreen from '$lib/components/practice/divination/MocLuanDivinationScreen.svelte';
  import { getSessionContext } from '$lib/stores/session.svelte';

  const session = getSessionContext();
  const principal = $derived(session.value.authenticated ? session.value.user?.id ?? null : null);
</script>

<svelte:head>
  <title>Mộc Luân Chiêm Sát · Tu Tập Phật Pháp</title>
</svelte:head>

{#key principal}
  <MocLuanDivinationScreen />
{/key}
