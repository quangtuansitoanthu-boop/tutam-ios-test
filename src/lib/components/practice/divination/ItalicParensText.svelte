<script lang="ts">
  import { parseParentheticalSegments } from '$lib/domain/practice/divination';

  interface Props {
    text: string;
  }

  let { text }: Props = $props();
  const segments = $derived(parseParentheticalSegments(text));
</script>

{#each segments as seg, idx (idx)}{#if seg.italic}<em>{seg.text}</em>{:else}{seg.text}{/if}{/each}
