<script lang="ts">
  import { QueryClientProvider, type QueryClient } from '@tanstack/svelte-query';
  import MindfulCommunity from '$lib/components/practice/community/MindfulCommunity.svelte';
  let { client, canModerate = false }: { client: QueryClient; canModerate?: boolean } = $props();
</script>
<QueryClientProvider {client}>
  <MindfulCommunity principalId="A" {canModerate} nickname="Đồng Tu" />
</QueryClientProvider>
