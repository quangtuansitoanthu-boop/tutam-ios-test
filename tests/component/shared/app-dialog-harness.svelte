<script lang="ts">
  import AppDialogHost from '$lib/components/layout/AppDialogHost.svelte';
  import AudioMiniPlayer from '$lib/components/audio/AudioMiniPlayer.svelte';
  import { setLocaleContext } from '$lib/stores/locale.svelte';

  let { showAudio = false }: { showAudio?: boolean } = $props();
  setLocaleContext('vi');
</script>

<button type="button" data-dialog-opener>Mở hộp thoại</button>
<AppDialogHost />
{#if showAudio}<AudioMiniPlayer />{/if}
