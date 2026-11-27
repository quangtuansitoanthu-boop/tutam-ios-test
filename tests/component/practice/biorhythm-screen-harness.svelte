<script lang="ts">
  import { setContext } from 'svelte';
  import { SESSION_CONTEXT } from '$lib/stores/session.svelte';
  import BiorhythmScreen from '$lib/components/practice/divination/BiorhythmScreen.svelte';

  let owner = $state('A');
  let resolved = $state(true);
  setContext(SESSION_CONTEXT, {
    get value() { return { authenticated: true, user: { id: owner, displayName: owner } }; },
    get initialResolutionComplete() { return resolved; },
  });
  export function selectUser(next: string): void { owner = next; }
  export function setReady(next: boolean): void { resolved = next; }
</script>

<BiorhythmScreen />
