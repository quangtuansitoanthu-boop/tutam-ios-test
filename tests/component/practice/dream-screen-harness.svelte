<script lang="ts">
  import { setContext } from 'svelte';
  import { SESSION_CONTEXT } from '$lib/stores/session.svelte';
  import DreamInterpretationScreen from '$lib/components/practice/divination/DreamInterpretationScreen.svelte';

  let owner = $state('A');
  let identityReady = $state(true);
  setContext(SESSION_CONTEXT, {
    get value() { return { authenticated: true, user: { id: owner } }; },
    get initialResolutionComplete() { return identityReady; },
  });
  export function selectUser(next: string): void { owner = next; }
  export function setIdentityReady(next: boolean): void { identityReady = next; }
</script>

{#key owner}<DreamInterpretationScreen />{/key}
