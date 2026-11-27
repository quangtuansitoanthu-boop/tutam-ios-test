<script lang="ts">
  import NativeUpdatePrompt from '$lib/components/layout/NativeUpdatePrompt.svelte';
  import NotificationPromptModal from '$lib/components/notifications/NotificationPromptModal.svelte';

  let startupReady = $state(false);
  let nativeUpdateBlocksPermission = $state(false);
  let notificationPromptVisible = $state(false);
  export function finishStartup() { startupReady = true; }
</script>

<!-- Root mounts the native watcher after its mounted flag changes. -->
<NotificationPromptModal
  {startupReady}
  blocked={nativeUpdateBlocksPermission}
  onActiveChange={(active) => { notificationPromptVisible = active; }}
/>
<NativeUpdatePrompt
  home={true}
  {startupReady}
  blocked={notificationPromptVisible}
  onPermissionBlockChange={(blocked) => { nativeUpdateBlocksPermission = blocked; }}
/>
