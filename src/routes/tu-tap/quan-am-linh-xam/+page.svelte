<script lang="ts">
  import QuanAmDivinationScreen from '$lib/components/practice/divination/QuanAmDivinationScreen.svelte';
  import { getSessionContext } from '$lib/stores/session.svelte';

  const session = getSessionContext();
  const principal = $derived(session.value.authenticated ? session.value.user?.id ?? null : null);
</script>

<svelte:head>
  <title>Quan Âm Linh Xăm · Tu Tập Phật Pháp</title>
</svelte:head>

{#key principal}
  <QuanAmDivinationScreen />
{/key}
