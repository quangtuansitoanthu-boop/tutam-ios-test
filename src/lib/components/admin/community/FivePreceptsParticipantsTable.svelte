<script lang="ts">
  import type { ParticipationRow } from '$lib/contracts/practice-participation';
  import PreceptsParticipantsTable from './PreceptsParticipantsTable.svelte';

  interface Props {
    participants: ParticipationRow[];
    onRefresh?: () => void;
    busy?: boolean;
  }

  let { participants = [], onRefresh, busy = false }: Props = $props();
</script>

<PreceptsParticipantsTable
  moduleKey="five"
  {participants}
  {onRefresh}
  {busy}
/>
